"""Tabla de casos de `decidir()`.

La política es la pieza que decide qué precio entra a un presupuesto, así que
se testea como se testea una tabla de verdad: todas las ramas, más las
propiedades que tienen que valer para CUALQUIER entrada.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.politica import (
    MAX_COUNTERS,
    VENTANA_CONTRAOFERTA,
    Accion,
    Contexto,
    PoliticaCondiciones,
    Pregunta,
    decidir,
    evaluar_condiciones,
)

AHORA = datetime(2026, 8, 13, 9, 0, tzinfo=timezone.utc)
CIERRE_LEJOS = AHORA + timedelta(hours=6)     # hay tiempo de regatear
CIERRE_CERCA = AHORA + timedelta(minutes=45)  # ya no


def ctx(**kw) -> Contexto:
    base = dict(
        intencion="precio",
        confianza=0.95,
        precio_unitario=Decimal("380"),
        precio_objetivo=Decimal("350"),
        precio_max_aceptable=Decimal("400"),
        ahora=AHORA,
        cierre_recoleccion=CIERRE_LEJOS,
    )
    base.update(kw)
    return Contexto(**base)


# ── Tabla principal ─────────────────────────────────────────────────────────

TABLA = [
    # (descripción, kwargs, acción esperada, estado esperado)
    ("sin stock", dict(intencion="sin_stock", precio_unitario=None), Accion.MARCAR_SIN_STOCK, "sin_stock"),
    ("mensaje sin precio", dict(intencion="aclaracion", precio_unitario=None), Accion.AGRADECER, "esperando"),
    ("precio ilegible", dict(precio_unitario=None), Accion.CLARIFICAR, "aclarando"),
    ("confianza justo abajo", dict(confianza=0.84), Accion.CLARIFICAR, "aclarando"),
    ("confianza justo arriba", dict(confianza=0.85, precio_unitario=Decimal("350")), Accion.ACEPTAR, "confirmada"),
    ("precio bajo el objetivo", dict(precio_unitario=Decimal("300")), Accion.ACEPTAR, "confirmada"),
    ("precio igual al objetivo", dict(precio_unitario=Decimal("350")), Accion.ACEPTAR, "confirmada"),
    ("en el sobre con tiempo → counter", dict(precio_unitario=Decimal("380")), Accion.COUNTER, "esperando"),
    ("en el sobre sin tiempo → aceptar", dict(precio_unitario=Decimal("380"), cierre_recoleccion=CIERRE_CERCA), Accion.ACEPTAR, "confirmada"),
    ("en el sobre ya contraofertado → aceptar", dict(precio_unitario=Decimal("380"), counters_hechos=1), Accion.ACEPTAR, "confirmada"),
    ("precio igual al máximo", dict(precio_unitario=Decimal("400"), counters_hechos=1), Accion.ACEPTAR, "confirmada"),
    ("sobre el máximo → counter", dict(precio_unitario=Decimal("500")), Accion.COUNTER, "esperando"),
    ("sobre el máximo, ya contraofertado → descartar", dict(precio_unitario=Decimal("500"), counters_hechos=1), Accion.DESCARTAR, "descartada"),
    ("condición de pago corta", dict(condiciones={"pago": "7 días"}), Accion.ESCALAR_HUMANO, "excepcion_humana"),
    ("condición desconocida", dict(condiciones={"canje": "sí"}), Accion.ESCALAR_HUMANO, "excepcion_humana"),
    ("entrega parcial", dict(condiciones={"entrega": "parcial en 2 tandas"}), Accion.ESCALAR_HUMANO, "excepcion_humana"),
    ("sin sobre cargado", dict(precio_max_aceptable=None, precio_objetivo=None), Accion.ESCALAR_HUMANO, "excepcion_humana"),
]


@pytest.mark.parametrize("desc,kwargs,accion,estado", TABLA, ids=[t[0] for t in TABLA])
def test_tabla(desc: str, kwargs: dict, accion: Accion, estado: str) -> None:
    m = decidir(ctx(**kwargs))
    assert m.accion is accion, f"{desc}: dio {m.accion} ({m.motivo})"
    assert m.estado == estado, f"{desc}: estado {m.estado}"


# ── Propiedades ─────────────────────────────────────────────────────────────


def test_toda_movida_tiene_motivo() -> None:
    for _, kwargs, _, _ in TABLA:
        assert decidir(ctx(**kwargs)).motivo, "una movida sin motivo es inauditable"


def test_es_funcion_pura() -> None:
    c = ctx()
    assert decidir(c) == decidir(c)


def test_nunca_acepta_bajo_el_umbral() -> None:
    """La propiedad que protege el presupuesto: sin confianza no hay ACEPTAR."""
    for confianza in [0.0, 0.3, 0.6, 0.75, 0.84, 0.8499]:
        for precio in ["1", "300", "380", "400", "9999"]:
            m = decidir(ctx(confianza=confianza, precio_unitario=Decimal(precio)))
            assert m.accion is not Accion.ACEPTAR


def test_nunca_acepta_por_encima_del_maximo() -> None:
    for precio in ["401", "500", "1000000"]:
        for counters in range(MAX_COUNTERS + 2):
            m = decidir(ctx(precio_unitario=Decimal(precio), counters_hechos=counters))
            assert m.accion is not Accion.ACEPTAR, f"{precio} con {counters} counters"


def test_la_contraoferta_sale_del_sobre_no_del_precio_ofrecido() -> None:
    m = decidir(ctx(precio_unitario=Decimal("500")))
    assert m.precio_contraoferta == Decimal("350"), "se contraoferta el objetivo, no un % inventado"


def test_no_contraoferta_mas_de_una_vez() -> None:
    m = decidir(ctx(precio_unitario=Decimal("500"), counters_hechos=MAX_COUNTERS))
    assert m.accion is Accion.DESCARTAR


def test_la_ventana_de_contraoferta_es_la_declarada() -> None:
    justo_adentro = AHORA + VENTANA_CONTRAOFERTA + timedelta(minutes=1)
    justo_afuera = AHORA + VENTANA_CONTRAOFERTA - timedelta(minutes=1)
    assert decidir(ctx(cierre_recoleccion=justo_adentro)).accion is Accion.COUNTER
    assert decidir(ctx(cierre_recoleccion=justo_afuera)).accion is Accion.ACEPTAR


def test_condicion_mala_gana_a_precio_excelente() -> None:
    m = decidir(ctx(precio_unitario=Decimal("1"), condiciones={"pago": "contado"}))
    assert m.accion is Accion.ESCALAR_HUMANO, "un precio regalado con mala condición sigue yendo a un humano"


def test_confianza_baja_gana_a_condicion_mala() -> None:
    """Primero se entiende el mensaje; recién después se juzga la oferta."""
    m = decidir(ctx(confianza=0.4, condiciones={"pago": "7 días"}))
    assert m.accion is Accion.CLARIFICAR


# ── Preguntas ───────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "motivos,esperada",
    [
        (("dijo 'caja' sin decir de cuántas unidades; el catálogo tiene 2 tamaños",), Pregunta.UNIDADES_POR_PRESENTACION),
        (("no se pudo leer el precio: ambiguo",), Pregunta.PRECIO_ILEGIBLE),
        (("el proveedor cotizó un producto distinto al del pliego",), Pregunta.CONFIRMAR_PRODUCTO),
    ],
)
def test_que_se_pregunta(motivos: tuple[str, ...], esperada: Pregunta) -> None:
    m = decidir(ctx(confianza=0.5, motivos_normalizador=motivos))
    assert m.pregunta is esperada


def test_presentacion_distinta_pide_confirmar_presentacion() -> None:
    m = decidir(ctx(confianza=0.80, presentacion_igual_a_requerida=False, motivos_normalizador=("ofrece ampolla x1 y el pliego pide caja x50",)))
    assert m.accion is Accion.CLARIFICAR
    assert m.pregunta is Pregunta.CONFIRMAR_PRESENTACION


# ── Condiciones ─────────────────────────────────────────────────────────────

POL = PoliticaCondiciones()


@pytest.mark.parametrize(
    "condiciones,fuera",
    [
        ({}, False),
        ({"pago": "30 días"}, False),
        ({"pago": "60 dias"}, False),
        ({"pago": "7 días"}, True),
        ({"pago": "contado"}, True),
        ({"pago": "a convenir"}, True),          # no interpretable → humano
        ({"vencimiento": "2028-01-01"}, False),
        ({"vencimiento": "2026-09-01"}, True),   # menos de 180 días
        ({"vencimiento": "junio"}, True),        # ambiguo → humano
        ({"entrega": "completa"}, False),
        ({"entrega": "parcial"}, True),
        ({"flete": "a cargo del comprador"}, True),
        ({"canje": "sí"}, True),
    ],
)
def test_evaluar_condiciones(condiciones: dict, fuera: bool) -> None:
    motivos = evaluar_condiciones(condiciones, POL, AHORA)
    assert bool(motivos) is fuera, f"{condiciones} → {motivos}"


def test_lo_no_interpretable_nunca_pasa_como_favorable() -> None:
    """Regla de oro: si no se entiende una condición, no se asume buena."""
    for valor in ["a convenir", "??", "vemos", ""]:
        assert evaluar_condiciones({"pago": valor}, POL, AHORA)
