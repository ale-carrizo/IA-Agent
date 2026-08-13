"""API HTTP del servicio de negociación. Es el contrato con n8n y con el panel.

    POST /mensajes       n8n → acá cuando contesta un proveedor
    POST /tick           scheduler de n8n cada 5 min (supervisor)
    POST /licitaciones   el panel carga un pliego
    POST /resume         el panel resuelve una excepción (reanuda el interrupt)
    GET  /health

Endpoints deliberadamente chicos: toda la lógica está en `grafo`, `politica` y
`supervisor`. Este archivo sólo traduce HTTP ↔ Python y decide códigos de
estado.
"""

from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from . import eventos
from .auditoria import auditar
from .config import cfg
from .db import cerrar_pool, conexion, consultar, ejecutar, uno
from .presupuesto import generar
from .supervisor import cerrar_recoleccion, crear_licitacion, enviar, tick

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
log = logging.getLogger(__name__)

_grafo = None
_checkpointer_cm = None


def grafo():
    """Grafo compilado con `PostgresSaver` sobre la MISMA base del sistema.

    Los checkpoints son el mecanismo de pausa/reanuda: no hay una máquina de
    estados propia que mantener sincronizada.
    """
    global _grafo, _checkpointer_cm
    if _grafo is None:
        from langgraph.checkpoint.postgres import PostgresSaver

        from .grafo import construir

        _checkpointer_cm = PostgresSaver.from_conn_string(cfg().database_url)
        checkpointer = _checkpointer_cm.__enter__()
        checkpointer.setup()
        _grafo = construir(checkpointer)
    return _grafo


@asynccontextmanager
async def ciclo(app: FastAPI):
    yield
    cerrar_pool()
    if _checkpointer_cm is not None:
        _checkpointer_cm.__exit__(None, None, None)


app = FastAPI(title="Negociación de licitaciones", version="0.1.0", lifespan=ciclo)


def _autorizar(token: str | None) -> None:
    """Auth machine-to-machine, mismo patrón que `/api/preseed` del panel."""
    esperado = cfg().n8n_token
    if esperado and (token or "").strip() != esperado:
        raise HTTPException(status_code=401, detail="no autorizado")


# ── Modelos ─────────────────────────────────────────────────────────────────


class MensajeEntrante(BaseModel):
    telefono_e164: str
    texto: str
    canal: str = "whatsapp"
    message_id: str | None = None


class ItemPliego(BaseModel):
    descripcion: str
    cantidad: int
    presentacion: str = ""
    precio_max_aceptable: float | None = None
    precio_objetivo: float | None = None


class LicitacionNueva(BaseModel):
    hospital: str
    cierre_presentacion: str
    cierre_recoleccion: str | None = None
    margen_pct: float = 0
    expediente: str | None = None
    items: list[ItemPliego] = Field(default_factory=list)


class Reanudar(BaseModel):
    thread_id: str
    decision: dict[str, Any]
    excepcion_id: int | None = None
    resuelta_por: str | None = None


class Aprobacion(BaseModel):
    aprobado_por: str | None = None
    forzar: bool = False


# ── Endpoints ───────────────────────────────────────────────────────────────


@app.get("/health")
def health() -> dict:
    estado = {"ok": True, "llm": cfg().llm_modo, "salida_n8n": bool(cfg().n8n_salida_url)}
    try:
        with conexion() as conn:
            uno(conn, "select 1 as ok")
        estado["db"] = "ok"
    except Exception as e:
        estado["ok"] = False
        estado["db"] = f"error: {e}"
    return estado


@app.post("/mensajes")
def mensajes(m: MensajeEntrante, x_token: str | None = Header(default=None)) -> dict:
    """Un proveedor contestó. Resuelve el thread y hace correr el grafo."""
    _autorizar(x_token)
    telefono = "".join(ch for ch in m.telefono_e164 if ch.isdigit())

    with conexion() as conn:
        fila = uno(
            conn,
            """
            select c.thread_id, c.proveedor_id, i.licitacion_id
              from cotizaciones c
              join items_licitacion i on i.id = c.item_id
              join licitaciones l on l.id = i.licitacion_id
              join proveedores p on p.id = c.proveedor_id
             where p.telefono_e164 = %s
               and l.estado in ('abierta','recolectando')
               and c.thread_id is not null
             order by l.cierre_recoleccion asc
             limit 1
            """,
            (telefono,),
        )
        if not fila:
            # No hay licitación abierta para este teléfono: se registra y se
            # devuelve 200 para que n8n no reintente en loop.
            eventos.registrar(conn, eventos.RESPUESTA_RECIBIDA, payload={"telefono": telefono, "texto": m.texto, "sin_licitacion": True})
            return {"ok": True, "ignorado": "no hay licitación abierta para ese teléfono", "burbujas": []}

        eventos.registrar(
            conn,
            eventos.RESPUESTA_RECIBIDA,
            licitacion_id=int(fila["licitacion_id"]),
            payload={"telefono": telefono, "texto": m.texto, "canal": m.canal, "message_id": m.message_id},
        )

    thread_id = str(fila["thread_id"])
    estado = {
        "thread_id": thread_id,
        "licitacion_id": int(fila["licitacion_id"]),
        "proveedor_id": int(fila["proveedor_id"]),
        "telefono": telefono,
        "canal": m.canal,
        "message_id": m.message_id or "",
        "texto": m.texto,
    }
    salida = grafo().invoke(estado, config={"configurable": {"thread_id": thread_id}})

    interrumpido = bool(salida.get("__interrupt__"))
    return {
        "ok": True,
        "thread_id": thread_id,
        "burbujas": salida.get("burbujas") or [],
        "resumen": salida.get("resumen") or {},
        "esperando_humano": interrumpido,
    }


