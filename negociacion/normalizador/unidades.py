"""Presentaciones y unidades: "la caja", "caja x100", "por ampolla", "c/u".

Stdlib pura. La pregunta que responde este módulo es la que arruina
presupuestos cuando se contesta mal:

    ¿el precio que dijo el proveedor es POR UNIDAD o POR PRESENTACIÓN,
    y de cuántas unidades es esa presentación?

Cuando el texto no alcanza para responderla, el resultado sale con
`unidades = None`. Eso NO se completa adivinando acá: lo resuelve
`normalizador.core`, y sólo si el catálogo deja una única lectura posible.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Literal

from .numeros import parsear_entero

__all__ = [
    "Presentacion",
    "parsear_presentacion",
    "normalizar_texto",
    "misma_forma",
    "FORMAS",
]

TipoPrecio = Literal["unidad", "presentacion", "desconocido"]

# Formas farmacéuticas y sus sinónimos de WhatsApp. La forma es un check duro:
# si el proveedor cotiza jarabe y el pliego pide comprimidos, no hay match.
FORMAS: dict[str, tuple[str, ...]] = {
    "comprimido": ("comprimido", "comprimidos", "comp", "compr", "tabletas", "tableta", "tab", "pastilla", "pastillas"),
    "capsula": ("capsula", "capsulas", "caps", "cap"),
    "ampolla": ("ampolla", "ampollas", "amp", "ampollita"),
    "frasco": ("frasco", "frascos", "fco", "vial", "viales"),
    "jarabe": ("jarabe", "jarabes", "suspension", "suspensiones"),
    "solucion": ("solucion", "soluciones", "sachet", "sachets", "bolsa", "bolsas"),
    "crema": ("crema", "cremas", "pomada", "unguento"),
    "supositorio": ("supositorio", "supositorios"),
}

# Envases: qué palabra usó para hablar de "el paquete".
_ENVASES: dict[str, tuple[str, ...]] = {
    "caja": ("caja", "cajas", "cja", "cj"),
    "blister": ("blister", "blisters", "blister"),
    "frasco": ("frasco", "frascos", "fco"),
    "estuche": ("estuche", "estuches"),
    "bulto": ("bulto", "bultos", "pack", "packs"),
}

# "por unidad" y variantes. Si aparece esto, el precio es unitario.
_RE_POR_UNIDAD = re.compile(
    r"\b(?:c/?u|cada\s+uno|por\s+unidad|la\s+unidad|x\s*unidad|unitario|por\s+cada)\b"
)

# "x100", "por 100", "de 100", "x 100 u", "de 100 comprimidos"
_RE_CANTIDAD = re.compile(
    r"(?:\bx\s*|\bpor\s+|\bde\s+)(\d{1,3}(?:[.\s]\d{3})*|\d+)\s*"
    r"(?:u\b|un\b|unidades?\b|comp\w*\b|amp\w*\b|caps?\w*\b|tab\w*\b)?"
)


def normalizar_texto(s: str | None) -> str:
    """minúsculas, sin acentos, espacios colapsados. Base de todo match léxico."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s.lower()).strip()


def _detectar(texto: str, tabla: dict[str, tuple[str, ...]]) -> str | None:
    for canonico, sinonimos in tabla.items():
        for s in sinonimos:
            if re.search(rf"\b{re.escape(s)}\b", texto):
                return canonico
    return None


def detectar_forma(texto: str | None) -> str | None:
    """Forma farmacéutica canónica mencionada en el texto, o None."""
    return _detectar(normalizar_texto(texto), FORMAS)


def _canonizar_forma(s: str | None) -> str | None:
    """Forma canónica de un string. None = el texto no dice nada de la forma.

    El fallback sólo aplica a strings de UNA palabra, que es cuando el valor
    ya viene de una columna del catálogo (`catalogo_maestro.forma`) y no de un
    mensaje suelto. Si se aplicara a texto libre, cualquier frase sin forma
    mencionada se compararía entera contra 'comprimido' y daría "no coincide"
    en vez de "no sé" — que es una diferencia enorme: uno bloquea, el otro no.
    """
    canonica = detectar_forma(s)
    if canonica:
        return canonica
    limpio = normalizar_texto(s)
    return limpio if limpio and " " not in limpio else None


def misma_forma(a: str | None, b: str | None) -> bool | None:
    """True/False si ambas formas son conocidas; None si falta alguna.

    El `None` es importante: "no sé" no es lo mismo que "no coinciden", y se
    penaliza distinto.
    """
    ca, cb = _canonizar_forma(a), _canonizar_forma(b)
    if not ca or not cb:
        return None
    return ca == cb


