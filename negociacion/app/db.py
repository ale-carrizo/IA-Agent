"""Acceso a Postgres. Pool sincrónico de psycopg3.

Sincrónico a propósito: los endpoints de FastAPI se declaran `def` (no `async
def`), así que corren en el threadpool y no hay que teñir de `await` todo el
grafo. Menos superficie para bugs de concurrencia en un servicio que, además,
es de tráfico bajo (decenas de mensajes por minuto, no miles).

Postgres es la ÚNICA fuente de verdad: este servicio no guarda estado en
memoria. Si se reinicia en mitad de una licitación, retoma leyendo la base y
los checkpoints de LangGraph.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import cfg

_pool: ConnectionPool | None = None


def pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        url = cfg().database_url
        if not url:
            raise RuntimeError("DATABASE_URL no configurada")
        _pool = ConnectionPool(url, min_size=1, max_size=10, kwargs={"row_factory": dict_row}, open=True)
    return _pool


def cerrar_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def conexion() -> Iterator[Connection]:
    """Conexión del pool con transacción. Commit al salir, rollback si explota."""
    with pool().connection() as conn:
        yield conn


def consultar(conn: Connection, sql: str, params: Any = None) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def uno(conn: Connection, sql: str, params: Any = None) -> dict | None:
    filas = consultar(conn, sql, params)
    return filas[0] if filas else None


def ejecutar(conn: Connection, sql: str, params: Any = None) -> int:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.rowcount
