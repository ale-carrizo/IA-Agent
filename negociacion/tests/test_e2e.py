"""Test de integración end-to-end: el caso de uso de la §8 del brief.

Corre la licitación completa contra una base real, con los proveedores
simulados (los mensajes son los del brief) y sin llamar a ninguna API: el LLM
va en modo determinista y la salida a canales está mockeada.

    carga → salen los mensajes → llegan respuestas → se normalizan →
    la matriz se llena → una excepción se abre → se resuelve →
    la auditoría bloquea y desbloquea → la aprobación genera el presupuesto
    con trazabilidad

Es la *definition of done* de V1. Se saltea solo si no hay `DATABASE_URL`:

    export DATABASE_URL=postgres://iaagent:dev@localhost:5432/agentes_dev
    .venv/bin/python -m pytest tests/test_e2e.py -v
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="necesita DATABASE_URL apuntando a una base con db/20 y db/21 aplicados",
)

AHORA = datetime.now(timezone.utc)
CIERRE_RECOLECCION = AHORA + timedelta(hours=7)
CIERRE_PRESENTACION = AHORA + timedelta(hours=9)

# El sobre se fija explícito para que el escenario sea legible: sin esto lo
# calcularía del histórico y habría que leer el seed para entender el test.
PLIEGO = [
    {"descripcion": "Amoxicilina 500 mg comprimido", "cantidad": 500, "presentacion": "caja x100",
     "precio_objetivo": 400, "precio_max_aceptable": 450},
    {"descripcion": "Ceftriaxona 1 g ampolla", "cantidad": 200, "presentacion": "caja x50",
     "precio_objetivo": 1900, "precio_max_aceptable": 2200},
    {"descripcion": "Paracetamol 500 mg comprimido", "cantidad": 1000, "presentacion": "caja x100",
     "precio_objetivo": 100, "precio_max_aceptable": 120},
    {"descripcion": "Ibuprofeno 600 mg comprimido", "cantidad": 300, "presentacion": "caja x100",
     "precio_objetivo": 155, "precio_max_aceptable": 175},
]

ANDES, PLATA, SUR, CENTRAL = "5491133330001", "5491133330002", "5491133330003", "5491133330004"


@pytest.fixture
def enviados(monkeypatch):
    """Intercepta la salida a canales. El servicio nunca habla con WhatsApp."""
    from app import main, supervisor

    capturados: list[dict] = []

    def falso_enviar(telefono, burbujas, *, canal="whatsapp", meta=None):
        capturados.append({"telefono": telefono, "burbujas": list(burbujas), "canal": canal, "meta": meta or {}})
        return True

    monkeypatch.setattr(supervisor, "enviar", falso_enviar)
    monkeypatch.setattr(main, "enviar", falso_enviar)
    monkeypatch.setenv("LLM_MODO", "determinista")
    from app.config import cfg

    cfg.cache_clear()
    yield capturados
    cfg.cache_clear()


@pytest.fixture
def licitacion(enviados):
    """Crea la licitación y la borra al final (la base queda como estaba)."""
    from app.db import conexion, ejecutar
    from app.supervisor import crear_licitacion

    resultado = crear_licitacion(
        {
            "hospital": "Hospital Central (test E2E)",
            "cierre_presentacion": CIERRE_PRESENTACION.isoformat(),
            "cierre_recoleccion": CIERRE_RECOLECCION.isoformat(),
            "margen_pct": 18,
            "items": PLIEGO,
        }
    )
    yield resultado
    with conexion() as conn:
        ejecutar(conn, "delete from eventos where licitacion_id = %s", (resultado["licitacion_id"],))
        ejecutar(conn, "delete from presupuestos where licitacion_id = %s", (resultado["licitacion_id"],))
        ejecutar(conn, "delete from excepciones where licitacion_id = %s", (resultado["licitacion_id"],))
        ejecutar(conn, "delete from licitaciones where id = %s", (resultado["licitacion_id"],))


def _responder(telefono: str, texto: str) -> dict:
    """Simula que un proveedor contesta por WhatsApp (lo que hace n8n)."""
    from app.main import MensajeEntrante, mensajes

    return mensajes(MensajeEntrante(telefono_e164=telefono, texto=texto, canal="whatsapp"))


def _matriz(licitacion_id: int) -> dict[tuple[str, str], dict]:
    """(droga, proveedor) → estado de la celda. Es lo que muestra el panel."""
    from app.db import conexion, consultar

    with conexion() as conn:
        filas = consultar(
            conn,
            """select cm.droga, p.nombre as proveedor, c.estado, c.precio_unitario,
                      c.confianza, c.presentacion_ofrecida
                 from cotizaciones c
                 join items_licitacion i on i.id = c.item_id
                 join proveedores p on p.id = c.proveedor_id
                 left join catalogo_maestro cm on cm.id = i.producto_id
                where i.licitacion_id = %s""",
            (licitacion_id,),
        )
    return {(f["droga"], f["proveedor"]): f for f in filas}


# ── El caso ─────────────────────────────────────────────────────────────────


def test_e2e_licitacion_completa(licitacion, enviados):
    from app.auditoria import auditar
    from app.db import conexion, consultar, uno
    from app.main import Reanudar, resume
    from app.supervisor import cerrar_recoleccion, tick

    licitacion_id = licitacion["licitacion_id"]

    # ── 9:02 · el operador carga el pliego ──────────────────────────────
    assert licitacion["items"] == 4
    assert licitacion["cotizaciones"] == 10, "4 ítems × los proveedores que venden cada uno"
    assert licitacion["items_sin_match"] == [], "los 4 ítems tienen que matchear el catálogo"
    assert len(enviados) == 4, "un mensaje por proveedor, con TODOS sus ítems agrupados"
    primer_mensaje = next(e for e in enviados if e["telefono"] == ANDES)["burbujas"][0]
    assert primer_mensaje.count("•") == 4, "a Andes se le piden sus 4 ítems en un solo mensaje"

    with conexion() as conn:
        threads = consultar(
            conn,
            """select c.proveedor_id, count(distinct c.thread_id) as n
                 from cotizaciones c join items_licitacion i on i.id = c.item_id
                where i.licitacion_id = %s group by c.proveedor_id""",
            (licitacion_id,),
        )
    assert all(int(t["n"]) == 1 for t in threads), "un thread por proveedor × licitación"

    # ── 9:15 · proveedor A (Andes) ──────────────────────────────────────
    #  amoxi entra en el sobre; ceftriaxona viene en otra presentación;
    #  ibuprofeno entra.
    r = _responder(
        ANDES,
        "la amoxi te la dejo 38.900 la caja, tengo stock. "
        "la ceftriaxona anda 96 lucas pero solo en ampolla x1. "
        "el ibuprofeno 600 caja x100 a 15.000",
    )
    assert r["ok"]
    m = _matriz(licitacion_id)
    assert m[("Amoxicilina", "Laboratorio Andes")]["estado"] == "confirmada"
    assert m[("Amoxicilina", "Laboratorio Andes")]["precio_unitario"] == Decimal("389.00")
    assert m[("Ceftriaxona", "Laboratorio Andes")]["estado"] == "aclarando", (
        "presentación distinta a la pedida: se re-pregunta, no se acepta"
    )
    assert m[("Ibuprofeno", "Laboratorio Andes")]["estado"] == "confirmada"
    assert r["burbujas"], "tiene que salir una respuesta al proveedor"

    # ── 9:20 · proveedor B (Plata): dos ítems, los dos entran ───────────
    _responder(PLATA, "te paso amoxicilina caja x100 a 39.500 y ceftriaxona 1g caja x50 a 92.000")
    m = _matriz(licitacion_id)
    assert m[("Amoxicilina", "Distribuidora del Plata")]["estado"] == "confirmada"
    assert m[("Ceftriaxona", "Distribuidora del Plata")]["precio_unitario"] == Decimal("1840.00")

    # ── 9:40 · proveedor C (Sur): "la caja" sin cantidad → ambiguo ──────
    _responder(SUR, "el paracetamol 500 caja x100 a 9.900 y el ibuprofeno te lo paso a 14.500 la caja")
    m = _matriz(licitacion_id)
    assert m[("Paracetamol", "Farma Sur")]["estado"] == "confirmada"
    assert m[("Ibuprofeno", "Farma Sur")]["estado"] == "aclarando", (
        "el ibuprofeno viene en caja x50 y x100: no se puede inferir"
    )
    assert m[("Ibuprofeno", "Farma Sur")]["precio_unitario"] is None, "nunca se guarda un precio adivinado"

    # ── 11:00 · proveedor D (Central): buen precio, mala condición ──────
    r = _responder(CENTRAL, "ceftriaxona 1g caja x50 a 91.000 pero con pago a 7 días")
    assert r["esperando_humano"], "una condición fuera de política pausa el grafo"
    assert r["burbujas"] == [], "al proveedor no se le contesta hasta que decida un humano"

    with conexion() as conn:
        pendientes = consultar(
            conn,
            "select * from excepciones where licitacion_id = %s and estado = 'pendiente'",
            (licitacion_id,),
        )
    assert len(pendientes) == 1
    assert "7 días" in pendientes[0]["motivo"] or "7 dias" in pendientes[0]["motivo"]
    excepcion = pendientes[0]

    # ── 13:30 · /tick: nadie más contesta, se escala ────────────────────
    resultado_tick = tick(ahora=CIERRE_RECOLECCION - timedelta(hours=1))
    assert resultado_tick["escalaciones"] > 0, "cerca del cierre y sin respuesta → escalacion.voz"
    with conexion() as conn:
        escalaciones = consultar(
            conn,
            "select * from eventos where licitacion_id = %s and tipo = 'escalacion.voz'",
            (licitacion_id,),
        )
    assert escalaciones, "la escalación queda como evento (V1: tarea manual en el panel)"

    # ── 16:30 · cierre de recolección → auditoría ───────────────────────
    cierre = cerrar_recoleccion(licitacion_id, ahora=CIERRE_RECOLECCION)
    informe = cierre["auditoria"]
    assert informe["aprobable"] is False, "hay una excepción sin resolver: no se puede aprobar"
    assert any(b["check"] == "excepcion" for b in informe["bloqueos"])

    with conexion() as conn:
        lic = uno(conn, "select estado from licitaciones where id = %s", (licitacion_id,))
    assert lic["estado"] == "auditando"

    # ── El operador resuelve la excepción desde el panel ────────────────
    resume(
        Reanudar(
            thread_id=str(excepcion["thread_id"]),
            excepcion_id=int(excepcion["id"]),
            decision={"accion": "descartar", "motivo": "no aceptamos pago a 7 días"},
            resuelta_por="operador@drogueria",
        )
    )
    with conexion() as conn:
        quedan = consultar(
            conn,
            "select id from excepciones where licitacion_id = %s and estado = 'pendiente'",
            (licitacion_id,),
        )
    assert quedan == [], "resolver no puede dejar (ni duplicar) excepciones pendientes"

    # ── La auditoría ahora deja aprobar ─────────────────────────────────
    informe = auditar(licitacion_id, registrar_evento=False)
    assert informe["aprobable"] is True, f"sigue bloqueada: {informe['bloqueos']}"
    assert informe["items_cubiertos"] == 4
    assert any(a["check"] == "cobertura" for a in informe["advertencias"]), (
        "paracetamol tiene un solo precio: warning 'sin comparación', no bloqueo"
    )

    # ── Aprobación → presupuesto con trazabilidad ───────────────────────
    from app.presupuesto import generar

    presupuesto = generar(licitacion_id, aprobado_por="operador@drogueria")
    assert presupuesto["ok"]
    assert len(presupuesto["lineas"]) == 4

    # el mejor precio confirmado por ítem, con el margen aplicado
    amoxi = next(l for l in presupuesto["lineas"] if "Amoxicilina" in l["producto"])
    assert amoxi["precio_costo"] == "389.00", "gana el más barato de los dos confirmados"
    assert amoxi["proveedor"] == "Laboratorio Andes"
    assert Decimal(amoxi["precio_final"]) == Decimal("389.00") * Decimal("1.18")

    # trazabilidad: de qué mensaje, de qué proveedor y a qué hora salió cada precio
    for linea in presupuesto["lineas"]:
        assert linea["raw_respuesta"], "cada precio tiene que poder rastrearse al mensaje original"
        assert linea["canal"] and linea["respondida_en"]
        assert linea["confianza"] >= 0.85, "nada por debajo del umbral entra al presupuesto"

    total = sum(Decimal(l["subtotal"]) for l in presupuesto["lineas"])
    assert Decimal(presupuesto["total"]) == total

    with conexion() as conn:
        lic = uno(conn, "select estado from licitaciones where id = %s", (licitacion_id,))
        eventos_licitacion = consultar(
            conn, "select tipo from eventos where licitacion_id = %s order by id", (licitacion_id,)
        )
    assert lic["estado"] == "aprobada"

    # El log de eventos permite reconstruir la licitación entera (replay).
    tipos = [e["tipo"] for e in eventos_licitacion]
    for esperado in [
        "licitacion.creada",
        "cotizacion.solicitada",
        "respuesta.recibida",
        "cotizacion.confirmada",
        "cotizacion.ambigua",
        "cotizacion.excepcion",
        "escalacion.voz",
        "recoleccion.cerrada",
        "auditoria.bloqueada",
        "presupuesto.aprobado",
    ]:
        assert esperado in tipos, f"falta el evento {esperado} en la bitácora"


def test_no_se_aprueba_con_la_auditoria_bloqueada(licitacion, enviados):
    """El gate es sagrado: sin auditoría en verde no hay presupuesto."""
    from app.presupuesto import generar

    resultado = generar(licitacion["licitacion_id"], aprobado_por="alguien")
    assert resultado["ok"] is False
    assert resultado["auditoria"]["bloqueos"], "sin ninguna cotización confirmada tiene que bloquear"


def test_mensaje_de_un_telefono_desconocido_no_rompe(licitacion, enviados):
    r = _responder("5491199999999", "hola, tenés algo para mí?")
    assert r["ok"] and r["burbujas"] == []
