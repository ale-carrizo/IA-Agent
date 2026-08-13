"""Generación del presupuesto. Es el último paso y el único irreversible.

    precio final por ítem = mejor precio confirmado × (1 + margen_pct/100)

Nada más. La cuenta está acá, en tres líneas, para que se pueda leer entera.

El gate es sagrado (§10 del brief): esta función SÓLO corre después de que la
auditoría dio verde y un humano apretó aprobar. Guarda el snapshot completo
con trazabilidad por línea — proveedor, texto crudo, hora y canal — porque un
presupuesto presentado tiene que poder auditarse aunque después cambie todo.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from . import eventos
from .auditoria import auditar, mejores_por_item
from .db import conexion, uno

_CENTAVOS = Decimal("0.01")


def generar(licitacion_id: int, aprobado_por: str | None = None, *, forzar: bool = False) -> dict:
    """Arma, guarda y devuelve el presupuesto. Falla si la auditoría bloquea."""
    informe = auditar(licitacion_id, registrar_evento=False)
    if informe["bloqueos"] and not forzar:
        return {"ok": False, "motivo": "la auditoría bloquea la aprobación", "auditoria": informe}

    with conexion() as conn:
        lic = uno(conn, "select * from licitaciones where id = %s", (licitacion_id,))
        margen = Decimal(str(lic["margen_pct"]))
        factor = Decimal(1) + margen / Decimal(100)

        lineas = []
        total = Decimal(0)
        for e in mejores_por_item(conn, licitacion_id):
            if not e.get("cotizacion_id") or e.get("precio_unitario") is None:
                continue
            unitario = Decimal(e["precio_unitario"])
            final = (unitario * factor).quantize(_CENTAVOS, rounding=ROUND_HALF_UP)
            cantidad = int(e["cantidad"])
            subtotal = (final * cantidad).quantize(_CENTAVOS, rounding=ROUND_HALF_UP)
            total += subtotal
            lineas.append(
                {
                    "item_id": int(e["item_id"]),
                    "producto": f"{e['droga']} {e['concentracion']}" if e.get("droga") else e["descripcion_original"],
                    "descripcion_original": e["descripcion_original"],
                    "presentacion": e["presentacion_requerida"],
                    "cantidad": cantidad,
                    "proveedor": e["proveedor"],
                    "proveedor_id": int(e["proveedor_id"]),
                    "cotizacion_id": int(e["cotizacion_id"]),
                    "precio_costo": str(unitario),
                    "precio_final": str(final),
                    "subtotal": str(subtotal),
                    "confianza": float(e["confianza"] or 0),
                    # ── trazabilidad: de qué mensaje salió este número ──
                    "raw_respuesta": e.get("raw_respuesta"),
                    "canal": e.get("canal"),
                    "respondida_en": e["respondida_en"].isoformat() if e.get("respondida_en") else None,
                    "condiciones": e.get("condiciones") or {},
                }
            )

        import json

        fila = uno(
            conn,
            """insert into presupuestos (licitacion_id, margen_pct, total, lineas, aprobado_por)
               values (%s, %s, %s, %s::jsonb, %s) returning id, creado""",
            (licitacion_id, margen, total, json.dumps(lineas, ensure_ascii=False, default=str), aprobado_por),
        )
        conn.execute("update licitaciones set estado = 'aprobada' where id = %s", (licitacion_id,))
        eventos.registrar(
            conn,
            eventos.PRESUPUESTO_APROBADO,
            licitacion_id=licitacion_id,
            payload={
                "presupuesto_id": int(fila["id"]),
                "total": str(total),
                "lineas": len(lineas),
                "aprobado_por": aprobado_por,
                "forzado": forzar,
            },
        )

    return {
        "ok": True,
        "presupuesto_id": int(fila["id"]),
        "licitacion_id": licitacion_id,
        "hospital": lic["hospital"],
        "margen_pct": str(margen),
        "total": str(total),
        "lineas": lineas,
        "auditoria": informe,
    }
