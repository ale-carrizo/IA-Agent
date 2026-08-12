import { db } from "@/lib/db";

// GET /api/etapas/:id -> etapa con campos crudos (para el editor)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await db.query("select * from etapas where id=$1", [id]);
  if (!rows[0]) return Response.json({ error: "no encontrada" }, { status: 404 });
  return Response.json(rows[0]);
}

// PATCH /api/etapas/:id  -> actualiza campos parciales de la etapa
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();

  const permitidos = ["nombre", "objetivo", "reglas", "calificacion", "orden", "activo", "tono_override"];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const k of permitidos) {
    if (k in b) {
      vals.push(b[k]);
      sets.push(`${k} = $${vals.length}`);
    }
  }
  if (!sets.length) return Response.json({ error: "nada para actualizar" }, { status: 400 });

  vals.push(id);
  const { rows } = await db.query(
    `update etapas set ${sets.join(", ")} where id = $${vals.length} returning *`,
    vals
  );
  return Response.json(rows[0]);
}

// DELETE /api/etapas/:id
// Borra la etapa de forma robusta: los hijos (herramientas/variables/horarios) cascadean;
// las referencias históricas (conversaciones/logs) se ponen en null para que el borrado
// nunca falle por FK. El historial conserva etapa_nombre (denormalizado) para observabilidad.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query("update conversaciones set etapa_actual_id = null where etapa_actual_id = $1", [id]);
    await client.query("update uso_tokens set etapa_id = null where etapa_id = $1", [id]);
    await client.query("update conversacion_eventos set etapa_desde_id = null where etapa_desde_id = $1", [id]);
    await client.query("update conversacion_eventos set etapa_hasta_id = null where etapa_hasta_id = $1", [id]);
    await client.query("update mensajes_log set etapa_id = null where etapa_id = $1", [id]);
    await client.query("delete from etapas where id = $1", [id]);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    return Response.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
  return new Response(null, { status: 204 });
}
