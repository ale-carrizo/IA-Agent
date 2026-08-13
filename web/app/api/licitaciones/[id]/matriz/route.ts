import { db } from "@/lib/db";

// GET /api/licitaciones/:id/matriz
// La pantalla principal: filas = ítems del pliego, columnas = proveedores.
// Se lee directo de Postgres porque Postgres ES la fuente de verdad — el panel
// no le pregunta al servicio de negociación por el estado, lo mira.
//
// V1 el cliente hace polling cada 5 s. La migración db/20 ya deja publicado el
// canal NOTIFY 'eventos_licitacion' para que V2 sea SSE sin tocar backend.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const licitacionId = Number(id);
  if (!Number.isInteger(licitacionId)) {
    return Response.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    const [{ rows: lic }, { rows: items }, { rows: celdas }, { rows: proveedores }, { rows: ultimos }] =
      await Promise.all([
        db.query(
          `select id, hospital, expediente, estado, margen_pct,
                  cierre_presentacion, cierre_recoleccion, creado
             from licitaciones where id = $1`,
          [licitacionId]
        ),
        db.query(
          `select i.id, i.descripcion_original, i.cantidad, i.presentacion_requerida,
                  i.precio_max_aceptable, i.precio_objetivo, i.orden, i.producto_id,
                  cm.droga, cm.concentracion, cm.forma
             from items_licitacion i
             left join catalogo_maestro cm on cm.id = i.producto_id
            where i.licitacion_id = $1
            order by i.orden nulls last, i.id`,
          [licitacionId]
        ),
        db.query(
          `select c.id, c.item_id, c.proveedor_id, c.estado, c.precio_unitario,
                  c.precio_por_presentacion, c.presentacion_ofrecida, c.confianza,
                  c.condiciones, c.raw_respuesta, c.canal, c.thread_id,
                  c.counters_hechos, c.recordatorios_enviados, c.respondida_en, c.actualizado
             from cotizaciones c
             join items_licitacion i on i.id = c.item_id
            where i.licitacion_id = $1`,
          [licitacionId]
        ),
        db.query(
          `select distinct p.id, p.nombre, p.telefono_e164, p.contacto
             from proveedores p
             join cotizaciones c on c.proveedor_id = p.id
             join items_licitacion i on i.id = c.item_id
            where i.licitacion_id = $1
            order by p.nombre`,
          [licitacionId]
        ),
        // Escalaciones a voz pendientes: en V1 son la tarea manual "llamalo".
        db.query(
          `select cotizacion_id, max(creado) as creado
             from eventos
            where licitacion_id = $1 and tipo = 'escalacion.voz'
            group by cotizacion_id`,
          [licitacionId]
        ),
      ]);

    if (!lic[0]) return Response.json({ error: "licitación inexistente" }, { status: 404 });

    const aLlamar = new Set(ultimos.map((e) => Number(e.cotizacion_id)));

    // La "oferta final" por ítem: el mejor precio confirmado + margen. Es la
    // misma cuenta que hace el servicio al generar el presupuesto; acá es sólo
    // una vista previa (el número que se presenta sale del presupuesto guardado).
    const margen = Number(lic[0].margen_pct ?? 0);
    const mejores = new Map<number, { precio: number; proveedor: number; cotizacion: number }>();
    for (const c of celdas) {
      if (c.estado !== "confirmada" || c.precio_unitario === null) continue;
      const p = Number(c.precio_unitario);
      const actual = mejores.get(Number(c.item_id));
      if (!actual || p < actual.precio) {
        mejores.set(Number(c.item_id), {
          precio: p,
          proveedor: Number(c.proveedor_id),
          cotizacion: Number(c.id),
        });
      }
    }

    const filas = items.map((i) => {
      const mejor = mejores.get(Number(i.id));
      return {
        ...i,
        producto: i.droga ? `${i.droga} ${i.concentracion}` : i.descripcion_original,
        mejor_precio: mejor?.precio ?? null,
        mejor_proveedor_id: mejor?.proveedor ?? null,
        precio_con_margen: mejor ? +(mejor.precio * (1 + margen / 100)).toFixed(2) : null,
        confirmadas: celdas.filter((c) => Number(c.item_id) === Number(i.id) && c.estado === "confirmada").length,
      };
    });

    return Response.json({
      licitacion: lic[0],
      items: filas,
      proveedores,
      celdas: celdas.map((c) => ({ ...c, a_llamar: aLlamar.has(Number(c.id)) })),
      generado: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/relation .* does not exist/i.test(msg)) {
      return Response.json({ error: "falta correr db/20-licitaciones.sql" }, { status: 503 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
