"""Auditoría de cierre: los checks que pueden BLOQUEAR una aprobación.

Corren al cerrar la recolección y cada vez que el panel refresca la pantalla
de aprobación. Son determinísticos y cada bloqueo sale con un motivo legible:
el operador tiene que poder leer por qué no puede apretar el botón.

Los cuatro checks del brief (§6):

1. Toda cotización usada tiene confianza ≥ umbral y presentación compatible
   con la pedida (conversión de unidades exacta).
2. El precio elegido está dentro de ±30% del histórico, o se marca outlier.
3. Cobertura: cada ítem con ≥1 confirmada; ideal ≥2 (con 1 sola, warning).
4. No queda ningún `interrupt` sin resolver.

`bloqueos` impide aprobar. `advertencias` no: se muestran y se aprueba igual.
"""

from __future__ import annotations

from decimal import Decimal

from normalizador import UMBRAL_CONFIANZA

from . import eventos
from .config import cfg
from .db import conexion, consultar, uno


def mejores_por_item(conn, licitacion_id: int) -> list[dict]:
    """La cotización elegida por ítem: la confirmada más barata.

    `distinct on` de Postgres hace exactamente esto en una consulta, y el
    criterio queda escrito en el `order by` — no repartido en código.
    """
    return consultar(
        conn,
        """
        select distinct on (i.id)
               i.id as item_id, i.descripcion_original, i.cantidad,
               i.presentacion_requerida, i.producto_id,
               c.id as cotizacion_id, c.precio_unitario, c.confianza,
               c.presentacion_ofrecida, c.unidades_ofrecidas, c.raw_respuesta,
               c.canal, c.respondida_en, c.condiciones,
               p.id as proveedor_id, p.nombre as proveedor,
               cm.droga, cm.concentracion, cm.forma, cm.presentacion,
               cm.unidades_por_presentacion,
               (select min(pi.ultimo_precio) from proveedores_items pi
                 where pi.producto_id = i.producto_id) as historico
          from items_licitacion i
          left join cotizaciones c
                 on c.item_id = i.id and c.estado = 'confirmada'
                and c.precio_unitario is not null
          left join proveedores p on p.id = c.proveedor_id
          left join catalogo_maestro cm on cm.id = i.producto_id
         where i.licitacion_id = %s
         order by i.id, c.precio_unitario asc nulls last
        """,
        (licitacion_id,),
    )


def auditar(licitacion_id: int, *, registrar_evento: bool = True) -> dict:
    bloqueos: list[dict] = []
    advertencias: list[dict] = []

    with conexion() as conn:
        lic = uno(conn, "select * from licitaciones where id = %s", (licitacion_id,))
        if not lic:
            raise ValueError(f"licitación {licitacion_id} inexistente")

        elegidas = mejores_por_item(conn, licitacion_id)
        conteos = {
            int(f["item_id"]): int(f["n"])
            for f in consultar(
                conn,
                """select i.id as item_id, count(c.id) as n
                     from items_licitacion i
                     left join cotizaciones c
                            on c.item_id = i.id and c.estado = 'confirmada'
                           and c.precio_unitario is not null
                    where i.licitacion_id = %s group by i.id""",
                (licitacion_id,),
            )
        }

        for e in elegidas:
            item_id = int(e["item_id"])
            etiqueta = e.get("droga") and f"{e['droga']} {e['concentracion']}" or e["descripcion_original"]

            # ── check 3: cobertura ──
            confirmadas = conteos.get(item_id, 0)
            if e.get("cotizacion_id") is None or confirmadas == 0:
                bloqueos.append(
                    {
                        "item_id": item_id,
                        "item": etiqueta,
                        "check": "cobertura",
                        "motivo": "no hay ninguna cotización confirmada para este ítem",
                    }
                )
                continue
            if confirmadas == 1:
                advertencias.append(
                    {
                        "item_id": item_id,
                        "item": etiqueta,
                        "check": "cobertura",
                        "motivo": "único precio, sin comparación",
                    }
                )

            # ── check 1a: confianza ──
            confianza = float(e["confianza"] or 0)
            if confianza < UMBRAL_CONFIANZA:
                bloqueos.append(
                    {
                        "item_id": item_id,
                        "item": etiqueta,
                        "check": "confianza",
                        "motivo": f"la cotización elegida tiene confianza {confianza:.2f} (< {UMBRAL_CONFIANZA})",
                        "cotizacion_id": int(e["cotizacion_id"]),
                    }
                )

            # ── check 1b: presentación compatible con conversión exacta ──
            requeridas = e.get("unidades_por_presentacion")
            ofrecidas = e.get("unidades_ofrecidas")
            if not ofrecidas:
                bloqueos.append(
                    {
                        "item_id": item_id,
                        "item": etiqueta,
                        "check": "presentacion",
                        "motivo": "no se registró de cuántas unidades es la presentación ofrecida",
                        "cotizacion_id": int(e["cotizacion_id"]),
                    }
                )
            elif requeridas and int(ofrecidas) != int(requeridas):
                bloqueos.append(
                    {
                        "item_id": item_id,
                        "item": etiqueta,
                        "check": "presentacion",
                        "motivo": (
                            f"ofrecieron {e.get('presentacion_ofrecida')} y el pliego pide "
                            f"{e['presentacion_requerida']}"
                        ),
                        "cotizacion_id": int(e["cotizacion_id"]),
                    }
                )

            # ── check 2: outlier contra el histórico ──
            historico = e.get("historico")
            precio = e.get("precio_unitario")
            if historico and precio:
                desvio = (Decimal(precio) - Decimal(historico)) / Decimal(historico)
                if abs(desvio) > cfg().desvio_outlier:
                    advertencias.append(
                        {
                            "item_id": item_id,
                            "item": etiqueta,
                            "check": "outlier",
                            "motivo": (
                                f"el precio elegido ({precio}) se desvía {desvio:+.0%} "
                                f"del histórico ({historico}) — verificar"
                            ),
                            "cotizacion_id": int(e["cotizacion_id"]),
                        }
                    )

        # ── check 4: interrupts sin resolver ──
        pendientes = consultar(
            conn,
            """select id, tipo, motivo, cotizacion_id from excepciones
                where licitacion_id = %s and estado = 'pendiente' order by creado""",
            (licitacion_id,),
        )
        for p in pendientes:
            bloqueos.append(
                {
                    "check": "excepcion",
                    "excepcion_id": int(p["id"]),
                    "cotizacion_id": p.get("cotizacion_id"),
                    "motivo": f"excepción sin resolver: {p['motivo']}",
                }
            )

        informe = {
            "licitacion_id": licitacion_id,
            "estado": lic["estado"],
            "aprobable": not bloqueos,
            "bloqueos": bloqueos,
            "advertencias": advertencias,
            "items": len(elegidas),
            "items_cubiertos": sum(1 for e in elegidas if e.get("cotizacion_id")),
        }

        if registrar_evento:
            eventos.registrar(
                conn,
                eventos.AUDITORIA_OK if informe["aprobable"] else eventos.AUDITORIA_BLOQUEADA,
                licitacion_id=licitacion_id,
                payload={"bloqueos": bloqueos, "advertencias": advertencias},
            )

    return informe
