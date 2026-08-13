"""Los DOS únicos lugares donde interviene un modelo.

    interpretar:  lenguaje natural  → estructura
    expresar:     movida estructurada → lenguaje natural

Nada más. El LLM no decide, no compara precios, no redondea y no elige
proveedor. Si algún día hace falta que "evalúe" algo, va a `politica.py`.

Dos implementaciones:

* `LLMOpenAI`      — producción. `interpretar` usa structured outputs con
                     schema estricto; `expresar` recibe los números ya
                     decididos y sólo los redacta.
* `LLMDeterminista`— sin red. `interpretar` extrae con heurísticas y
                     `expresar` usa plantillas. Es lo que corre en CI, en los
                     tests E2E, y lo que queda como degradación si OpenAI se
                     cae (mejor un mensaje de plantilla correcto que ninguno).

El guardrail de números (`guardrails.py`) corre DESPUÉS de `expresar` en las
dos implementaciones: si el modelo mete un número que no venía de `decidir`,
el mensaje se descarta y sale la plantilla.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Protocol

from normalizador.unidades import normalizar_texto

from .config import cfg
from .politica import Accion, Movida, Pregunta

log = logging.getLogger(__name__)

INTENCIONES = ("precio", "aclaracion", "sin_stock", "condicion", "otro")


@dataclass
class ItemInterpretado:
    texto_producto: str
    precio_texto: str | None = None
    unidad_texto: str | None = None
    condiciones: dict = field(default_factory=dict)

    def como_dict(self) -> dict:
        return {
            "texto_producto": self.texto_producto,
            "precio_texto": self.precio_texto,
            "unidad_texto": self.unidad_texto,
            "condiciones": self.condiciones,
        }


@dataclass
class Interpretacion:
    intencion: str
    items: list[ItemInterpretado] = field(default_factory=list)

    def como_dict(self) -> dict:
        return {"intencion": self.intencion, "items": [i.como_dict() for i in self.items]}


class LLM(Protocol):
    def interpretar(self, texto: str, contexto_items: list[dict]) -> Interpretacion: ...
    def expresar(self, movidas: list[dict], tono: dict) -> list[str]: ...


# ── Schema de `interpretar` ─────────────────────────────────────────────────
# Estricto a propósito: el modelo devuelve TEXTO en `precio_texto` y
# `unidad_texto`, nunca números ya calculados. La aritmética es del
# normalizador, que es puro y testeado.
ESQUEMA_INTERPRETACION = {
    "type": "object",
    "additionalProperties": False,
    "required": ["intencion", "items"],
    "properties": {
        "intencion": {"type": "string", "enum": list(INTENCIONES)},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["texto_producto", "precio_texto", "unidad_texto", "condiciones"],
                "properties": {
                    "texto_producto": {"type": "string"},
                    "precio_texto": {
                        "type": ["string", "null"],
                        "description": "El precio TAL CUAL lo escribió el proveedor, sin convertir ni calcular. Ej: '38.900', '96 lucas'.",
                    },
                    "unidad_texto": {
                        "type": ["string", "null"],
                        "description": "En qué unidad lo expresó, tal cual. Ej: 'la caja', 'caja x100', 'c/u', 'ampolla x1'.",
                    },
                    "condiciones": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["pago", "vencimiento", "entrega"],
                        "properties": {
                            "pago": {"type": ["string", "null"]},
                            "vencimiento": {"type": ["string", "null"]},
                            "entrega": {"type": ["string", "null"]},
                        },
                    },
                },
            },
        },
    },
}

PROMPT_INTERPRETAR = """\
Sos un extractor de datos de mensajes de WhatsApp de proveedores de una droguería.

Tu ÚNICA tarea es convertir el mensaje en estructura. NO calcules, NO conviertas
unidades, NO redondees, NO estimes. Si el proveedor escribió "96 lucas", el campo
precio_texto vale exactamente "96 lucas".

