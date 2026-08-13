"""El grafo de negociación: un thread por conversación proveedor × licitación.

    interpretar → normalizar → decidir → expresar → guardrails → persistir

Cada nodo hace UNA cosa y las fronteras no se cruzan:

* `interpretar` y `expresar` son los únicos que ven un LLM.
* `normalizar` es una función pura de la librería `normalizador/`.
* `decidir` es Python puro (`politica.decidir`) — ningún precio sale de un modelo.
* `persistir` es el único que escribe el estado del negocio.

El "pausa / reanuda" no se programa: es el checkpoint de LangGraph. El
proveedor contesta tres horas después, n8n postea, se invoca el grafo con el
mismo `thread_id` y sigue exactamente donde estaba.

`interrupt()` aparece en UN solo lugar de este archivo (condición fuera de
política). El otro interrupt del sistema — la aprobación final de la
licitación — vive en el supervisor, porque no pertenece a una conversación.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, Any, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from normalizador import ItemCrudo, Requerido, normalizar, similitud_lexica
from normalizador.tipos import ProductoCatalogo

from . import eventos
from .catalogo import buscar_candidatos
from .config import cfg
from .db import conexion, consultar, ejecutar, uno
from .guardrails import verificar
from .llm import Interpretacion, ItemInterpretado, obtener_llm, plantilla
from .politica import Accion, Contexto, Movida, PoliticaCondiciones, decidir

log = logging.getLogger(__name__)

# Piso para asignar un ítem del mensaje a un ítem del pliego. Por debajo, el
# mensaje se manda a excepción humana en vez de adivinar a qué se refería.
UMBRAL_ASIGNACION = 0.55


def _ultimo(a: Any, b: Any) -> Any:
    return b if b is not None else a


class Estado(TypedDict, total=False):
    """Estado del grafo. Todo JSON-serializable: lo persiste el checkpointer."""

    thread_id: str
    licitacion_id: int
    proveedor_id: int
    telefono: str
    canal: str
    message_id: str
    texto: str
    interpretacion: Annotated[dict, _ultimo]
    normalizados: Annotated[list, _ultimo]
    movidas: Annotated[list, _ultimo]
    burbujas: Annotated[list, _ultimo]
    resolucion_humana: Annotated[dict, _ultimo]
    resumen: Annotated[dict, _ultimo]


# ── Contexto de la conversación ─────────────────────────────────────────────


def cotizaciones_abiertas(conn, thread_id: str) -> list[dict]:
    """Ítems que le pedimos a este proveedor en esta licitación, con su sobre."""
    return consultar(
        conn,
        """
        select c.id as cotizacion_id, c.estado, c.counters_hechos, c.proveedor_id,
               i.id as item_id, i.producto_id, i.descripcion_original,
               i.presentacion_requerida, i.cantidad,
               i.precio_max_aceptable, i.precio_objetivo,
               l.id as licitacion_id, l.cierre_recoleccion, l.estado as estado_licitacion,
               cm.droga, cm.concentracion, cm.forma, cm.presentacion,
               cm.unidades_por_presentacion
          from cotizaciones c
          join items_licitacion i on i.id = c.item_id
          join licitaciones l on l.id = i.licitacion_id
          left join catalogo_maestro cm on cm.id = i.producto_id
         where c.thread_id = %s
           and c.estado not in ('descartada','vencida')
         order by i.orden nulls last, i.id
        """,
        (thread_id,),
    )


def cargar_tono(conn) -> dict:
    """Tono del agente desde la DB (conducta = data, no código)."""
    defaults = {"nombre": "Compras", "rol": "responsable de compras de una droguería", "tono": "directo y cordial"}
    if not cfg().agente_id:
        return defaults
    fila = uno(conn, "select nombre, rol, tono, persona from agentes where id = %s", (cfg().agente_id,))
    if not fila:
        return defaults
    return {
        "nombre": fila.get("nombre") or defaults["nombre"],
        "rol": fila.get("rol") or defaults["rol"],
        "tono": fila.get("tono") or defaults["tono"],
    }


def cargar_patrones_bloqueo(conn) -> list[str]:
    if not cfg().agente_id:
        return []
    filas = consultar(
        conn,
        "select patron_bloqueo from guardrails where agente_id = %s and activo and patron_bloqueo is not null",
        (cfg().agente_id,),
    )
    return [f["patron_bloqueo"] for f in filas]


# ── Nodos ───────────────────────────────────────────────────────────────────


def nodo_interpretar(estado: Estado) -> dict:
    """LLM barato: texto libre → estructura. No calcula nada."""
    with conexion() as conn:
        abiertas = cotizaciones_abiertas(conn, estado["thread_id"])
    contexto = [
        {
            "droga": c.get("droga"),
            "concentracion": c.get("concentracion"),
            "forma": c.get("forma"),
            "presentacion_requerida": c.get("presentacion_requerida"),
            "descripcion": c.get("descripcion_original"),
        }
        for c in abiertas
    ]
    try:
        interpretacion = obtener_llm().interpretar(estado.get("texto", ""), contexto)
    except Exception as e:  # el modelo falló: no se adivina, se escala
        log.exception("falló interpretar")
        return {"interpretacion": {"intencion": "error", "items": [], "error": str(e)}}
    return {"interpretacion": interpretacion.como_dict()}


def _requerido_de(fila: dict) -> Requerido:
    return Requerido(
        item_id=int(fila["item_id"]),
        producto_id=fila.get("producto_id"),
        descripcion_original=fila["descripcion_original"],
        presentacion_requerida=fila["presentacion_requerida"],
        unidades_requeridas=fila.get("unidades_por_presentacion"),
        forma=fila.get("forma"),
        concentracion=fila.get("concentracion"),
    )


def _asignar_a_item(texto_producto: str, abiertas: list[dict]) -> dict | None:
    """A cuál de los ítems pedidos se refiere este pedazo del mensaje.

    Se puntúa contra el producto de catálogo de cada ítem abierto. Si ninguno
    llega al umbral, devuelve None y el ítem termina en excepción: preferimos
    una excepción a asignarle un precio al ítem equivocado.
    """
    mejor, mejor_score = None, 0.0
    for fila in abiertas:
        if not fila.get("droga"):
            continue
        producto = ProductoCatalogo(
            id=int(fila["producto_id"]),
            droga=fila["droga"],
            concentracion=fila["concentracion"],
            forma=fila["forma"],
            presentacion=fila["presentacion"],
            unidades_por_presentacion=int(fila["unidades_por_presentacion"]),
        )
        score = similitud_lexica(texto_producto, producto)
        if score > mejor_score:
            mejor, mejor_score = fila, score
    return mejor if mejor_score >= UMBRAL_ASIGNACION else None


def nodo_normalizar(estado: Estado) -> dict:
    """Función pura + acceso a catálogo. Acá se hace TODA la aritmética."""
    interpretacion = estado.get("interpretacion") or {}
    items = interpretacion.get("items") or []

    with conexion() as conn:
        abiertas = cotizaciones_abiertas(conn, estado["thread_id"])
        ids_contexto = [int(c["producto_id"]) for c in abiertas if c.get("producto_id")]

        salida: list[dict] = []
        for crudo in items:
            fila = _asignar_a_item(crudo.get("texto_producto", ""), abiertas)
            candidatos = buscar_candidatos(conn, crudo.get("texto_producto", ""), ids_contexto)
            resultado = normalizar(
                ItemCrudo(
                    texto_producto=crudo.get("texto_producto", ""),
                    precio_texto=crudo.get("precio_texto"),
                    unidad_texto=crudo.get("unidad_texto"),
                    condiciones=crudo.get("condiciones") or {},
                ),
                candidatos,
                _requerido_de(fila) if fila else None,
            )
            salida.append(
                {
                    "cotizacion_id": fila["cotizacion_id"] if fila else None,
                    "item_id": fila["item_id"] if fila else None,
                    "producto_id": resultado.producto_id,
                    "precio_unitario": str(resultado.precio_unitario) if resultado.precio_unitario is not None else None,
                    "precio_por_presentacion": (
                        str(resultado.precio_por_presentacion) if resultado.precio_por_presentacion is not None else None
                    ),
                    "presentacion": resultado.presentacion,
                    "unidades": resultado.unidades_por_presentacion,
                    "confianza": resultado.confianza,
                    "conversion_exacta": resultado.conversion_exacta,
                    "presentacion_igual": resultado.presentacion_igual_a_requerida,
                    "motivos": list(resultado.motivos),
                    "condiciones": crudo.get("condiciones") or {},
                    "raw": crudo.get("texto_producto", ""),
                    "producto_legible": _legible(fila),
                    "presentacion_requerida": fila["presentacion_requerida"] if fila else None,
                }
            )
    return {"normalizados": salida}


def _legible(fila: dict | None) -> str:
    if not fila:
        return "ese ítem"
    if fila.get("droga"):
        return f"{fila['droga']} {fila['concentracion']}"
    return fila.get("descripcion_original") or "ese ítem"


def nodo_decidir(estado: Estado) -> dict:
    """Código puro. El único nodo que produce números para el presupuesto."""
    ahora = datetime.now(timezone.utc)
    normalizados = estado.get("normalizados") or []
    interpretacion = estado.get("interpretacion") or {}
    intencion = interpretacion.get("intencion", "otro")

    with conexion() as conn:
        abiertas = {c["cotizacion_id"]: c for c in cotizaciones_abiertas(conn, estado["thread_id"])}

    # Mensaje que no se pudo interpretar, o que no habla de ningún ítem pedido:
    # no se inventa una respuesta, va a la cola humana.
    if intencion == "error" or (not normalizados and intencion not in ("sin_stock", "aclaracion", "otro")):
        return {
            "movidas": [
                {
                    "accion": Accion.ESCALAR_HUMANO.value,
                    "estado": "excepcion_humana",
                    "motivo": "no se pudo interpretar el mensaje",
                    "cotizacion_id": None,
                    "producto": "ese ítem",
                }
            ]
        }

    # Sin stock / "te confirmo más tarde": aplica a todos los ítems abiertos.
    if not normalizados:
        movidas = []
        for cot in abiertas.values():
            m = decidir(_contexto(None, cot, intencion, ahora))
            movidas.append(_movida_dict(m, cot, None))
        return {"movidas": movidas}

    movidas: list[dict] = []
    for norm in normalizados:
        cot = abiertas.get(norm.get("cotizacion_id"))
        if cot is None:
            movidas.append(
                {
                    "accion": Accion.ESCALAR_HUMANO.value,
                    "estado": "excepcion_humana",
                    "motivo": "el proveedor cotizó algo que no se le pidió o no se pudo identificar",
                    "cotizacion_id": None,
                    "producto": norm.get("raw") or "ese ítem",
                    "datos": {"normalizado": norm},
                }
            )
            continue
        m = decidir(_contexto(norm, cot, intencion, ahora))
        movidas.append(_movida_dict(m, cot, norm))

    # ── El único interrupt de este archivo ──────────────────────────────
    pendientes = [m for m in movidas if m["accion"] == Accion.ESCALAR_HUMANO.value]
    if pendientes and not estado.get("resolucion_humana"):
        _abrir_excepciones(estado, pendientes)
        decision = interrupt(
            {
                "tipo": "condicion_fuera_de_politica",
                "thread_id": estado["thread_id"],
                "texto_proveedor": estado.get("texto"),
                "movidas": pendientes,
            }
        )
        return {"movidas": _aplicar_decision_humana(movidas, decision), "resolucion_humana": decision or {}}

    return {"movidas": movidas}


def _contexto(norm: dict | None, cot: dict, intencion: str, ahora: datetime) -> Contexto:
    return Contexto(
        intencion=intencion,
        confianza=float(norm["confianza"]) if norm else 0.0,
        precio_unitario=Decimal(norm["precio_unitario"]) if norm and norm.get("precio_unitario") else None,
        precio_objetivo=cot.get("precio_objetivo"),
        precio_max_aceptable=cot.get("precio_max_aceptable"),
        ahora=ahora,
        cierre_recoleccion=cot["cierre_recoleccion"],
        counters_hechos=int(cot.get("counters_hechos") or 0),
        condiciones=(norm or {}).get("condiciones") or {},
        presentacion_igual_a_requerida=bool((norm or {}).get("presentacion_igual", True)),
        conversion_exacta=bool((norm or {}).get("conversion_exacta", True)),
        motivos_normalizador=tuple((norm or {}).get("motivos") or ()),
        politica_condiciones=PoliticaCondiciones(),
    )


def _movida_dict(m: Movida, cot: dict, norm: dict | None) -> dict:
    return {
        "accion": m.accion.value,
        "estado": m.estado,
        "motivo": m.motivo,
        "precio_contraoferta": str(m.precio_contraoferta) if m.precio_contraoferta is not None else None,
        "pregunta": m.pregunta.value if m.pregunta else None,
        "datos": m.datos,
        "cotizacion_id": cot["cotizacion_id"],
        "item_id": cot["item_id"],
        "licitacion_id": cot["licitacion_id"],
        "producto": _legible(cot),
        "presentacion_requerida": cot.get("presentacion_requerida"),
        "normalizado": norm,
    }


def _abrir_excepciones(estado: Estado, pendientes: list[dict]) -> None:
    """Proyecta el interrupt a la tabla `excepciones` para que el panel lo vea.

    Además marca la cotización como `excepcion_humana` acá mismo, y no en
    `persistir`: cuando el grafo interrumpe, `persistir` NO llega a correr. Si
    no se marcara acá, la celda quedaría "esperando respuesta" en la matriz y
    el cierre de recolección la vencería — perdiendo una cotización que en
    realidad estaba esperando a una persona, no al proveedor.

    Idempotente: al reanudar, LangGraph vuelve a ejecutar el nodo desde el
    principio, así que no puede duplicar filas.
    """
    with conexion() as conn:
        for m in pendientes:
            if m.get("cotizacion_id"):
                norm = m.get("normalizado") or {}
                ejecutar(
                    conn,
                    """update cotizaciones
                          set estado = 'excepcion_humana',
                              raw_respuesta = coalesce(%s, raw_respuesta),
                              condiciones = case when %s::jsonb = '{}'::jsonb
                                                 then condiciones else %s::jsonb end,
                              confianza = coalesce(%s, confianza),
                              respondida_en = coalesce(respondida_en, now())
                        where id = %s""",
                    (
                        estado.get("texto"),
                        json.dumps(norm.get("condiciones") or {}, ensure_ascii=False),
                        json.dumps(norm.get("condiciones") or {}, ensure_ascii=False),
                        norm.get("confianza"),
                        m["cotizacion_id"],
                    ),
                )
            ya = uno(
                conn,
                """select id from excepciones
                    where thread_id = %s and estado = 'pendiente'
                      and coalesce(cotizacion_id, 0) = coalesce(%s, 0)""",
                (estado["thread_id"], m.get("cotizacion_id")),
            )
            if ya:
                continue
            ejecutar(
                conn,
                """insert into excepciones
                     (licitacion_id, cotizacion_id, thread_id, tipo, motivo, contexto)
                   values (%s, %s, %s, %s, %s, %s::jsonb)""",
                (
                    m.get("licitacion_id") or estado.get("licitacion_id"),
                    m.get("cotizacion_id"),
                    estado["thread_id"],
                    "condicion_fuera_de_politica",
                    m.get("motivo", "condición fuera de política"),
                    json.dumps(
                        {"texto_proveedor": estado.get("texto"), "movida": m},
                        ensure_ascii=False,
                        default=str,
                    ),
                ),
            )
            eventos.registrar(
                conn,
                eventos.COTIZACION_EXCEPCION,
                licitacion_id=m.get("licitacion_id") or estado.get("licitacion_id"),
                cotizacion_id=m.get("cotizacion_id"),
                payload={"motivo": m.get("motivo"), "texto": estado.get("texto")},
            )


def _aplicar_decision_humana(movidas: list[dict], decision: Any) -> list[dict]:
    """Traduce lo que eligió el operador en el panel a movidas concretas.

    `decision` = {"accion": "aceptar"|"descartar"|"clarificar", "cotizacion_id": N?}
    Sin decisión válida, la movida queda como excepción (no se destraba sola).
    """
    if not isinstance(decision, dict):
        return movidas
    elegida = str(decision.get("accion") or "").lower()
    if elegida not in {a.value for a in Accion}:
        return movidas
    objetivo = decision.get("cotizacion_id")
    estados = {
        Accion.ACEPTAR.value: "confirmada",
        Accion.DESCARTAR.value: "descartada",
        Accion.CLARIFICAR.value: "aclarando",
        Accion.MARCAR_SIN_STOCK.value: "sin_stock",
        Accion.AGRADECER.value: "esperando",
    }
    salida = []
    for m in movidas:
        if m["accion"] != Accion.ESCALAR_HUMANO.value:
            salida.append(m)
            continue
        if objetivo is not None and m.get("cotizacion_id") != objetivo:
            salida.append(m)
            continue
        nueva = dict(m)
        nueva["accion"] = elegida
        nueva["estado"] = estados.get(elegida, m["estado"])
        nueva["motivo"] = f"resuelto por un humano: {decision.get('motivo') or elegida}"
        nueva["resuelto_por_humano"] = True
        salida.append(nueva)
    return salida


def nodo_expresar(estado: Estado) -> dict:
    """LLM principal: movida estructurada → mensaje con el tono del agente."""
    movidas = estado.get("movidas") or []
    # Las movidas que quedaron en manos de un humano no generan mensaje: el
    # sistema no le contesta al proveedor hasta que el operador resuelva.
    a_responder = [m for m in movidas if m["accion"] != Accion.ESCALAR_HUMANO.value]
    if not a_responder:
        return {"burbujas": []}

    with conexion() as conn:
        tono = cargar_tono(conn)
    try:
        burbujas = obtener_llm().expresar(a_responder, tono)
    except Exception:
        log.exception("falló expresar; se usan plantillas")
        burbujas = [plantilla(m) for m in a_responder]
    return {"burbujas": burbujas}


def nodo_guardrails(estado: Estado) -> dict:
    """Regex + el chequeo duro: ningún número que no venga de `decidir()`."""
    burbujas = estado.get("burbujas") or []
    movidas = [m for m in (estado.get("movidas") or []) if m["accion"] != Accion.ESCALAR_HUMANO.value]
    if not burbujas:
        return {"burbujas": []}

    # Números permitidos = los que produjo `decidir()` + los que ya estaban en
    # el pliego (la concentración del producto y la presentación pedida). Todo
    # lo demás que aparezca en el mensaje es un número inventado por el modelo.
    permitidos: set[str] = set()
    for m in movidas:
        if m.get("precio_contraoferta"):
            permitidos.add(str(m["precio_contraoferta"]))
        permitidos.update(re.findall(r"\d+", m.get("presentacion_requerida") or ""))
        permitidos.update(re.findall(r"\d+", m.get("producto") or ""))

    with conexion() as conn:
        patrones = cargar_patrones_bloqueo(conn)

    limpias: list[str] = []
    for burbuja in burbujas:
        v = verificar(burbuja, permitidos, patrones)
        if v.ok:
            limpias.append(burbuja)
        else:
            log.warning("guardrail bloqueó una burbuja (%s); se usa plantilla", v.motivo)
            limpias = [plantilla(m) for m in movidas]
            break
    return {"burbujas": limpias}


def nodo_persistir(estado: Estado) -> dict:
    """Escribe el estado del negocio y devuelve el resumen para n8n."""
    movidas = estado.get("movidas") or []
    confirmadas = descartadas = aclaraciones = excepciones_abiertas = 0

    with conexion() as conn:
        for m in movidas:
            cotizacion_id = m.get("cotizacion_id")
            norm = m.get("normalizado") or {}
            if cotizacion_id is None:
                excepciones_abiertas += 1
                continue

            ejecutar(
                conn,
                """
                update cotizaciones set
                    estado = %(estado)s,
                    precio_unitario = coalesce(%(precio_unitario)s, precio_unitario),
                    precio_por_presentacion = coalesce(%(precio_pres)s, precio_por_presentacion),
                    presentacion_ofrecida = coalesce(%(presentacion)s, presentacion_ofrecida),
                    unidades_ofrecidas = coalesce(%(unidades)s, unidades_ofrecidas),
                    condiciones = case when %(condiciones)s::jsonb = '{}'::jsonb
                                       then condiciones else %(condiciones)s::jsonb end,
                    confianza = coalesce(%(confianza)s, confianza),
                    canal = coalesce(%(canal)s, canal),
                    raw_respuesta = coalesce(%(raw)s, raw_respuesta),
                    respondida_en = coalesce(respondida_en, now()),
                    counters_hechos = counters_hechos + %(suma_counter)s
                 where id = %(id)s
                """,
                {
                    "id": cotizacion_id,
                    "estado": m["estado"],
                    "precio_unitario": norm.get("precio_unitario"),
                    "precio_pres": norm.get("precio_por_presentacion"),
                    "presentacion": norm.get("presentacion"),
                    "unidades": norm.get("unidades"),
                    "condiciones": json.dumps(norm.get("condiciones") or {}, ensure_ascii=False),
                    "confianza": norm.get("confianza"),
                    "canal": estado.get("canal"),
                    "raw": estado.get("texto"),
                    "suma_counter": 1 if m["accion"] == Accion.COUNTER.value else 0,
                },
            )

            tipo = {
                Accion.ACEPTAR.value: eventos.COTIZACION_CONFIRMADA,
                Accion.CLARIFICAR.value: eventos.COTIZACION_AMBIGUA,
                Accion.COUNTER.value: eventos.CONTRAOFERTA_ENVIADA,
                Accion.DESCARTAR.value: eventos.COTIZACION_DESCARTADA,
                Accion.MARCAR_SIN_STOCK.value: eventos.COTIZACION_SIN_STOCK,
                Accion.ESCALAR_HUMANO.value: eventos.COTIZACION_EXCEPCION,
            }.get(m["accion"], eventos.RESPUESTA_RECIBIDA)

            eventos.registrar(
                conn,
                tipo,
                licitacion_id=m.get("licitacion_id") or estado.get("licitacion_id"),
                cotizacion_id=cotizacion_id,
                payload={
                    "motivo": m.get("motivo"),
                    "accion": m["accion"],
                    "precio_unitario": norm.get("precio_unitario"),
                    "confianza": norm.get("confianza"),
                    "raw": estado.get("texto"),
                    "resuelto_por_humano": m.get("resuelto_por_humano", False),
                },
            )

            if m["accion"] == Accion.ACEPTAR.value:
                confirmadas += 1
            elif m["accion"] == Accion.DESCARTAR.value:
                descartadas += 1
            elif m["accion"] == Accion.CLARIFICAR.value:
                aclaraciones += 1
            elif m["accion"] == Accion.ESCALAR_HUMANO.value:
                excepciones_abiertas += 1

    return {
        "resumen": {
            "confirmadas": confirmadas,
            "descartadas": descartadas,
            "aclaraciones": aclaraciones,
            "excepciones": excepciones_abiertas,
            "movidas": [
                {"cotizacion_id": m.get("cotizacion_id"), "accion": m["accion"], "motivo": m.get("motivo")}
                for m in movidas
            ],
        }
    }


# ── Ensamblado ──────────────────────────────────────────────────────────────


def construir(checkpointer=None):
    g = StateGraph(Estado)
    g.add_node("interpretar", nodo_interpretar)
    g.add_node("normalizar", nodo_normalizar)
    g.add_node("decidir", nodo_decidir)
    g.add_node("expresar", nodo_expresar)
    g.add_node("guardrails", nodo_guardrails)
    g.add_node("persistir", nodo_persistir)

    g.add_edge(START, "interpretar")
    g.add_edge("interpretar", "normalizar")
    g.add_edge("normalizar", "decidir")
    g.add_edge("decidir", "expresar")
    g.add_edge("expresar", "guardrails")
    g.add_edge("guardrails", "persistir")
    g.add_edge("persistir", END)

    return g.compile(checkpointer=checkpointer)
