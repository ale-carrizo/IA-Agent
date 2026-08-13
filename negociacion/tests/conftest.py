"""Fixtures compartidas.

`CATALOGO` es un espejo en memoria de `db/21-licitaciones-seed.sql`. Se
mantiene a mano a propósito: los tests del normalizador y del golden dataset
tienen que correr en CI **sin base de datos y sin llamar a ninguna API**.

Si cambiás el seed, actualizá esto (el test `test_catalogo_espeja_el_seed`
falla si se desincronizan los códigos).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from normalizador import ProductoCatalogo

RAIZ = Path(__file__).resolve().parents[2]
SEED = RAIZ / "db" / "21-licitaciones-seed.sql"
GOLDEN = Path(__file__).parent / "golden"


def _p(id_: int, droga: str, conc: str, forma: str, pres: str, u: int, cod: str) -> ProductoCatalogo:
    return ProductoCatalogo(id_, droga, conc, forma, pres, u, cod)


CATALOGO: list[ProductoCatalogo] = [
    _p(1,  "Amoxicilina", "500 mg", "comprimido", "caja x100", 100, "AR-AMX-500-100"),
    _p(2,  "Amoxicilina", "875 mg", "comprimido", "caja x14", 14, "AR-AMX-875-14"),
    _p(3,  "Amoxicilina", "250 mg/5 ml", "jarabe", "frasco 120 ml", 1, "AR-AMX-JBE-120"),
    _p(4,  "Ceftriaxona", "1 g", "ampolla", "caja x50", 50, "AR-CFT-1G-50"),
    _p(5,  "Ceftriaxona", "1 g", "ampolla", "ampolla x1", 1, "AR-CFT-1G-1"),
    _p(6,  "Ceftriaxona", "500 mg", "ampolla", "caja x50", 50, "AR-CFT-500-50"),
    _p(7,  "Ibuprofeno", "600 mg", "comprimido", "caja x100", 100, "AR-IBU-600-100"),
    _p(8,  "Ibuprofeno", "600 mg", "comprimido", "caja x50", 50, "AR-IBU-600-50"),
    _p(9,  "Paracetamol", "500 mg", "comprimido", "caja x100", 100, "AR-PAR-500-100"),
    _p(10, "Dipirona", "500 mg", "comprimido", "caja x100", 100, "AR-DIP-500-100"),
    _p(11, "Omeprazol", "20 mg", "capsula", "caja x30", 30, "AR-OME-20-30"),
    _p(12, "Enalapril", "10 mg", "comprimido", "caja x60", 60, "AR-ENA-10-60"),
    _p(13, "Metformina", "850 mg", "comprimido", "caja x60", 60, "AR-MET-850-60"),
    _p(14, "Heparina sodica", "5000 UI/ml", "ampolla", "caja x50", 50, "AR-HEP-5000-50"),
    _p(15, "Dexametasona", "8 mg/2 ml", "ampolla", "caja x25", 25, "AR-DEX-8-25"),
    _p(16, "Ranitidina", "50 mg/2 ml", "ampolla", "caja x25", 25, "AR-RAN-50-25"),
    _p(17, "Solucion fisiologica", "0,9%", "solucion", "sachet 500 ml", 1, "AR-SF-500"),
    _p(18, "Ondansetron", "8 mg", "ampolla", "caja x5", 5, "AR-OND-8-5"),
    _p(19, "Midazolam", "5 mg/5 ml", "ampolla", "caja x50", 50, "AR-MDZ-5-50"),
    _p(20, "Vancomicina", "500 mg", "ampolla", "frasco x1", 1, "AR-VAN-500-1"),
    _p(21, "Meropenem", "1 g", "ampolla", "frasco x1", 1, "AR-MER-1G-1"),
]

POR_CODIGO: dict[str, ProductoCatalogo] = {p.codigo_externo: p for p in CATALOGO if p.codigo_externo}


@pytest.fixture
def catalogo() -> list[ProductoCatalogo]:
    return CATALOGO


@pytest.fixture
def por_codigo() -> dict[str, ProductoCatalogo]:
    return POR_CODIGO


def cargar_golden() -> list[dict]:
    """Todos los casos de tests/golden/*.jsonl."""
    casos: list[dict] = []
    for archivo in sorted(GOLDEN.glob("*.jsonl")):
        for n, linea in enumerate(archivo.read_text(encoding="utf-8").splitlines(), start=1):
            linea = linea.strip()
            if not linea or linea.startswith("//"):
                continue
            caso = json.loads(linea)
            caso.setdefault("id", f"{archivo.stem}:{n}")
            caso["_archivo"] = archivo.name
            casos.append(caso)
    return casos


def codigos_del_seed() -> set[str]:
    """Códigos externos declarados en el .sql del seed."""
    texto = SEED.read_text(encoding="utf-8")
    bloque = texto.split("-- ── Proveedores de prueba")[0]
    return set(re.findall(r"'(AR-[A-Z0-9\-]+)'", bloque))