Reglas:
- Un mensaje puede traer varios productos: devolvé un ítem por producto.
- Si no dice precio, precio_texto = null. Nunca lo inventes ni lo infieras.
- Si no aclara la unidad ("la caja", "c/u", "x100"), unidad_texto = null.
- Si dice que no tiene stock, intencion = "sin_stock" e items = [].
- Si sólo dice que va a confirmar más tarde o hace una pregunta, intencion = "otro"
  o "aclaracion", con los ítems que sí haya mencionado.
- Las condiciones (plazo de pago, vencimiento, entrega parcial) van en condiciones,
  con el texto original.

Le habíamos pedido precio por estos ítems (usalos sólo para saber de qué habla,
no para completar datos que el proveedor no dio):
{contexto}
"""

PROMPT_EXPRESAR = """\
Sos {nombre}, {rol} de una droguería. Escribís por WhatsApp a proveedores.

Tono: {tono}. Mensajes cortos, argentinos, sin formalismo excesivo, sin emojis
salvo que se indique lo contrario.

REGLA ABSOLUTA: los únicos números que podés escribir son los que están en las
movidas de abajo, exactamente como figuran. No calcules totales, no redondees,
no menciones precios que no estén ahí. Si una movida no trae número, no pongas
ninguno.

Escribí UN mensaje que cubra todas las movidas (son ítems de la misma
conversación). Si son varias, usá una línea por ítem.

