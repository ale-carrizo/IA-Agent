"""Supervisor: el reloj del sistema. CERO LLM.

Hace tres cosas, todas determinísticas:

1. **Crear la licitación** — matchea los ítems del pliego contra el catálogo,
   arma las cotizaciones cruzando ítems × proveedores que venden eso, y
   dispara UN mensaje por proveedor (agrupando todos sus ítems).
2. **`/tick`** (cada 5 min desde un scheduler de n8n) — recordatorios,
   escalaciones por deadline y cierre de la recolección.
3. **Cerrar** — al llegar `cierre_recoleccion`, pasa la licitación a
   `auditando` y corre la auditoría.

Nada de esto necesita un modelo, así que no lo usa: es un cron con SQL.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import httpx
from psycopg import Connection

from normalizador import ProductoCatalogo, similitud_lexica
from normalizador.core import SIMILITUD_MINIMA

from . import eventos
from .config import cfg
from .db import conexion, consultar, ejecutar, uno

log = logging.getLogger(__name__)


# ── Salida a canales: SIEMPRE vía n8n ───────────────────────────────────────


def enviar(telefono: str, burbujas: list[str], *, canal: str = "whatsapp", meta: dict | None = None) -> bool:
    """Postea a n8n, que resuelve el transporte (Botmaker / Kapso / WA Cloud).

    El servicio nunca habla con un canal directo: esa frontera es la que
    permite cambiar de proveedor de WhatsApp sin tocar la negociación.
    """
    if not burbujas:
        return True
    url = cfg().n8n_salida_url
    if not url:
        log.warning("N8N_SALIDA_URL sin configurar: no se envió a %s (%s)", telefono, burbujas)
        return False
    try:
        r = httpx.post(
            url,
            json={"telefono_e164": telefono, "canal": canal, "burbujas": burbujas, "meta": meta or {}},
            headers={"x-token": cfg().n8n_token} if cfg().n8n_token else {},
            timeout=20,
        )
        r.raise_for_status()
        return True
    except Exception:
        log.exception("no se pudo postear la salida a n8n")
        return False


# ── 1. Crear licitación ─────────────────────────────────────────────────────


def _catalogo(conn: Connection) -> list[ProductoCatalogo]:
    filas = consultar(
        conn,
        """select id, droga, concentracion, forma, presentacion,
                  unidades_por_presentacion, codigo_externo
             from catalogo_maestro where activo""",
    )
    return [
        ProductoCatalogo(
            id=int(f["id"]),
            droga=f["droga"],
            concentracion=f["concentracion"],
            forma=f["forma"],
            presentacion=f["presentacion"],
            unidades_por_presentacion=int(f["unidades_por_presentacion"]),
            codigo_externo=f.get("codigo_externo"),
        )
        for f in filas
    ]


def matchear_producto(descripcion: str, presentacion: str, catalogo: list[ProductoCatalogo]) -> ProductoCatalogo | None:
    """Producto de catálogo para una línea del pliego, o None → excepción.

    Un ítem sin match NO se pide a nadie: se marca y lo resuelve un humano
    antes de que salga un solo mensaje. Pedir precio de algo que no sabemos
    qué es genera respuestas que después no se pueden comparar.
    """
    texto = f"{descripcion} {presentacion}"
    mejor, score = None, 0.0
    for p in catalogo:
        s = similitud_lexica(texto, p)
        # Desempate por presentación: mismo producto, distinta caja.
        if s == score and mejor is not None and presentacion.strip().lower() == p.presentacion.strip().lower():
            mejor = p
        elif s > score:
            mejor, score = p, s
    return mejor if score >= SIMILITUD_MINIMA else None


def _sobre(ultimo_precio: Decimal | None) -> tuple[Decimal | None, Decimal | None]:
    """El sobre por defecto: histórico × factor. El humano lo pisa en el panel."""
    if ultimo_precio is None:
        return None, None
    maximo = (ultimo_precio * cfg().factor_precio_max).quantize(Decimal("0.01"))
    objetivo = (ultimo_precio * cfg().factor_precio_objetivo).quantize(Decimal("0.01"))
    return maximo, objetivo


def crear_licitacion(payload: dict) -> dict:
    """POST /licitaciones. Crea todo y dispara los primeros mensajes."""
    hospital = (payload.get("hospital") or "").strip()
    if not hospital:
        raise ValueError("falta hospital")
    items = payload.get("items") or []
    if not items:
        raise ValueError("la licitación no tiene ítems")

    cierre_presentacion = _fecha(payload.get("cierre_presentacion") or payload.get("cierre"))
    cierre_recoleccion = _fecha(payload.get("cierre_recoleccion")) or (
        cierre_presentacion - timedelta(hours=2) if cierre_presentacion else None
    )
    if not cierre_presentacion or not cierre_recoleccion:
        raise ValueError("faltan las fechas de cierre")
    margen = Decimal(str(payload.get("margen_pct", payload.get("margen", 0))))

    with conexion() as conn:
        fila = uno(
            conn,
            """insert into licitaciones
                 (hospital, expediente, cierre_presentacion, cierre_recoleccion, margen_pct, estado)
               values (%s, %s, %s, %s, %s, 'recolectando') returning id""",
            (hospital, payload.get("expediente"), cierre_presentacion, cierre_recoleccion, margen),
        )
        licitacion_id = int(fila["id"])
        catalogo = _catalogo(conn)

        sin_match: list[dict] = []
        item_ids: list[int] = []
        for orden, it in enumerate(items, start=1):
            descripcion = (it.get("descripcion") or it.get("descripcion_original") or "").strip()
            presentacion = (it.get("presentacion") or it.get("presentacion_requerida") or "").strip()
            cantidad = int(it.get("cantidad") or 0)
            if not descripcion or cantidad <= 0:
                raise ValueError(f"ítem inválido en la posición {orden}")

            producto = matchear_producto(descripcion, presentacion, catalogo)
            f = uno(
                conn,
                """insert into items_licitacion
                     (licitacion_id, producto_id, descripcion_original, cantidad,
                      presentacion_requerida, orden)
                   values (%s, %s, %s, %s, %s, %s) returning id""",
                (
                    licitacion_id,
                    producto.id if producto else None,
                    descripcion,
                    cantidad,
                    presentacion or (producto.presentacion if producto else "sin especificar"),
                    orden,
                ),
            )
            item_id = int(f["id"])
            item_ids.append(item_id)

            if producto is None:
                sin_match.append({"item_id": item_id, "descripcion": descripcion})
                ejecutar(
                    conn,
                    """insert into excepciones
                         (licitacion_id, thread_id, tipo, motivo, contexto)
                       values (%s, %s, 'item_sin_match', %s, %s::jsonb)""",
                    (
                        licitacion_id,
                        str(uuid.uuid4()),
                        f"'{descripcion}' no matcheó ningún producto del catálogo",
                        json.dumps({"item_id": item_id, "descripcion": descripcion, "presentacion": presentacion}),
                    ),
                )
                continue

            # El sobre sale del histórico de cada proveedor para ese producto.
            precios = consultar(
                conn,
                "select ultimo_precio from proveedores_items where producto_id = %s and ultimo_precio is not null",
                (producto.id,),
            )
            referencia = min((p["ultimo_precio"] for p in precios), default=None)
            maximo, objetivo = _sobre(referencia)
            if it.get("precio_max_aceptable") is not None:
                maximo = Decimal(str(it["precio_max_aceptable"]))
            if it.get("precio_objetivo") is not None:
                objetivo = Decimal(str(it["precio_objetivo"]))
            ejecutar(
                conn,
                "update items_licitacion set precio_max_aceptable = %s, precio_objetivo = %s where id = %s",
                (maximo, objetivo, item_id),
            )

        # ── Cotizaciones: ítems × proveedores que venden ese producto ──
        creadas = consultar(
            conn,
            """
            insert into cotizaciones (item_id, proveedor_id, estado)
            select i.id, pi.proveedor_id, 'pendiente'
              from items_licitacion i
              join proveedores_items pi on pi.producto_id = i.producto_id
              join proveedores p on p.id = pi.proveedor_id and p.activo
             where i.licitacion_id = %s and i.producto_id is not null
            on conflict (item_id, proveedor_id) do nothing
            returning id, proveedor_id
            """,
            (licitacion_id,),
        )

        # Un thread por (proveedor × licitación): la conversación es una sola.
        proveedores = sorted({int(c["proveedor_id"]) for c in creadas})
        for proveedor_id in proveedores:
            ejecutar(
                conn,
                """update cotizaciones set thread_id = %s
                    from items_licitacion i
                   where cotizaciones.item_id = i.id
                     and i.licitacion_id = %s
                     and cotizaciones.proveedor_id = %s
                     and cotizaciones.thread_id is null""",
                (str(uuid.uuid4()), licitacion_id, proveedor_id),
            )

        eventos.registrar(
            conn,
            eventos.LICITACION_CREADA,
            licitacion_id=licitacion_id,
            payload={
                "hospital": hospital,
                "items": len(item_ids),
                "cotizaciones": len(creadas),
                "proveedores": len(proveedores),
                "sin_match": sin_match,
            },
        )

    enviados = enviar_primeros_mensajes(licitacion_id)

    return {
        "licitacion_id": licitacion_id,
        "items": len(item_ids),
        "cotizaciones": len(creadas),
        "proveedores": len(proveedores),
        "mensajes_enviados": enviados,
        "items_sin_match": sin_match,
    }


def _fecha(valor) -> datetime | None:
    if valor is None:
        return None
    if isinstance(valor, datetime):
        return valor if valor.tzinfo else valor.replace(tzinfo=timezone.utc)
    texto = str(valor).strip().replace("Z", "+00:00")
    try:
        d = datetime.fromisoformat(texto)
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


# ── Primer mensaje: uno por proveedor, con TODOS sus ítems ──────────────────


def _pedido_por_proveedor(conn: Connection, licitacion_id: int, estados: tuple[str, ...]) -> dict[int, dict]:
    filas = consultar(
        conn,
        """
        select c.id as cotizacion_id, c.proveedor_id, c.thread_id, c.estado,
               p.telefono_e164, p.nombre as proveedor, p.canal_preferido,
               i.cantidad, i.presentacion_requerida, i.descripcion_original,
               cm.droga, cm.concentracion, cm.forma
          from cotizaciones c
          join items_licitacion i on i.id = c.item_id
          join proveedores p on p.id = c.proveedor_id
          left join catalogo_maestro cm on cm.id = i.producto_id
         where i.licitacion_id = %s and c.estado = any(%s)
         order by c.proveedor_id, i.orden nulls last, i.id
        """,
        (licitacion_id, list(estados)),
    )
    agrupado: dict[int, dict] = {}
    for f in filas:
        g = agrupado.setdefault(
            int(f["proveedor_id"]),
            {
                "telefono": f["telefono_e164"],
                "proveedor": f["proveedor"],
                "canal": f["canal_preferido"] or "whatsapp",
                "thread_id": str(f["thread_id"]) if f["thread_id"] else None,
                "cotizaciones": [],
                "lineas": [],
            },
        )
        g["cotizaciones"].append(int(f["cotizacion_id"]))
        nombre = f"{f['droga']} {f['concentracion']}" if f.get("droga") else f["descripcion_original"]
        g["lineas"].append(f"• {nombre} — {f['cantidad']} u ({f['presentacion_requerida']})")
    return agrupado


def enviar_primeros_mensajes(licitacion_id: int) -> int:
    """Un mensaje por proveedor con todos sus ítems agrupados."""
    enviados = 0
    with conexion() as conn:
        lic = uno(conn, "select hospital, cierre_recoleccion from licitaciones where id = %s", (licitacion_id,))
        agrupado = _pedido_por_proveedor(conn, licitacion_id, ("pendiente",))

    for proveedor_id, g in agrupado.items():
        hora = lic["cierre_recoleccion"].strftime("%H:%M") if lic else ""
        cuerpo = (
            f"Hola! Necesito precios para una licitación de {lic['hospital']}.\n"
            + "\n".join(g["lineas"])
            + f"\n¿Me pasás precio y stock antes de las {hora}? Gracias!"
        )
        ok = enviar(g["telefono"], [cuerpo], canal=g["canal"], meta={"licitacion_id": licitacion_id, "thread_id": g["thread_id"]})
        with conexion() as conn:
            ejecutar(
                conn,
                """update cotizaciones set estado = 'solicitada', solicitada_en = now()
                    where id = any(%s) and estado = 'pendiente'""",
                (g["cotizaciones"],),
            )
            for cid in g["cotizaciones"]:
                eventos.registrar(
                    conn,
                    eventos.COTIZACION_SOLICITADA,
                    licitacion_id=licitacion_id,
                    cotizacion_id=cid,
                    payload={"proveedor": g["proveedor"], "enviado": ok},
                )
        enviados += 1 if ok else 0
    return enviados


# ── 2. /tick ────────────────────────────────────────────────────────────────


def tick(ahora: datetime | None = None) -> dict:
    """Supervisor periódico. Idempotente: correrlo de más no rompe nada."""
    ahora = ahora or datetime.now(timezone.utc)
    resultado = {"recordatorios": 0, "escalaciones": 0, "cerradas": [], "licitaciones_activas": 0}

    with conexion() as conn:
        activas = consultar(
            conn,
            """select id, hospital, cierre_recoleccion from licitaciones
                where estado in ('abierta','recolectando') order by cierre_recoleccion""",
        )
    resultado["licitaciones_activas"] = len(activas)

    for lic in activas:
        licitacion_id = int(lic["id"])
        if ahora >= lic["cierre_recoleccion"]:
            resultado["cerradas"].append(cerrar_recoleccion(licitacion_id, ahora))
            continue
        resultado["recordatorios"] += _recordatorios(licitacion_id, ahora)
        resultado["escalaciones"] += _escalaciones(licitacion_id, lic["cierre_recoleccion"], ahora)

    return resultado


def _recordatorios(licitacion_id: int, ahora: datetime) -> int:
    limite = ahora - timedelta(minutes=cfg().minutos_sin_respuesta)
    with conexion() as conn:
        pendientes = consultar(
            conn,
            """
            select c.id, c.proveedor_id, p.telefono_e164, p.canal_preferido
              from cotizaciones c
              join items_licitacion i on i.id = c.item_id
              join proveedores p on p.id = c.proveedor_id
             where i.licitacion_id = %s
               and c.estado in ('solicitada','esperando','aclarando')
               and c.recordatorios_enviados < %s
               and coalesce(c.solicitada_en, c.actualizado) < %s
               and c.respondida_en is null
            """,
            (licitacion_id, cfg().max_recordatorios, limite),
        )
    if not pendientes:
        return 0

    por_proveedor: dict[int, dict] = {}
    for c in pendientes:
        g = por_proveedor.setdefault(
            int(c["proveedor_id"]),
            {"telefono": c["telefono_e164"], "canal": c["canal_preferido"] or "whatsapp", "ids": []},
        )
        g["ids"].append(int(c["id"]))

    enviados = 0
    for g in por_proveedor.values():
        ok = enviar(
            g["telefono"],
            ["Hola! ¿Pudiste ver los precios que te pasé? Los necesito para cerrar hoy."],
            canal=g["canal"],
            meta={"licitacion_id": licitacion_id, "tipo": "recordatorio"},
        )
        with conexion() as conn:
            ejecutar(
                conn,
                "update cotizaciones set recordatorios_enviados = recordatorios_enviados + 1 where id = any(%s)",
                (g["ids"],),
            )
            for cid in g["ids"]:
                eventos.registrar(
                    conn,
                    eventos.RECORDATORIO_ENVIADO,
                    licitacion_id=licitacion_id,
                    cotizacion_id=cid,
                    payload={"enviado": ok},
                )
        enviados += len(g["ids"]) if ok else 0
    return enviados


def _escalaciones(licitacion_id: int, cierre: datetime, ahora: datetime) -> int:
    """Cerca del cierre y sin respuesta → evento `escalacion.voz`.

    V1: el panel lo muestra como tarea manual ("llamalo"). V2: el mismo evento
    dispara Vapi/Retell contra este mismo servicio. Por eso es un evento y no
    una llamada directa.
    """
    if cierre - ahora > timedelta(hours=cfg().horas_escalacion_voz):
        return 0
    with conexion() as conn:
        candidatas = consultar(
            conn,
            """
            select c.id, p.nombre as proveedor, p.telefono_e164
              from cotizaciones c
              join items_licitacion i on i.id = c.item_id
              join proveedores p on p.id = c.proveedor_id
             where i.licitacion_id = %s
               and c.estado in ('solicitada','esperando','aclarando')
               and not exists (
                     select 1 from eventos e
                      where e.cotizacion_id = c.id and e.tipo = %s)
            """,
            (licitacion_id, eventos.ESCALACION_VOZ),
        )
        for c in candidatas:
            eventos.registrar(
                conn,
                eventos.ESCALACION_VOZ,
                licitacion_id=licitacion_id,
                cotizacion_id=int(c["id"]),
                payload={
                    "proveedor": c["proveedor"],
                    "telefono": c["telefono_e164"],
                    "motivo": f"sin respuesta a menos de {cfg().horas_escalacion_voz} h del cierre",
                },
            )
    return len(candidatas)


# ── 3. Cierre de recolección ────────────────────────────────────────────────


def cerrar_recoleccion(licitacion_id: int, ahora: datetime | None = None) -> dict:
    """Corta la recolección, vence lo que quedó abierto y corre la auditoría."""
    from .auditoria import auditar  # import tardío: auditoria importa supervisor

    ahora = ahora or datetime.now(timezone.utc)
    with conexion() as conn:
        vencidas = ejecutar(
            conn,
            """update cotizaciones set estado = 'vencida'
                from items_licitacion i
               where cotizaciones.item_id = i.id
                 and i.licitacion_id = %s
                 and cotizaciones.estado in ('pendiente','solicitada','esperando','aclarando')""",
            (licitacion_id,),
        )
        ejecutar(conn, "update licitaciones set estado = 'auditando' where id = %s", (licitacion_id,))
        eventos.registrar(
            conn,
            eventos.RECOLECCION_CERRADA,
            licitacion_id=licitacion_id,
            payload={"cotizaciones_vencidas": vencidas, "cerrada_en": ahora.isoformat()},
        )

    informe = auditar(licitacion_id)
    return {"licitacion_id": licitacion_id, "vencidas": vencidas, "auditoria": informe}
