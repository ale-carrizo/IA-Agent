"""Guardrails sobre la salida. Regex + un chequeo propio del dominio.

Reusa el patrón del motor existente (`guardrails.patron_bloqueo`), pero suma
el que importa acá:

    un mensaje que sale del sistema NO puede contener un número
    que no haya salido de `decidir()`.

Es la contracara del principio "el LLM sólo traduce". Si el modelo inventa,
redondea o arrastra un precio de otro ítem, este chequeo lo agarra y el
mensaje se reemplaza por la plantilla determinística — que por construcción
sólo puede contener números permitidos.
"""

from __future__ import annotations

import re

__all__ = ["numeros_de", "verificar", "Veredicto"]

# Números "de prosa" que no son precios y no tiene sentido bloquear.
_RE_NUMERO = re.compile(r"\d[\d.,]*")


def numeros_de(texto: str) -> set[str]:
    """Números del texto, canonizados (sin separadores de miles ni decimales
    superfluos) para poder compararlos con los de la movida."""
    salida: set[str] = set()
    for bruto in _RE_NUMERO.findall(texto or ""):
        salida.add(_canonizar(bruto))
    return {n for n in salida if n}


def _canonizar(bruto: str) -> str:
    s = bruto.strip().rstrip(".,")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        partes = s.split(",")
        s = s.replace(",", "") if all(len(p) == 3 for p in partes[1:]) else s.replace(",", ".")
    elif "." in s:
        partes = s.split(".")
        if all(len(p) == 3 for p in partes[1:]):
            s = s.replace(".", "")
    if not s:
        return ""
    try:
        f = float(s)
    except ValueError:
        return ""
    return f"{f:.2f}".rstrip("0").rstrip(".")


class Veredicto:
    __slots__ = ("ok", "motivo")

    def __init__(self, ok: bool, motivo: str = "") -> None:
        self.ok = ok
        self.motivo = motivo

    def __bool__(self) -> bool:
        return self.ok


def verificar(texto: str, numeros_permitidos: set[str], patrones_bloqueo: list[str] | None = None) -> Veredicto:
    """`ok=False` ⇒ el mensaje NO se manda; sale la plantilla en su lugar."""
    if not texto or not texto.strip():
        return Veredicto(False, "mensaje vacío")

    for patron in patrones_bloqueo or []:
        try:
            if re.search(patron, texto, re.IGNORECASE):
                return Veredicto(False, f"coincide con patrón de bloqueo: {patron}")
        except re.error:
            continue  # un patrón mal cargado en la DB no puede tumbar el envío

    permitidos = {_canonizar(n) for n in numeros_permitidos}
    permitidos.discard("")
    intrusos = numeros_de(texto) - permitidos
    if intrusos:
        return Veredicto(False, f"números que no salieron de decidir(): {sorted(intrusos)}")

    return Veredicto(True)
