"""Tipos del normalizador. Stdlib pura, sin pydantic ni ORM.

El normalizador NO habla con la base. Recibe los candidatos ya buscados
(embedding o léxico) y devuelve un resultado inmutable. Eso lo hace testeable
contra el golden dataset sin levantar nada.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

__all__ = ["ProductoCatalogo", "Candidato", "ItemCrudo", "Requerido", "Normalizado"]


@dataclass(frozen=True)
class ProductoCatalogo:
    """Una fila de `catalogo_maestro`."""

    id: int
    droga: str
    concentracion: str
    forma: str
    presentacion: str
    unidades_por_presentacion: int
    codigo_externo: str | None = None


@dataclass(frozen=True)
class Candidato:
    """Producto del catálogo + qué tan parecido es al texto del proveedor.

    `similitud` (0..1) la calcula el caller: coseno del embedding en producción,
    `lexico.similitud_lexica` cuando no hay embeddings cargados.
    """

    producto: ProductoCatalogo
    similitud: float


@dataclass(frozen=True)
class ItemCrudo:
    """Un ítem tal como lo devolvió el nodo `interpretar` del grafo.

    Todos los campos son texto: el LLM traduce lenguaje → estructura, no hace
    cuentas ni normaliza. La aritmética es de este módulo.
    """

    texto_producto: str
    precio_texto: str | None = None
    unidad_texto: str | None = None
    condiciones: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Requerido:
    """El ítem del pliego contra el que se está cotizando (`items_licitacion`)."""

    item_id: int
    producto_id: int | None
    descripcion_original: str
    presentacion_requerida: str
    unidades_requeridas: int | None = None
    forma: str | None = None
    concentracion: str | None = None


@dataclass(frozen=True)
class Normalizado:
    """Salida del normalizador. `motivos` es la explicación auditable de la
    confianza — es lo que ve el operador en el panel cuando algo se traba."""

    producto_id: int | None
    precio_unitario: Decimal | None
    precio_por_presentacion: Decimal | None
    presentacion: str
    unidades_por_presentacion: int | None
    confianza: float
    conversion_exacta: bool
    presentacion_igual_a_requerida: bool
    motivos: tuple[str, ...] = ()

    @property
    def utilizable(self) -> bool:
        """Mínimo para que la política pueda siquiera evaluar un precio."""
        return self.producto_id is not None and self.precio_unitario is not None
