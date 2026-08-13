"""Parseo de precios escritos como los escribe un vendedor argentino por WhatsApp.

Stdlib pura, sin dependencias. Todo devuelve `Decimal` (nunca float: son plata)
y `None` cuando el texto es ambiguo. En este dominio devolver `None` y
re-preguntar es SIEMPRE mejor que adivinar mal: un factor 1000 de diferencia
arruina un presupuesto.

Casos que tiene que cubrir (salidos de mensajes reales):
    "38.900"        → 38900      (punto = separador de miles)
    "38.900,50"     → 38900.50   (coma = decimal)
    "$ 1.234.567"   → 1234567
    "96 lucas"      → 96000
    "2 palos"       → 2000000
    "1,5 palos"     → 1500000
    "38 mil"        → 38000
    "38k"           → 38000
    "1200"          → 1200
    "12,50"         → 12.50
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

__all__ = ["parsear_precio", "parsear_entero", "PrecioParseado"]


# ── Multiplicadores del habla ────────────────────────────────────────────────
# "luca" y "palo" son lunfardo corriente en negociación de precios; ignorarlos
# no es una opción, y confundirlos es el error más caro posible.
MULTIPLICADORES: dict[str, Decimal] = {
    "luca": Decimal(1_000),
    "lucas": Decimal(1_000),
    "mil": Decimal(1_000),
    "k": Decimal(1_000),
    "palo": Decimal(1_000_000),
    "palos": Decimal(1_000_000),
    "millon": Decimal(1_000_000),
    "millones": Decimal(1_000_000),
    "m": Decimal(1_000_000),
}

# Un número con separadores, seguido opcionalmente de un multiplicador.
# El multiplicador puede venir pegado ("38k") o separado ("96 lucas").
_RE_NUMERO = re.compile(
    r"""
    (?P<numero>\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?   # 1.234.567,89  /  1 234 567
              |\d{1,3}(?:,\d{3})+(?:\.\d+)?      # 1,234,567.89  (formato US)
              |\d+(?:[.,]\d+)?                   # 1234  /  12,50  /  10.5
    )
    \s*
    (?P<mult>lucas?|palos?|mil|millones|mill[oó]n|k|m)?\b
    """,
    re.VERBOSE | re.IGNORECASE,
)

_ACENTOS = str.maketrans("áéíóúÁÉÍÓÚ", "aeiouAEIOU")


class PrecioParseado:
    """Resultado del parseo. `ambiguo` explica por qué no se pudo decidir."""

    __slots__ = ("valor", "ambiguo", "texto")

    def __init__(self, valor: Decimal | None, texto: str, ambiguo: str | None = None):
        self.valor = valor
        self.texto = texto
        self.ambiguo = ambiguo

    def __bool__(self) -> bool:
        return self.valor is not None

    def __repr__(self) -> str:  # pragma: no cover - ayuda de debug
        return f"PrecioParseado(valor={self.valor!r}, ambiguo={self.ambiguo!r})"


def _a_decimal(crudo: str) -> tuple[Decimal | None, str | None]:
    """Convierte el string numérico a Decimal resolviendo miles vs decimales.

    La regla que desambigua: **el último separador manda**. Si aparecen los dos
    (`.` y `,`), el que está más a la derecha es el decimal. Si aparece uno
    solo, es separador de miles cuando parte al número en grupos exactos de 3
    dígitos; si no, es decimal.
    """
    s = crudo.replace(" ", "")
    tiene_punto = "." in s
    tiene_coma = "," in s

    if tiene_punto and tiene_coma:
        if s.rfind(",") > s.rfind("."):      # 1.234.567,89 → formato AR
            s = s.replace(".", "").replace(",", ".")
        else:                                 # 1,234,567.89 → formato US
            s = s.replace(",", "")
    elif tiene_punto or tiene_coma:
        sep = "." if tiene_punto else ","
        partes = s.split(sep)
        cola = partes[1:]
        if len(cola) >= 1 and all(len(p) == 3 for p in cola) and len(partes[0]) <= 3:
            # Grupos exactos de 3 → separador de miles ("38.900", "1.234.567").
            # OJO: "1.500" es 1500, no 1,5. En precios de droguería la lectura
            # de miles es la correcta y es lo que hace el vendedor al escribir.
            s = s.replace(sep, "")
        elif len(cola) == 1:
            s = partes[0] + "." + cola[0]     # decimal ("12,50", "10.5")
        else:
            return None, "separadores inconsistentes"

    try:
        return Decimal(s), None
    except InvalidOperation:
        return None, "no es un número"


def parsear_precio(texto: str | None) -> PrecioParseado:
    """Extrae el primer precio del texto. `None` si no hay uno interpretable."""
    if not texto:
        return PrecioParseado(None, texto or "", "texto vacío")

    limpio = texto.translate(_ACENTOS)
    m = _RE_NUMERO.search(limpio)
    if not m:
        return PrecioParseado(None, texto, "sin número")

    # Un precio negativo es siempre un error de lectura (o un descuento mal
    # transcripto). No se corrige acá: se re-pregunta.
    if m.start() > 0 and limpio[m.start() - 1] == "-":
        return PrecioParseado(None, texto, "precio negativo")

    valor, err = _a_decimal(m.group("numero"))
    if valor is None:
        return PrecioParseado(None, texto, err)

    mult = (m.group("mult") or "").lower()
    if mult:
        factor = MULTIPLICADORES.get(mult)
        if factor is None:
            return PrecioParseado(None, texto, f"multiplicador desconocido: {mult}")
        # "38.900 lucas" no existe: si ya venía con separador de miles y encima
        # trae multiplicador, el mensaje es ambiguo y hay que re-preguntar.
        if valor >= 1000 and factor >= 1000:
            return PrecioParseado(None, texto, "número grande + multiplicador (ambiguo)")
        valor = valor * factor

    if valor <= 0:
        return PrecioParseado(None, texto, "precio no positivo")

    return PrecioParseado(valor, texto)


def parsear_entero(texto: str | None) -> int | None:
    """Entero simple (cantidades de unidades por caja). Sin multiplicadores."""
    if not texto:
        return None
    m = re.search(r"\d{1,3}(?:[.\s]\d{3})+|\d+", texto)
    if not m:
        return None
    try:
        return int(re.sub(r"[.\s]", "", m.group(0)))
    except ValueError:  # pragma: no cover
        return None
