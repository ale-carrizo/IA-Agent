"""Tests unitarios del normalizador (los de comportamiento, no de dataset).

Lo que se fija acá es la propiedad central del módulo:

    la validación determinística sólo puede BAJAR la confianza.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from normalizador import Candidato, ItemCrudo, Requerido, buscar_candidatos, normalizar
from normalizador.unidades import parsear_presentacion, quitar_palabras_de_envase

from .conftest import CATALOGO, POR_CODIGO, codigos_del_seed


def _req(codigo: str, presentacion: str | None = None) -> Requerido:
    p = POR_CODIGO[codigo]
    return Requerido(
        item_id=1,
        producto_id=p.id,
        descripcion_original=f"{p.droga} {p.concentracion} {p.forma}",
        presentacion_requerida=presentacion or p.presentacion,
        unidades_requeridas=p.unidades_por_presentacion,
        forma=p.forma,
        concentracion=p.concentracion,
    )


def _normalizar(texto: str, precio: str | None, unidad: str | None, codigo: str | None = None):
    item = ItemCrudo(texto_producto=texto, precio_texto=precio, unidad_texto=unidad)
    candidatos = buscar_candidatos(texto, CATALOGO)
    return normalizar(item, candidatos, _req(codigo) if codigo else None)


def test_catalogo_espeja_el_seed() -> None:
    """Si alguien toca el seed y no el fixture, este test lo dice."""
    assert {p.codigo_externo for p in CATALOGO} == codigos_del_seed()


def test_caso_feliz_acepta() -> None:
    r = _normalizar("amoxicilina 500 mg", "38.900", "caja x100", "AR-AMX-500-100")
    assert r.producto_id == POR_CODIGO["AR-AMX-500-100"].id
    assert r.precio_unitario == Decimal("389.00")
    assert r.confianza >= 0.85
    assert r.conversion_exacta


def test_sin_candidatos_no_inventa_producto() -> None:
    r = normalizar(ItemCrudo("alcohol en gel", "1.200", "el litro"), [], None)
    assert r.producto_id is None
    assert r.confianza == 0.0


def test_precio_ilegible_anula_la_confianza() -> None:
    r = _normalizar("amoxicilina 500 mg", "38.900 lucas", "caja x100", "AR-AMX-500-100")
    assert r.precio_unitario is None
    assert r.confianza == 0.0
    assert any("precio" in m for m in r.motivos)


def test_forma_distinta_bloquea() -> None:
    r = _normalizar("amoxicilina jarabe", "2.400", "el frasco", "AR-AMX-500-100")
    assert r.confianza <= 0.30


def test_concentracion_distinta_es_otro_producto() -> None:
    r = _normalizar("ceftriaxona 500 mg", "64.500", "caja x50", "AR-CFT-1G-50")
    assert r.producto_id == POR_CODIGO["AR-CFT-500-50"].id
    assert r.confianza <= 0.51


def test_caja_sin_cantidad_ambigua_no_se_infiere() -> None:
    # Ibuprofeno 600 existe en caja x50 y caja x100 → no hay lectura única.
    r = _normalizar("ibuprofeno 600", "14.500", "la caja", "AR-IBU-600-100")
    assert r.precio_unitario is None
    assert r.confianza <= 0.61


def test_caja_sin_cantidad_univoca_si_se_infiere() -> None:
    # Amoxicilina 500 comprimido sólo viene en caja x100 → se puede completar.
    r = _normalizar("la amoxi", "38.900", "la caja", "AR-AMX-500-100")
    assert r.unidades_por_presentacion == 100
    assert r.precio_unitario == Decimal("389.00")
    assert r.confianza >= 0.85


def test_presentacion_distinta_queda_bajo_umbral() -> None:
    r = _normalizar("ceftriaxona 1 g", "96 lucas", "ampolla x1", "AR-CFT-1G-50")
    assert r.precio_unitario == Decimal("96000.00")
    assert r.presentacion_igual_a_requerida is False
    assert r.confianza < 0.85, "otra presentación siempre se confirma antes de aceptar"


def test_frasco_como_envase_no_se_lee_como_forma() -> None:
    r = _normalizar("vancomicina 500", "3.200", "el frasco", "AR-VAN-500-1")
    assert r.confianza >= 0.85


def test_division_inexacta_avisa_pero_no_bloquea() -> None:
    r = _normalizar("enalapril 10 mg", "7 mil", "caja de 60", "AR-ENA-10-60")
    assert r.precio_unitario == Decimal("116.67")
    assert r.confianza >= 0.85
    assert any("divide exacto" in m for m in r.motivos)


def test_toda_penalizacion_deja_motivo() -> None:
    r = _normalizar("ibuprofeno 600", "14.500", "la caja", "AR-IBU-600-100")
    assert r.confianza < 1.0 and r.motivos, "una confianza baja sin motivo es inauditable"


@pytest.mark.parametrize(
    "texto,precio,unidad,codigo",
    [
        ("amoxicilina 500 mg", "38.900", "caja x100", "AR-AMX-500-100"),
        ("ceftriaxona 1 g", "92.500", "caja x50", "AR-CFT-1G-50"),
        ("la amoxi", "38.900", "la caja", "AR-AMX-500-100"),
        ("ibuprofeno 600", "14.500", "la caja", "AR-IBU-600-100"),
    ],
)
def test_la_validacion_nunca_sube_la_confianza(texto, precio, unidad, codigo) -> None:
    """Propiedad estructural: la confianza final ≤ similitud del match."""
    candidatos = buscar_candidatos(texto, CATALOGO)
    base = max(c.similitud for c in candidatos)
    r = normalizar(ItemCrudo(texto, precio, unidad), candidatos, _req(codigo))
    assert r.confianza <= base + 1e-9


def test_es_funcion_pura() -> None:
    """Mismos argumentos → mismo resultado. Sin reloj, sin red, sin estado."""
    item = ItemCrudo("amoxicilina 500 mg", "38.900", "caja x100")
    candidatos = buscar_candidatos(item.texto_producto, CATALOGO)
    req = _req("AR-AMX-500-100")
    assert normalizar(item, candidatos, req) == normalizar(item, candidatos, req)


@pytest.mark.parametrize(
    "texto,tipo,unidades",
    [
        ("la caja", "presentacion", None),
        ("caja x100", "presentacion", 100),
        ("caja por 100 comprimidos", "presentacion", 100),
        ("por unidad", "unidad", 1),
        ("c/u", "unidad", 1),
        ("ampolla x1", "unidad", 1),
        ("blister x10", "presentacion", 10),
        ("bulto de 200", "presentacion", 200),
        ("", "desconocido", None),
    ],
)
def test_presentaciones(texto: str, tipo: str, unidades: int | None) -> None:
    p = parsear_presentacion(texto)
    assert (p.tipo, p.unidades) == (tipo, unidades)


def test_quitar_envase_solo_saca_lo_que_explica_la_presentacion() -> None:
    assert "frasco" not in quitar_palabras_de_envase("el frasco a 3200", "frasco x1")
    assert "frasco" in quitar_palabras_de_envase("el frasco a 3200", "caja x100")