Movidas:
{movidas}
"""


# ── Implementación determinística (CI, tests, fallback) ─────────────────────

_RE_PRECIO = re.compile(
    r"(?:\$\s*)?(\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*"
    r"(lucas?|palos?|mil|millones|k)?",
    re.IGNORECASE,
)
_RE_UNIDAD = re.compile(
    r"(la caja|las cajas|caja x\s*\d+|caja de \d+|caja por \d+|caja|blister x\s*\d+|"
    r"bulto de \d+|ampolla x\s*\d+|frasco x\s*\d+|el frasco|el sachet|c/?u|por unidad|"
    r"la unidad|x\s*\d+)",
    re.IGNORECASE,
)
_SIN_STOCK = ("no tengo", "sin stock", "no me queda", "no hay", "agotado", "no tenemos")
_MAS_TARDE = ("te confirmo", "mas tarde", "más tarde", "consulto", "dejame ver", "te aviso")


class LLMDeterminista:
    """Sin red. Heurísticas para interpretar, plantillas para expresar.

    No pretende igualar a un LLM en `interpretar`: pretende ser suficiente
    para los tests y honesta en producción (si no entiende, devuelve el ítem
    sin precio y el pipeline termina re-preguntando, que es el default seguro).
    """

    def interpretar(self, texto: str, contexto_items: list[dict]) -> Interpretacion:
        t = normalizar_texto(texto)
        if any(s in t for s in _SIN_STOCK):
            return Interpretacion("sin_stock", [])

        items: list[ItemInterpretado] = []
        for fragmento in self._partir(texto):
            producto = self._producto_mencionado(fragmento, contexto_items)
            if producto is None:
                continue
            items.append(
                ItemInterpretado(
                    texto_producto=producto,
                    precio_texto=self._precio(fragmento),
                    unidad_texto=self._unidad(fragmento),
                    condiciones=self._condiciones(fragmento),
                )
            )

        if not items:
            return Interpretacion("otro" if any(s in t for s in _MAS_TARDE) else "aclaracion", [])
        if all(i.precio_texto is None for i in items):
            return Interpretacion("aclaracion", items)
        return Interpretacion("precio", items)

    # -- helpers --

    @staticmethod
    def _partir(texto: str) -> list[str]:
        # Un mensaje suele traer varios ítems separados por " y ", punto o
        # salto de línea. El punto pide espacio después, para no partir
        # "38.900" al medio.
        partes = re.split(r"\s+y\s+(?=\w)|[;\n]|\.\s+", texto)
        return [p.strip() for p in partes if p.strip()]

    @staticmethod
    def _producto_mencionado(fragmento: str, contexto_items: list[dict]) -> str | None:
        """Se queda con el texto del producto sólo si nombra algo del contexto."""
        f = normalizar_texto(fragmento)
        mejor: tuple[int, str] | None = None
        for it in contexto_items:
            droga = normalizar_texto(it.get("droga") or "")
            if not droga:
                continue
            for token in droga.split():
                for largo in range(len(token), 3, -1):
                    if token[:largo] in f:
                        if mejor is None or largo > mejor[0]:
                            mejor = (largo, fragmento.strip())
                        break
        return mejor[1] if mejor else None

    @staticmethod
    def _precio(fragmento: str) -> str | None:
        # El precio es el número "grande" o el que trae multiplicador; los
        # números de presentación ("x100", "caja de 60") se descartan.
        candidatos: list[str] = []
        for m in _RE_PRECIO.finditer(fragmento):
            antes = fragmento[max(0, m.start() - 12):m.start()].lower()
            if re.search(r"(x|de|por)\s*$", antes.strip()) and not m.group(2):
                continue
            if re.search(r"\b(mg|ml|ui|g|%)\b", fragmento[m.end():m.end() + 5].lower()):
                continue
            candidatos.append(m.group(0).strip())
        if not candidatos:
            return None
        con_mult = [c for c in candidatos if re.search(r"[a-z]", c, re.IGNORECASE)]
        if con_mult:
            return con_mult[-1]
        return max(candidatos, key=lambda c: len(re.sub(r"\D", "", c)))

    @staticmethod
    def _unidad(fragmento: str) -> str | None:
        m = _RE_UNIDAD.search(fragmento)
        return m.group(0) if m else None

    @staticmethod
    def _condiciones(fragmento: str) -> dict:
        f = normalizar_texto(fragmento)
        cond: dict = {}
        m = re.search(r"pago\s*(?:a|en)?\s*([\w\s]{0,15}d[ií]as?|contado)", f)
        if m:
            cond["pago"] = m.group(1).strip()
        m = re.search(r"vence\w*\s*(?:en|el)?\s*([\w\s/\-]{3,20})", f)
        if m:
            cond["vencimiento"] = m.group(1).strip()
        if "parcial" in f:
            cond["entrega"] = "parcial"
        return cond

    def expresar(self, movidas: list[dict], tono: dict) -> list[str]:
        return [plantilla(m) for m in movidas]


# ── Plantillas: la red de seguridad de `expresar` ───────────────────────────

_PREGUNTAS = {
    Pregunta.UNIDADES_POR_PRESENTACION.value: "¿la caja de {producto} de cuántas unidades es?",
    Pregunta.PRECIO_POR_UNIDAD.value: "¿me pasás el precio por unidad de {producto}?",
    Pregunta.PRECIO_ILEGIBLE.value: "no me quedó claro el precio de {producto}, ¿me lo repetís?",
    Pregunta.CONFIRMAR_PRODUCTO.value: "¿me confirmás que {producto} es lo que estás cotizando?",
    Pregunta.CONFIRMAR_PRESENTACION.value: "necesito {producto} en {presentacion_requerida}, ¿lo tenés en ese formato?",
}


def plantilla(m: dict) -> str:
    """Mensaje determinístico para una movida. Sólo usa números de la movida."""
    accion = m.get("accion")
    producto = m.get("producto") or "ese ítem"
    if accion == Accion.ACEPTAR.value:
        return f"Perfecto, tomo {producto}. Gracias."
    if accion == Accion.COUNTER.value:
        return f"Por {producto}, ¿me lo podés dejar en {m.get('precio_contraoferta')}?"
    if accion == Accion.CLARIFICAR.value:
        pregunta = _PREGUNTAS.get(m.get("pregunta") or "", "¿me aclarás el precio de {producto}?")
        return pregunta.format(
            producto=producto,
            presentacion_requerida=m.get("presentacion_requerida") or "el formato pedido",
        )
    if accion == Accion.MARCAR_SIN_STOCK.value:
        return f"Dale, gracias por avisar por {producto}."
    if accion == Accion.DESCARTAR.value:
        return f"Gracias igual por {producto}, esta vez no llegamos."
    if accion == Accion.ESCALAR_HUMANO.value:
        return f"Gracias, lo reviso con el equipo y te confirmo por {producto}."
    return "Gracias, quedo atento."


# ── Implementación OpenAI ───────────────────────────────────────────────────


class LLMOpenAI:
    def __init__(self) -> None:
        from openai import OpenAI

        self._cliente = OpenAI(api_key=cfg().openai_api_key)

    def interpretar(self, texto: str, contexto_items: list[dict]) -> Interpretacion:
        contexto = "\n".join(
            f"- {i.get('droga')} {i.get('concentracion')} {i.get('forma')} ({i.get('presentacion_requerida')})"
            for i in contexto_items
        ) or "- (sin contexto)"
        r = self._cliente.chat.completions.create(
            model=cfg().modelo_interpretar,
            temperature=0,
            messages=[
                {"role": "system", "content": PROMPT_INTERPRETAR.format(contexto=contexto)},
                {"role": "user", "content": texto},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "interpretacion", "strict": True, "schema": ESQUEMA_INTERPRETACION},
            },
        )
        datos = json.loads(r.choices[0].message.content or "{}")
        items = [
            ItemInterpretado(
                texto_producto=i.get("texto_producto", ""),
                precio_texto=i.get("precio_texto"),
                unidad_texto=i.get("unidad_texto"),
                condiciones={k: v for k, v in (i.get("condiciones") or {}).items() if v},
            )
            for i in datos.get("items", [])
        ]
        intencion = datos.get("intencion", "otro")
        return Interpretacion(intencion if intencion in INTENCIONES else "otro", items)

    def expresar(self, movidas: list[dict], tono: dict) -> list[str]:
        detalle = "\n".join(
            f"- {m.get('accion')} · producto: {m.get('producto')} · "
            f"{'precio a proponer: ' + str(m['precio_contraoferta']) if m.get('precio_contraoferta') else ''}"
            f"{'preguntar: ' + str(m.get('pregunta')) if m.get('pregunta') else ''}"
            for m in movidas
        )
        r = self._cliente.chat.completions.create(
            model=cfg().modelo_expresar,
            temperature=0.3,
            messages=[
                {
                    "role": "system",
                    "content": PROMPT_EXPRESAR.format(
                        nombre=tono.get("nombre", "Compras"),
                        rol=tono.get("rol", "responsable de compras"),
                        tono=tono.get("tono", "directo y cordial"),
                        movidas=detalle,
                    ),
                },
                {"role": "user", "content": "Escribí el mensaje."},
            ],
        )
        texto = (r.choices[0].message.content or "").strip()
        return [t.strip() for t in texto.split("\n\n") if t.strip()] or [plantilla(m) for m in movidas]


def obtener_llm() -> LLM:
    """El LLM configurado. Si OpenAI no está disponible, degrada sin romper."""
    if cfg().usa_openai:
        try:
            return LLMOpenAI()
        except Exception:  # pragma: no cover - depende del entorno
            log.exception("no se pudo inicializar OpenAI; se sigue en modo determinista")
    return LLMDeterminista()


def embedding(texto: str) -> list[float] | None:
    """Embedding del texto (misma dimensión que `kb_embeddings`: 1536)."""
    if not cfg().usa_openai:
        return None
    try:
        from openai import OpenAI

        cliente = OpenAI(api_key=cfg().openai_api_key)
        r = cliente.embeddings.create(model=cfg().modelo_embeddings, input=texto)
        return r.data[0].embedding
    except Exception:  # pragma: no cover
        log.exception("falló el embedding; se sigue con match léxico")
        return None


def a_decimal(valor: object) -> Decimal | None:
    if valor is None:
        return None
    try:
        return Decimal(str(valor))
    except Exception:
        return None
