import { db } from "@/lib/db";
import { TIPIFICACIONES } from "@/lib/funnel";

// GET /api/agentes/:id/leads/:telefono -> detalle del lead: ficha + timeline de eventos
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; telefono: string }> }
) {
  const { id, telefono } = await params;
  const tel = decodeURIComponent(telefono);

  const { rows: conv } = await db.query(
    `select c.id, c.variables_recolectadas as ficha, c.transbordado, c.ultima_actividad
     from conversaciones c where c.agente_id=$1 and c.telefono=$2`,
    [id, tel]
  );
  if (!conv[0]) return Response.json({ error: "lead no encontrado" }, { status: 404 });

  const { rows: eventos } = await db.query(
    `select ce.tipo, ce.calificacion, ce.creado_en,
            ed.nombre as etapa_desde, eh.nombre as etapa_hasta
     from conversacion_eventos ce
     left join etapas ed on ed.id = ce.etapa_desde_id
     left join etapas eh on eh.id = ce.etapa_hasta_id
     where ce.conversacion_id = $1
     order by ce.creado_en desc
     limit 100`,
    [conv[0].id]
  );

  return Response.json({ ficha: conv[0].ficha ?? {}, eventos });
}

// PATCH /api/agentes/:id/leads/:telefono -> override manual de la tipificación
// body: { lead_estado?: Tipificacion | null, lead_notas?: string }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; telefono: string }> }
) {
  const { id, telefono } = await params;
  const tel = decodeURIComponent(telefono);
  const b = await req.json();

  const sets: string[] = [];
  const vals: unknown[] = [];
  if ("lead_estado" in b) {
    const v = b.lead_estado;
    if (v !== null && !(TIPIFICACIONES as readonly string[]).includes(v)) {
      return Response.json(
        { error: `lead_estado debe ser ${TIPIFICACIONES.join(" | ")} | null (automático)` },
        { status: 400 }
      );
    }
    vals.push(v);
    sets.push(`lead_estado=$${vals.length}`);
  }
  if ("lead_notas" in b) {
    vals.push(b.lead_notas ?? null);
    sets.push(`lead_notas=$${vals.length}`);
  }
  if (!sets.length) return Response.json({ error: "nada para actualizar" }, { status: 400 });

  vals.push(id, tel);
  try {
    const { rowCount } = await db.query(
      `update conversaciones set ${sets.join(", ")}
       where agente_id=$${vals.length - 1} and telefono=$${vals.length}`,
      vals
    );
    if (!rowCount) return Response.json({ error: "lead no encontrado" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message || "";
    if (msg.includes("lead_estado") || msg.includes("lead_notas")) {
      return Response.json(
        { error: "Falta la migración db/17-funnel.sql (columnas lead_estado/lead_notas)" },
        { status: 409 }
      );
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
