"""Bitácora append-only (`eventos`).

Todo lo que pasa en una licitación deja una fila acá. Con eso alcanza para
reconstruir la historia completa (replay) y para el trigger NOTIFY que
actualiza el panel — que es la razón por la que este sistema no necesita
Kafka ni RabbitMQ (§10 del brief).

Regla: se registra el hecho, no la interpretación. Nunca se borra ni se pisa.
"""

from __future__ import annotations

import json
from typing import Any

from psycopg import Connection

# Tipos de evento. La lista vive acá para que no se inventen strings sueltos.
LICITACION_CREADA = "licitacion.creada"
COTIZACION_SOLICITADA = "cotizacion.solicitada"
RESPUESTA_RECIBIDA = "respuesta.recibida"
COTIZACION_CONFIRMADA = "cotizacion.confirmada"
COTIZACION_AMBIGUA = "cotizacion.ambigua"
COTIZACION_EXCEPCION = "cotizacion.excepcion"
COTIZACION_DESCARTADA = "cotizacion.descartada"
COTIZACION_SIN_STOCK = "cotizacion.sin_stock"
CONTRAOFERTA_ENVIADA = "cotizacion.contraoferta"
RECORDATORIO_ENVIADO = "cotizacion.recordatorio"
ESCALACION_VOZ = "escalacion.voz"
RECOLECCION_CERRADA = "recoleccion.cerrada"
AUDITORIA_OK = "auditoria.ok"
AUDITORIA_BLOQUEADA = "auditoria.bloqueada"
PRESUPUESTO_APROBADO = "presupuesto.aprobado"
EXCEPCION_RESUELTA = "excepcion.resuelta"
ERROR_INTERPRETACION = "error.interpretacion"


def _json(valor: Any) -> str:
    return json.dumps(valor, ensure_ascii=False, default=str)


def registrar(
    conn: Connection,
    tipo: str,
    *,
    licitacion_id: int | None = None,
    cotizacion_id: int | None = None,
    payload: dict | None = None,
) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """insert into eventos (licitacion_id, cotizacion_id, tipo, payload)
               values (%s, %s, %s, %s::jsonb) returning id""",
            (licitacion_id, cotizacion_id, tipo, _json(payload or {})),
        )
        fila = cur.fetchone()
        return int(fila["id"])
