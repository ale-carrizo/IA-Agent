import { auth } from "@/auth";
import { db } from "@/lib/db";
import { servicio, ServicioNoConfigurado } from "@/lib/licitaciones";

// GET  /api/excepciones?licitacion_id=N  -> la cola de interrupts pendientes.
// POST /api/excepciones                  -> resuelve una: llama a /resume del
//                                           servicio, que reanuda el grafo
//                                           exactamente donde se había pausado.
//
// La tabla `excepciones` es una PROYECCIÓN del interrupt de LangGraph, no la
// fuente de verdad. Por eso resolver no es un UPDATE desde acá: es un /resume.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const licitacionId = url.searchParams.get("licitacion_id");
  const estado = url.searchParams.get("estado") ?? "pendiente";

  try {
    const { rows } = await db.query(
      `select e.id, e.licitacion_id, e.cotizacion_id, e.thread_id, e.tipo,
              e.motivo, e.contexto, e.estado, e.decision, e.creado,
              l.hospital, l.cierre_recoleccion,
              p.nombre as proveedor, p.telefono_e164,
              i.descripcion_original, i.presentacion_requerida, i.cantidad,
              i.precio_objetivo, i.precio_max_aceptable,
              c.precio_unitario, c.confianza, c.raw_respuesta, c.condiciones
         from excepciones e
         join licitaciones l on l.id = e.licitacion_id
         left join cotizaciones c on c.id = e.cotizacion_id
         left join proveedores p on p.id = c.proveedor_id
         left join items_licitacion i on i.id = c.item_id
        where e.estado = $1
          and ($2::bigint is null or e.licitacion_id = $2::bigint)
        order by l.cierre_recoleccion asc, e.creado asc`,
      [estado, licitacionId]
    );
    return Response.json({ excepciones: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/relation .* does not exist/i.test(msg)) {
      return Response.json({ excepciones: [], migrado: false });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}

type Resolucion = {
  excepcion_id: number;
  thread_id: string;
  accion: "aceptar" | "descartar" | "clarificar" | "marcar_sin_stock";
  motivo?: string;
  cotizacion_id?: number | null;
};

const ACCIONES = new Set(["aceptar", "descartar", "clarificar", "marcar_sin_stock"]);

export async function POST(req: Request) {
  let b: Resolucion;
  try {
    b = (await req.json()) as Resolucion;
  } catch {
    return Response.json({ error: "body inválido (JSON)" }, { status: 400 });
  }

  if (!b.thread_id) return Response.json({ error: "falta thread_id" }, { status: 400 });
  if (!ACCIONES.has(b.accion)) {
    return Response.json(
      { error: `acción inválida: ${b.accion} (esperado: ${[...ACCIONES].join(", ")})` },
      { status: 400 }
    );
  }

  const sesion = await auth().catch(() => null);

  try {
    const datos = await servicio("/resume", {
      method: "POST",
      body: {
        thread_id: b.thread_id,
        excepcion_id: b.excepcion_id ?? null,
        resuelta_por: sesion?.user?.email ?? null,
        decision: {
          accion: b.accion,
          motivo: b.motivo ?? null,
          cotizacion_id: b.cotizacion_id ?? null,
        },
      },
    });
    return Response.json(datos);
  } catch (e) {
    if (e instanceof ServicioNoConfigurado) {
      return Response.json({ error: e.message }, { status: 503 });
    }
    const err = e as Error & { estado?: number };
    return Response.json({ error: err.message }, { status: err.estado ?? 502 });
  }
}
