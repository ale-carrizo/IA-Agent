"""Tabla de casos del parseo de precios.

Es el test más barato del repo y el que cubre el error más caro: leer 38.900
como 38,9 (o al revés) mete un factor 1000 en un presupuesto.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from normalizador.numeros import parsear_entero, parsear_precio

CASOS_OK = [
    ("38.900", "38900"),
    ("38.900,50", "38900.50"),
    ("$ 1.234.567", "1234567"),
    ("1.234.567,89", "1234567.89"),
    ("8,400.00", "8400.00"),        # formato US: manda el separador de más a la derecha
    ("96 lucas", "96000"),
    ("96 luca", "96000"),
    ("2 palos", "2000000"),
    ("1,5 palos", "1500000"),
    ("7 mil", "7000"),
    ("38k", "38000"),
    ("1200", "1200"),
    ("12,50", "12.50"),
    ("10.5", "10.5"),
    ("$13.500", "13500"),
    ("410", "410"),
    ("1 palo", "1000000"),
    ("38 900", "38900"),            # separador de miles con espacio
]

CASOS_AMBIGUOS = [
    "38.900 lucas",     # ¿38.900 o 38.900.000? Diferencia de 1000x → no se adivina
    "2.500 palos",
    "gratis",
    "",
    None,
    "0",
    "-100",
]


@pytest.mark.parametrize("texto,esperado", CASOS_OK)
def test_precios_que_se_leen(texto: str, esperado: str) -> None:
    r = parsear_precio(texto)
    assert r.valor == Decimal(esperado), f"{texto!r} → {r.valor} (esperado {esperado})"


@pytest.mark.parametrize("texto", CASOS_AMBIGUOS)
def test_precios_que_NO_se_leen(texto: str | None) -> None:
    r = parsear_precio(texto)
    assert r.valor is None, f"{texto!r} debería quedar sin leer, dio {r.valor}"
    assert r.ambiguo, "todo rechazo tiene que explicar por qué"


def test_devuelve_decimal_no_float() -> None:
    # Los precios NUNCA pasan por float: 0.1 + 0.2 no puede aparecer en un presupuesto.
    assert isinstance(parsear_precio("38.900").valor, Decimal)


@pytest.mark.parametrize(
    "texto,esperado",
    [("x100", 100), ("caja de 60", 60), ("x 1.000", 1000), ("sin numero", None), ("", None)],
)
def test_enteros(texto: str, esperado: int | None) -> None:
    assert parsear_entero(texto) == esperado
