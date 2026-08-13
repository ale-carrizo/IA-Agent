import { db } from "@/lib/db";
import { servicio, ServicioNoConfigurado } from "@/lib/licitaciones";

// GET  /api/licitaciones  -> lista con el avance de recolección de cada una.
// POST /api/licitaciones  -> carga un pliego. Delega en el servicio Python,
//                            que es el que crea cotizaciones y dispara los
//                            primeros mensajes (el panel no negocia).

export async function GET() {
  try {
    const { rows } = await db.query(
      `select l.id, l.hospital, l.expediente, l.estado, l.margen_pct,
              l.cierre_presentacion, l.cierre_recoleccion, l.creado,
              (select count(*)::int from items_licitacion i where i.licitacion_id = l.id) as items,
              (select count(*)::int from cotizaciones c
                 join items_licitacion i on i.id = c.item_id
                where i.licitacion_id = l.id) as cotizaciones,
              (select count(*)::int from cotizaciones c
                 join items_licitacion i on i.id = c.item_id
                where i.licitacion_id = l.id and c.estado = 'confirmada') as confirmadas,
              (select count(*)::int from excepciones e
                where e.licitacion_id = l.id and e.estado = 'pendiente') as excepciones,
              (select count(*)::int from items_licitacion i
                where i.licitacion_id = l.id
                  and exists (select 1 from cotizaciones c
                               where c.item_id = i.id and c.estado = 'confirmada')) as items_cubiertos
         from licitaciones l
        order by l.creado desc
        limit 100`
    );
    return Response.json({ licitaciones: rows });
  } catch (e) {
    // La migración db/20 puede no haber corrido todavía.
    const msg = e instanceof Error ? e.message : String(e);
    if (/relation .* does not exist/i.test(msg)) {
      return Response.json({ licitaciones: [], migrado: false });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "body inválido (JSON)" }, { status: 400 });
  }

  try {
    const datos = await servicio("/licitaciones", { method: "POST", body });
    return Response.json(datos, { status: 201 });
  } catch (e) {
    if (e instanceof ServicioNoConfigurado) {
      return Response.json({ error: e.message }, { status: 503 });
    }
    const err = e as Error & { estado?: number };
    return Response.json({ error: err.message }, { status: err.estado ?? 502 });
  }
}
