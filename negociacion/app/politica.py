"""`decidir()` — la política de negociación. Python puro, SIN LLM.

Este es el archivo que hace que el sistema sea auditable. El principio
(arquitectura Pactum/Walmart, §3 del brief):

    El LLM nunca decide. Solo traduce.

El negocio define el "sobre" (`precio_objetivo`, `precio_max_aceptable` por
ítem) y acá se decide cada movida dentro de ese sobre. Un LLM interpreta el
mensaje que entra y redacta el que sale, pero **ningún número de un
presupuesto pasa por un modelo**: sale de esta función.

Propiedades que se testean en `tests/test_politica.py`:
  · función pura: sin reloj propio (`ahora` es argumento), sin I/O, sin estado
  · total: todo contexto cae en exactamente una rama, y siempre hay motivo
  · conservadora: ante la duda, CLARIFICAR o ESCALAR — nunca ACEPTAR
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal
from enum import Enum

from normalizador import UMBRAL_CONFIANZA

__all__ = [
    "Accion",
    "Contexto",
    "Movida",
    "PoliticaCondiciones",
    "decidir",
    "VENTANA_CONTRAOFERTA",
]

# Con menos de esto para el cierre de recolección, no se regatea: un contra-
# oferta que no llega a tiempo vale menos que un precio aceptable en mano.
VENTANA_CONTRAOFERTA = timedelta(hours=2)

# Un solo intento de contraoferta por cotización (§6 del brief).
MAX_COUNTERS = 1


class Accion(str, Enum):
    ACEPTAR = "aceptar"
    CLARIFICAR = "clarificar"
    COUNTER = "counter"
    DESCARTAR = "descartar"
    MARCAR_SIN_STOCK = "marcar_sin_stock"
    ESCALAR_HUMANO = "escalar_humano"
    AGRADECER = "agradecer"


# Qué hay que preguntar cuando la acción es CLARIFICAR. Es un enum, no una
# frase: la frase la escribe `expresar` con el tono del agente.
class Pregunta(str, Enum):
    UNIDADES_POR_PRESENTACION = "unidades_por_presentacion"
    PRECIO_POR_UNIDAD = "precio_por_unidad"
    PRECIO_ILEGIBLE = "precio_ilegible"
    CONFIRMAR_PRODUCTO = "confirmar_producto"
    CONFIRMAR_PRESENTACION = "confirmar_presentacion"


@dataclass(frozen=True)
class PoliticaCondiciones:
    """El sobre en materia de condiciones comerciales (no de precio).

    Todo lo que no entra acá va a `interrupt()` → cola humana. Es adrede: las
    condiciones son donde se esconden los costos que no están en el precio.
    """

    dias_pago_minimo: int = 30        # plazo de pago estándar de la droguería
    dias_vencimiento_minimo: int = 180
    permite_entrega_parcial: bool = False
    claves_conocidas: frozenset[str] = frozenset({"pago", "vencimiento", "entrega", "flete", "minimo"})


@dataclass(frozen=True)
class Contexto:
    """Todo lo que `decidir()` necesita saber. Nada más, nada menos.

    Si algún día una decisión necesita un dato nuevo, tiene que entrar por acá
    — no leerse de la base adentro de la función.
    """

    intencion: str                              # precio | aclaracion | sin_stock | condicion | otro
    confianza: float
    precio_unitario: Decimal | None
    precio_objetivo: Decimal | None
    precio_max_aceptable: Decimal | None
    ahora: datetime
    cierre_recoleccion: datetime
    counters_hechos: int = 0
    condiciones: dict = field(default_factory=dict)
    presentacion_igual_a_requerida: bool = True
    conversion_exacta: bool = True
    motivos_normalizador: tuple[str, ...] = ()
    politica_condiciones: PoliticaCondiciones = PoliticaCondiciones()


@dataclass(frozen=True)
class Movida:
    """La decisión. `estado` es el que se escribe en `cotizaciones.estado`."""

    accion: Accion
    estado: str
    motivo: str
    precio_contraoferta: Decimal | None = None
    pregunta: Pregunta | None = None
    datos: dict = field(default_factory=dict)

    @property
    def requiere_humano(self) -> bool:
        return self.accion is Accion.ESCALAR_HUMANO


# ── Condiciones comerciales ─────────────────────────────────────────────────

_RE_DIAS = re.compile(r"(\d+)\s*d[ií]as?")
_MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}


def _dias_de_pago(valor: object) -> int | None:
    """'7 días' → 7 · 'contado' → 0 · cualquier otra cosa → None (no legible)."""
    if isinstance(valor, (int, float)):
        return int(valor)
    texto = str(valor or "").strip().lower()
    if not texto:
        return None
    if "contado" in texto or "anticipado" in texto:
        return 0
    m = _RE_DIAS.search(texto)
    return int(m.group(1)) if m else None


def _dias_hasta_vencimiento(valor: object, ahora: datetime) -> int | None:
    """Días desde `ahora` hasta el vencimiento declarado.

    Acepta 'AAAA-MM-DD', 'MM/AAAA' y nombre de mes CON año ('junio 2027').
    Un mes suelto ('vence en junio') devuelve None a propósito: puede ser el
    junio que viene o el de dentro de dos años, y la diferencia decide si el
    lote sirve o no. Eso se pregunta, no se estima.
    """
    texto = str(valor or "").strip().lower()
    if not texto:
        return None

    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", texto)
    if m:
        try:
            fecha = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), tzinfo=ahora.tzinfo)
        except ValueError:
            return None
        return (fecha - ahora).days

    m = re.search(r"(\d{1,2})\s*/\s*(\d{4})", texto)
    if m:
        mes, anio = int(m.group(1)), int(m.group(2))
        if not 1 <= mes <= 12:
            return None
        return (datetime(anio, mes, 1, tzinfo=ahora.tzinfo) - ahora).days

    m_anio = re.search(r"(20\d{2})", texto)
    if m_anio:
        for nombre, mes in _MESES.items():
            if nombre in texto:
                return (datetime(int(m_anio.group(1)), mes, 1, tzinfo=ahora.tzinfo) - ahora).days
    return None


def evaluar_condiciones(condiciones: dict, politica: PoliticaCondiciones, ahora: datetime) -> list[str]:
    """Devuelve los motivos por los que las condiciones se van del sobre.

    Lista vacía = todo estándar. Cualquier motivo = a la cola humana.
    Una condición que no se entiende cuenta como fuera de política: no se
    ignora ni se asume favorable.
    """
    motivos: list[str] = []
    for clave, valor in (condiciones or {}).items():
        k = str(clave).strip().lower()

        if k not in politica.claves_conocidas:
            motivos.append(f"condición no contemplada por la política: '{clave}: {valor}'")
            continue

        if k == "pago":
            dias = _dias_de_pago(valor)
            if dias is None:
                motivos.append(f"plazo de pago no interpretable: '{valor}'")
            elif dias < politica.dias_pago_minimo:
                motivos.append(
                    f"pide pago a {dias} días y el estándar es {politica.dias_pago_minimo}"
                )
        elif k == "vencimiento":
            dias = _dias_hasta_vencimiento(valor, ahora)
            if dias is None:
                motivos.append(f"vencimiento no interpretable: '{valor}'")
            elif dias < politica.dias_vencimiento_minimo:
                motivos.append(
                    f"vence en {dias} días y el mínimo es {politica.dias_vencimiento_minimo}"
                )
        elif k == "entrega":
            texto = str(valor).lower()
            if "parcial" in texto and not politica.permite_entrega_parcial:
                motivos.append(f"entrega parcial: '{valor}'")
        elif k in ("flete", "minimo"):
            motivos.append(f"condición comercial extra: '{clave}: {valor}'")
    return motivos


# ── La política ─────────────────────────────────────────────────────────────


def decidir(ctx: Contexto) -> Movida:
    """Contexto → movida. Determinística, total y sin efectos.

    El orden de las ramas NO es arbitrario:
      1. sin stock      — no hay precio que evaluar
      2. sin precio      — nada que decidir todavía
      3. confianza baja  — antes que cualquier cuenta: no se opera sobre un
                           dato que no entendimos
      4. condiciones     — un precio bárbaro con una condición mala sigue
                           siendo una mala compra
      5. sobre indefinido— sin `precio_max_aceptable` no hay política que
                           aplicar; decide un humano
      6. escalera de precio
    """
    # 1 ── Sin stock
    if ctx.intencion == "sin_stock":
        return Movida(
            accion=Accion.MARCAR_SIN_STOCK,
            estado="sin_stock",
            motivo="el proveedor no tiene stock",
        )

    # 2 ── Todavía no hay precio sobre la mesa
    if ctx.intencion in ("aclaracion", "otro") and ctx.precio_unitario is None:
        return Movida(
            accion=Accion.AGRADECER,
            estado="esperando",
            motivo="el mensaje no trae precio; se sigue esperando",
        )

    # 3 ── ¿Entendimos lo que dijo?
    if ctx.precio_unitario is None:
        return Movida(
            accion=Accion.CLARIFICAR,
            estado="aclarando",
            motivo="no se pudo determinar el precio unitario",
            pregunta=_que_preguntar(ctx),
            datos={"motivos": list(ctx.motivos_normalizador)},
        )

    if ctx.confianza < UMBRAL_CONFIANZA:
        return Movida(
            accion=Accion.CLARIFICAR,
            estado="aclarando",
            motivo=f"confianza {ctx.confianza:.2f} < {UMBRAL_CONFIANZA}",
            pregunta=_que_preguntar(ctx),
            datos={"motivos": list(ctx.motivos_normalizador)},
        )

    # 4 ── Condiciones comerciales
    motivos_cond = evaluar_condiciones(ctx.condiciones, ctx.politica_condiciones, ctx.ahora)
    if motivos_cond:
        return Movida(
            accion=Accion.ESCALAR_HUMANO,
            estado="excepcion_humana",
            motivo="; ".join(motivos_cond),
            datos={"condiciones": dict(ctx.condiciones), "motivos": motivos_cond},
        )

    # 5 ── ¿Hay sobre?
    if ctx.precio_max_aceptable is None:
        return Movida(
            accion=Accion.ESCALAR_HUMANO,
            estado="excepcion_humana",
            motivo="el ítem no tiene precio máximo aceptable cargado: no hay política que aplicar",
            datos={"precio_unitario": str(ctx.precio_unitario)},
        )

    # 6 ── Escalera de precio
    precio = ctx.precio_unitario
    objetivo = ctx.precio_objetivo
    techo = ctx.precio_max_aceptable
    hay_tiempo = (ctx.cierre_recoleccion - ctx.ahora) > VENTANA_CONTRAOFERTA
    puede_contraofertar = ctx.counters_hechos < MAX_COUNTERS

    if objetivo is not None and precio <= objetivo:
        return Movida(
            accion=Accion.ACEPTAR,
            estado="confirmada",
            motivo=f"{precio} ≤ objetivo {objetivo}",
            datos={"precio_unitario": str(precio)},
        )

    if precio <= techo:
        if hay_tiempo and puede_contraofertar and objetivo is not None and objetivo < precio:
            return Movida(
                accion=Accion.COUNTER,
                estado="esperando",
                motivo=f"{precio} entra en el sobre pero hay {_horas(ctx)} h para pedir {objetivo}",
                precio_contraoferta=objetivo,
                datos={"precio_ofrecido": str(precio)},
            )
        return Movida(
            accion=Accion.ACEPTAR,
            estado="confirmada",
            motivo=f"{precio} ≤ máximo aceptable {techo}",
            datos={"precio_unitario": str(precio)},
        )

    # precio > techo
    if puede_contraofertar:
        contraoferta = objetivo if objetivo is not None else techo
        return Movida(
            accion=Accion.COUNTER,
            estado="esperando",
            motivo=f"{precio} supera el máximo {techo}: se contraoferta {contraoferta} (único intento)",
            precio_contraoferta=contraoferta,
            datos={"precio_ofrecido": str(precio)},
        )

    return Movida(
        accion=Accion.DESCARTAR,
        estado="descartada",
        motivo=f"{precio} supera el máximo {techo} y ya se contraofertó una vez",
        datos={"precio_ofrecido": str(precio)},
    )


def _horas(ctx: Contexto) -> str:
    return f"{(ctx.cierre_recoleccion - ctx.ahora).total_seconds() / 3600:.1f}"


def _que_preguntar(ctx: Contexto) -> Pregunta:
    """Traduce el motivo del normalizador en QUÉ preguntar.

    Devuelve un enum, no una frase: la redacción es tarea de `expresar`, con
    el tono que el agente tenga configurado en la base.
    """
    motivos = " ".join(ctx.motivos_normalizador).lower()
    if "no se pudo leer el precio" in motivos:
        return Pregunta.PRECIO_ILEGIBLE
    if "sin decir de cuántas unidades" in motivos or "por unidad o por presentación" in motivos:
        return Pregunta.UNIDADES_POR_PRESENTACION
    if "producto distinto" in motivos or "concentración" in motivos or "forma" in motivos:
        return Pregunta.CONFIRMAR_PRODUCTO
    if not ctx.presentacion_igual_a_requerida:
        return Pregunta.CONFIRMAR_PRESENTACION
    return Pregunta.PRECIO_POR_UNIDAD