@dataclass(frozen=True)
class Presentacion:
    """Cómo está expresado un precio.

    tipo:      'unidad' (precio por unidad), 'presentacion' (por envase),
               'desconocido' (el texto no lo dice).
    unidades:  unidades por envase. None = el texto no lo dice. NUNCA se
               inventa acá.
    envase:    'caja' | 'blister' | 'frasco' | ... o None.
    forma:     forma farmacéutica mencionada, o None.
    etiqueta:  string canónico para guardar en `presentacion_ofrecida`.
    """

    tipo: TipoPrecio
    unidades: int | None
    envase: str | None
    forma: str | None
    etiqueta: str

    @property
    def unidades_conocidas(self) -> bool:
        return self.unidades is not None and self.unidades > 0


def _etiquetar(tipo: TipoPrecio, unidades: int | None, envase: str | None, forma: str | None) -> str:
    if tipo == "unidad":
        return f"{forma or 'unidad'} x1"
    if envase and unidades:
        return f"{envase} x{unidades}"
    if envase:
        return f"{envase} (cantidad sin especificar)"
    if unidades:
        return f"x{unidades}"
    return "sin especificar"


def parsear_presentacion(texto: str | None) -> Presentacion:
    """Interpreta la unidad en que viene expresado un precio.

    Ejemplos:
        "la caja"            → presentacion, unidades=None   (¡falta el dato!)
        "caja x100"          → presentacion, unidades=100
        "caja por 100 comp"  → presentacion, unidades=100, forma=comprimido
        "por unidad"         → unidad, unidades=1
        "la ampolla"         → unidad, unidades=1, forma=ampolla
        "x50"                → presentacion, unidades=50
        ""                   → desconocido
    """
    t = normalizar_texto(texto)
    if not t:
        return Presentacion("desconocido", None, None, None, "sin especificar")

    forma = _detectar(t, FORMAS)
    envase = _detectar(t, _ENVASES)

    # 1) ¿Dijo explícitamente "por unidad"?
    if _RE_POR_UNIDAD.search(t):
        return Presentacion("unidad", 1, None, forma, _etiquetar("unidad", 1, None, forma))

    # 2) ¿Hay una cantidad ("x100", "de 100")?
    unidades: int | None = None
    m = _RE_CANTIDAD.search(t)
    if m:
        unidades = parsear_entero(m.group(1))
        if unidades is not None and unidades <= 0:
            unidades = None

    if envase:
        return Presentacion("presentacion", unidades, envase, forma, _etiquetar("presentacion", unidades, envase, forma))

    if unidades is not None:
        if unidades == 1:
            # "ampolla x1" es, a los fines del precio, precio por unidad.
            return Presentacion("unidad", 1, None, forma, _etiquetar("unidad", 1, None, forma))
        return Presentacion("presentacion", unidades, None, forma, _etiquetar("presentacion", unidades, None, forma))

    # 3) Mencionó una forma suelta ("la ampolla", "el comprimido") sin envase ni
    #    cantidad → se lee como precio por unidad de esa forma.
    if forma and forma not in ("frasco",):
        return Presentacion("unidad", 1, None, forma, _etiquetar("unidad", 1, None, forma))
    if forma == "frasco":
        # "el frasco" es un envase, no una unidad: cuántas dosis trae es otra pregunta.
        return Presentacion("presentacion", None, "frasco", forma, "frasco (cantidad sin especificar)")

    return Presentacion("desconocido", None, None, forma, "sin especificar")


def quitar_palabras_de_envase(texto: str | None, presentacion: str | None) -> str:
    """Saca del texto las palabras de envase que ya explica la presentación.

    Existe por un choque real: "frasco" es a la vez forma farmacéutica y
    envase. La vancomicina es una AMPOLLA que viene en `frasco x1`; si el
    proveedor dice "el frasco a 3.200" y lo leyéramos como forma, daría
    "forma distinta" y bloquearía una cotización perfectamente válida.
    """
    t = normalizar_texto(texto)
    pres = normalizar_texto(presentacion)
    if not t or not pres:
        return t
    for sinonimos in _ENVASES.values():
        if any(re.search(rf"\b{re.escape(s)}\b", pres) for s in sinonimos):
            for s in sinonimos:
                t = re.sub(rf"\b{re.escape(s)}\b", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def presentacion_de_catalogo(presentacion: str, unidades_por_presentacion: int, forma: str) -> Presentacion:
    """Construye una `Presentacion` a partir de una fila de `catalogo_maestro`.

    Ahí las unidades son dato duro (columna `unidades_por_presentacion`), así
    que nunca queda en None.
    """
    t = normalizar_texto(presentacion)
    envase = _detectar(t, _ENVASES)
    tipo: TipoPrecio = "unidad" if unidades_por_presentacion == 1 else "presentacion"
    return Presentacion(
        tipo=tipo,
        unidades=unidades_por_presentacion,
        envase=envase,
        forma=detectar_forma(forma) or normalizar_texto(forma),
        etiqueta=presentacion,
    )
