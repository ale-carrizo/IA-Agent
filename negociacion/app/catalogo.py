"""Búsqueda de candidatos del catálogo para el normalizador.

El normalizador es puro y no toca la base: este módulo es el que le arma la
lista de candidatos. Devuelve `normalizador.Candidato`, nada más.

Dos estrategias, en este orden:

1. **Contexto de la conversación**: los productos que efectivamente le pedimos
   a ESE proveedor en ESA licitación. Es el ancla más fuerte que existe — el
   proveedor está contestando una pregunta concreta.
2. **Vecinos de catálogo**: todas las presentaciones que comparten droga +
   concentración + forma con los del contexto. Esto NO es opcional: es lo que
   le permite al normalizador saber que "la caja" es ambigua porque hay
   caja x50 y caja x100.

Encima de eso, si hay embeddings cargados y API key, se agregan los K más
cercanos por coseno para cubrir el caso "cotizó algo que no le pedimos".
"""

from __future__ import annotations

from psycopg import Connection

from normalizador import Candidato, ProductoCatalogo, similitud_lexica

from .config import cfg
from .db import consultar

_COLUMNAS = "id, droga, concentracion, forma, presentacion, unidades_por_presentacion, codigo_externo"


def _a_producto(fila: dict) -> ProductoCatalogo:
    return ProductoCatalogo(
        id=int(fila["id"]),
        droga=fila["droga"],
        concentracion=fila["concentracion"],
        forma=fila["forma"],
        presentacion=fila["presentacion"],
        unidades_por_presentacion=int(fila["unidades_por_presentacion"]),
        codigo_externo=fila.get("codigo_externo"),
    )


def universo_de_la_conversacion(conn: Connection, producto_ids: list[int]) -> list[ProductoCatalogo]:
    """Productos del contexto + todas sus presentaciones hermanas."""
    if not producto_ids:
        return []
    filas = consultar(
        conn,
        f"""
        select {_COLUMNAS} from catalogo_maestro
        where activo and (
              id = any(%(ids)s)
           or (droga, concentracion, forma) in (
                select droga, concentracion, forma
                from catalogo_maestro where id = any(%(ids)s)
              )
        )
        order by id
        """,
        {"ids": producto_ids},
    )
    return [_a_producto(f) for f in filas]


def vecinos_por_embedding(conn: Connection, texto: str, limite: int = 5) -> list[ProductoCatalogo]:
    """Top-K por distancia coseno. Vacío si no hay embeddings o no hay API key."""
    if not cfg().usa_openai:
        return []
    from .llm import embedding  # import perezoso: sin API key no se toca openai

    vector = embedding(texto)
    if vector is None:
        return []
    filas = consultar(
        conn,
        f"""select {_COLUMNAS} from catalogo_maestro
            where activo and embedding is not null
            order by embedding <=> %s::vector
            limit %s""",
        (str(vector), limite),
    )
    return [_a_producto(f) for f in filas]


def buscar_candidatos(
    conn: Connection,
    texto: str,
    producto_ids_contexto: list[int],
    *,
    limite: int = 12,
) -> list[Candidato]:
    """Candidatos ordenados por similitud descendente.

    El score es léxico incluso cuando el recall vino del embedding: así el
    número que alimenta la confianza es reproducible y explicable frente a una
    auditoría, en vez de depender de un modelo que puede cambiar de versión.
    """
    productos = universo_de_la_conversacion(conn, producto_ids_contexto)
    conocidos = {p.id for p in productos}
    for p in vecinos_por_embedding(conn, texto):
        if p.id not in conocidos:
            productos.append(p)
            conocidos.add(p.id)

    candidatos = [Candidato(p, similitud_lexica(texto, p)) for p in productos]
    candidatos.sort(key=lambda c: (-c.similitud, c.producto.id))
    return candidatos[:limite]
