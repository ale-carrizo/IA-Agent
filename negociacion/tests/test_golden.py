"""Golden dataset: el test que hace roja la build cuando la precisión baja.

Corre `normalizar()` sobre la salida esperada de `interpretar` (que está en el
propio dataset), así que no necesita ni red ni base. El test que ejercita el
LLM de verdad es `test_interpretar_golden.py`, y sólo corre si hay API key.

Lo que verifica de cada caso:
  · producto matcheado (por `codigo_externo`, no por id serial)
  · precio unitario exacto (Decimal, sin tolerancia: es plata)
  · banda de confianza — y sobre todo el LADO del umbral en que cae, porque
    eso es lo que decide si el precio entra al presupuesto o se re-pregunta.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from normalizador import UMBRAL_CONFIANZA, ItemCrudo, Requerido, buscar_candidatos, normalizar

from .conftest import CATALOGO, POR_CODIGO, cargar_golden

CASOS = cargar_golden()


def _requerido(codigo: str | None) -> Requerido | None:
    if not codigo:
        return None
    p = POR_CODIGO[codigo]
    return Requerido(
        item_id=0,
        producto_id=p.id,
        descripcion_original=f"{p.droga} {p.concentracion} {p.forma} {p.presentacion}",
        presentacion_requerida=p.presentacion,
        unidades_requeridas=p.unidades_por_presentacion,
        forma=p.forma,
        concentracion=p.concentracion,
    )


def test_hay_dataset() -> None:
    assert CASOS, "tests/golden/*.jsonl vacío: sin dataset no hay red de seguridad"


def test_cubre_las_categorias_obligatorias() -> None:
    """§9: la lista de casos que SÍ o SÍ tienen que estar cubiertos."""
    ids = " ".join(c["id"] for c in CASOS)
    faltan = [
        etiqueta
        for etiqueta, marca in {
            "precio por unidad": "por-unidad",
            "precio por caja": "caja",
            "lucas/palos": "lucas",
            "formatos de número": "formato-us",
            "varios ítems en un mensaje": "dos-items",
            "sin stock": "sin-stock",
            "te confirmo más tarde": "confirmo-mas-tarde",
            "condiciones de pago": "condicion-pago",
            "presentación distinta": "solo-ampolla",
            "audio transcripto": "audio",
        }.items()
        if marca not in ids
    ]
    assert not faltan, f"el golden dataset dejó de cubrir: {faltan}"


@pytest.mark.parametrize("caso", CASOS, ids=[c["id"] for c in CASOS])
def test_caso_golden(caso: dict) -> None:
    items = caso["interpretado"]["items"]
    esperados = caso["esperado"]

    assert len(items) == len(esperados), (
        f"{caso['id']}: el dataset declara {len(items)} ítems interpretados y "
        f"{len(esperados)} esperados"
    )

    for crudo, esp in zip(items, esperados):
        item = ItemCrudo(
            texto_producto=crudo["texto_producto"],
            precio_texto=crudo.get("precio_texto"),
            unidad_texto=crudo.get("unidad_texto"),
            condiciones=crudo.get("condiciones") or {},
        )
        req = _requerido(esp.get("requerido"))
        candidatos = buscar_candidatos(item.texto_producto, CATALOGO)
        r = normalizar(item, candidatos, req)

        # ── producto ──
        esperado_prod = esp.get("producto")
        if esperado_prod is None:
            assert r.producto_id is None, f"{caso['id']}: matcheó {r.producto_id} y no debía matchear nada"
        else:
            assert r.producto_id == POR_CODIGO[esperado_prod].id, (
                f"{caso['id']}: matcheó producto {r.producto_id}, esperaba {esperado_prod}"
            )

        # ── precio unitario ──
        if "precio_unitario" in esp:
            esperado_precio = esp["precio_unitario"]
            if esperado_precio is None:
                assert r.precio_unitario is None, (
                    f"{caso['id']}: calculó {r.precio_unitario} y el mensaje no alcanzaba para calcularlo"
                )
            else:
                assert r.precio_unitario == Decimal(esperado_precio), (
                    f"{caso['id']}: unitario {r.precio_unitario} ≠ {esperado_precio}"
                )

        # ── confianza: el lado del umbral es lo que define la conducta ──
        if "confianza_min" in esp:
            assert r.confianza >= esp["confianza_min"], (
                f"{caso['id']}: confianza {r.confianza} < mínimo {esp['confianza_min']} "
                f"— motivos: {r.motivos}"
            )
        if "confianza_max" in esp:
            assert r.confianza <= esp["confianza_max"], (
                f"{caso['id']}: confianza {r.confianza} > máximo {esp['confianza_max']} "
                f"— se aceptaría algo que había que preguntar"
            )


def test_ningun_caso_aceptable_queda_bajo_umbral() -> None:
    """Resumen legible: qué proporción del dataset entra directo al presupuesto.

    No es un assert de precisión (el dataset es sintético todavía); es el
    contador que hay que mirar cuando entren las respuestas reales.
    """
    aceptables = sum(
        1 for c in CASOS for e in c["esperado"] if e.get("confianza_min", 0) >= UMBRAL_CONFIANZA
    )
    total = sum(len(c["esperado"]) for c in CASOS)
    assert total > 0
    print(f"\ngolden: {aceptables}/{total} ítems entran directo (confianza ≥ {UMBRAL_CONFIANZA})")