@app.post("/tick")
def endpoint_tick(x_token: str | None = Header(default=None)) -> dict:
    """Supervisor. Lo llama un scheduler de n8n cada 5 minutos."""
    _autorizar(x_token)
    return tick()


@app.post("/licitaciones")
def endpoint_licitaciones(l: LicitacionNueva, x_token: str | None = Header(default=None)) -> dict:
    _autorizar(x_token)
    try:
        return crear_licitacion(l.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/licitaciones/{licitacion_id}/auditoria")
def endpoint_auditoria(licitacion_id: int) -> dict:
    try:
        return auditar(licitacion_id, registrar_evento=False)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/licitaciones/{licitacion_id}/cerrar")
def endpoint_cerrar(licitacion_id: int, x_token: str | None = Header(default=None)) -> dict:
    _autorizar(x_token)
    return cerrar_recoleccion(licitacion_id)


@app.post("/licitaciones/{licitacion_id}/aprobar")
def endpoint_aprobar(licitacion_id: int, a: Aprobacion, x_token: str | None = Header(default=None)) -> dict:
    """El gate humano. Sin esto no sale nada hacia el hospital."""
    _autorizar(x_token)
    resultado = generar(licitacion_id, a.aprobado_por, forzar=a.forzar)
    if not resultado["ok"]:
        raise HTTPException(status_code=409, detail=resultado)
    return resultado


@app.post("/resume")
def resume(r: Reanudar, x_token: str | None = Header(default=None)) -> dict:
    """Reanuda un `interrupt()` con lo que decidió el operador en el panel."""
    _autorizar(x_token)
    from langgraph.types import Command

    # OJO con el orden: primero se reanuda el grafo, DESPUÉS se cierra la
    # excepción. Al reanudar, LangGraph vuelve a ejecutar el nodo `decidir`
    # desde el principio, y ese nodo abre la excepción si no encuentra una
    # pendiente. Si la cerráramos antes, el resume crearía un duplicado.
    salida = grafo().invoke(
        Command(resume=r.decision),
        config={"configurable": {"thread_id": r.thread_id}},
    )
    burbujas = salida.get("burbujas") or []

    with conexion() as conn:
        ejecutar(
            conn,
            """update excepciones
                  set estado = 'resuelta', decision = %s::jsonb,
                      resuelta_por = %s, resuelta_en = now()
                where estado = 'pendiente'
                  and (%s::bigint is null and thread_id = %s or id = %s::bigint)""",
            (
                json.dumps(r.decision, ensure_ascii=False),
                r.resuelta_por,
                r.excepcion_id,
                r.thread_id,
                r.excepcion_id,
            ),
        )
        eventos.registrar(conn, eventos.EXCEPCION_RESUELTA, payload={"thread_id": r.thread_id, "decision": r.decision})

    # El grafo produce el mensaje; el envío sigue siendo vía n8n.
    if burbujas:
        with conexion() as conn:
            prov = uno(
                conn,
                """select p.telefono_e164, p.canal_preferido
                     from cotizaciones c join proveedores p on p.id = c.proveedor_id
                    where c.thread_id = %s limit 1""",
                (r.thread_id,),
            )
        if prov:
            enviar(prov["telefono_e164"], burbujas, canal=prov["canal_preferido"] or "whatsapp",
                   meta={"thread_id": r.thread_id, "origen": "resume"})

    return {"ok": True, "burbujas": burbujas, "resumen": salida.get("resumen") or {}}


@app.get("/excepciones")
def excepciones(licitacion_id: int | None = None, estado: str = "pendiente") -> dict:
    with conexion() as conn:
        filas = consultar(
            conn,
            """
            select e.*, p.nombre as proveedor, i.descripcion_original
              from excepciones e
              left join cotizaciones c on c.id = e.cotizacion_id
              left join proveedores p on p.id = c.proveedor_id
              left join items_licitacion i on i.id = c.item_id
             where e.estado = %s
               and (%s::bigint is null or e.licitacion_id = %s::bigint)
             order by e.creado
            """,
            (estado, licitacion_id, licitacion_id),
        )
    return {"excepciones": filas}
