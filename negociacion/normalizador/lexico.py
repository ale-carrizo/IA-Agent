"""Similitud léxica producto ↔ texto del proveedor.

Es el plan B del match: en producción manda el embedding contra
`catalogo_maestro.embedding`, pero necesitamos que el pipeline entero corra
(y que el golden dataset se pueda testear en CI) **sin llamar a ninguna API**.
Por eso esta función existe y es determinística.

No pretende ser inteligente: pretende ser predecible. Cualquier duda la
resuelve hacia abajo, porque bajar la confianza sólo genera una re-pregunta,
mientras que subirla genera un presupuesto equivocado.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher

from .tipos import Candidato, ProductoCatalogo
from .unidades import normalizar_texto

__all__ = ["similitud_lexica", "buscar_candidatos", "extraer_concentraciones"]

# "500 mg", "250 mg/5 ml", "0,9%", "5000 UI/ml", "1 g"
_RE_CONCENTRACION = re.compile(
    r"\b(\d+(?:[.,]\d+)?)\s*(mg/\d+\s*ml|mg|mcg|g|ml|ui/ml|ui|%)\b"
)

_PALABRAS_VACIAS = {
    "de", "la", "el", "los", "las", "un", "una", "por", "para", "con", "en",
    "del", "al", "y", "o", "me", "te", "se", "lo", "que", "es", "esta",
}


def extraer_concentraciones(texto: str | None) -> set[str]:
    """Concentraciones mencionadas, canonizadas a '500 mg' / '250 mg/5 ml'."""
    salida: set[str] = set()
    for num, unidad in _RE_CONCENTRACION.findall(normalizar_texto(texto)):
        n = num.replace(",", ".")
        if "." in n:                      # '0.90' → '0.9';  ¡'500' NO es '5'!
            n = n.rstrip("0").rstrip(".") or "0"
        u = re.sub(r"\s+", " ", unidad).strip()
        salida.add(f"{n} {u}")
    return salida


def _tokens(texto: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", normalizar_texto(texto))
            if t not in _PALABRAS_VACIAS and len(t) > 1]


def _score_droga(texto: str, droga: str) -> float:
    """Qué tan bien el texto nombra a la droga.

    Contempla el apócope de WhatsApp ("amoxi" → amoxicilina, "cefta" →
    ceftriaxona): un token que es prefijo de la droga y tiene al menos 4
    letras cuenta casi como nombrarla completa.
    """
    d = normalizar_texto(droga)
    d_tokens = _tokens(d)
    mejor = 0.0
    for t in _tokens(texto):
        for dt in d_tokens:
            if t == dt:
                mejor = max(mejor, 1.0)
            elif len(t) >= 5 and dt.startswith(t):
                mejor = max(mejor, 0.94)
            elif len(t) >= 4 and dt.startswith(t):
                mejor = max(mejor, 0.88)
            elif len(dt) >= 4 and t.startswith(dt):
                mejor = max(mejor, 0.88)
            else:
                mejor = max(mejor, SequenceMatcher(None, t, dt).ratio() * 0.85)
    return mejor


def similitud_lexica(texto: str, producto: ProductoCatalogo) -> float:
    """0..1. Qué tan bien el texto NOMBRA a este producto.

    Es sólo un score de identificación. Lo que el texto NO dice no se castiga
    acá: la ausencia de concentración o de forma la evalúa `core.normalizar`,
    que es el único que sabe si esa omisión deja dos lecturas posibles o una
    sola. Si penalizáramos en los dos lados, castigaríamos dos veces lo mismo
    y todo mensaje normal ("la amoxi") caería debajo del umbral.
    """
    score = _score_droga(texto, producto.droga)

    concs_texto = extraer_concentraciones(texto)
    concs_prod = extraer_concentraciones(producto.concentracion)
    if concs_texto and concs_prod:
        score = min(1.0, score + 0.06) if (concs_texto & concs_prod) else score * 0.45

    forma_prod = normalizar_texto(producto.forma)
    formas_texto = normalizar_texto(texto)
    if forma_prod and forma_prod[:5] in formas_texto:
        score = min(1.0, score + 0.04)

    return round(min(1.0, max(0.0, score)), 4)


def buscar_candidatos(
    texto: str,
    catalogo: list[ProductoCatalogo],
    *,
    limite: int = 8,
    minimo: float = 0.35,
) -> list[Candidato]:
    """Ranking léxico sobre un catálogo en memoria (tests, CI, fallback)."""
    puntuados = [Candidato(p, similitud_lexica(texto, p)) for p in catalogo]
    puntuados = [c for c in puntuados if c.similitud >= minimo]
    puntuados.sort(key=lambda c: (-c.similitud, c.producto.id))
    return puntuados[:limite]
