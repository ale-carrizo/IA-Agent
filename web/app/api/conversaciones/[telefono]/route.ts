import { db } from "@/lib/db";

// GET /api/conversaciones/:telefono?agente_id=...  -> timeline de la conversación
export async function GET(req: Request, { params }: { params: Promise<{ telefono: string }> }) {
  const { telefono } = await params;
  const agenteId = new URL(req.url).searchParams.get("agente_id");
  if (!agenteId) return Response.json({ error: "falta agente_id" }, { status: 400 });

  const { rows: cab } = await db.query(
    `select c.telefono,
            nullif(coalesce(c.variables_recolectadas->>'nombre_lead', c.variables_recolectadas->>'nombre'), '') as nombre,
            c.transbordado,
            c.variables_recolectadas,
            e.nombre as etapa_actual
     from conversaciones c
     left join etapas e on e.id = c.etapa_actual_id
     where c.agente_id = $1 and c.telefono = $2`,
    [agenteId, telefono]
  );
  if (!cab[0]) return Response.json({ error: "conversación no encontrada" }, { status: 404 });

  const { rows: mensajes } = await db.query(
    `select mensaje_lead, respuesta_bot, etapa_nombre, razon, bloqueado, creado_en
     from mensajes_log
     where agente_id = $1 and telefono = $2
     order by creado_en asc`,
    [agenteId, telefono]
  );

  return Response.json({ contacto: cab[0], mensajes });
}

// DELETE /api/conversaciones/:telefono?agente_id=...  -> borra la conversación completa:
// estado (conversaciones; mensajes_log/eventos/tokens/follow-ups caen por cascade),
// la memoria del LLM (n8n_chat_histories, session = teléfono) y el log raw.
// Si el lead vuelve a escribir, arranca de cero.
export async function DELETE(req: Request, { params }: { params: Promise<{ telefono: string }> }) {
  const { telefono } = await params;
  const agenteId = new URL(req.url).searchParams.get("agente_id");
  if (!agenteId) return Response.json({ error: "falta agente_id" }, { status: 400 });

  const client = await db.connect();
  try {
    await client.query("begin");
    const { rowCount } = await client.query(
      `delete from conversaciones where agente_id=$1 and telefono=$2`,
      [agenteId, telefono]
    );
    if (!rowCount) {
      await client.query("rollback");
      return Response.json({ error: "conversación no encontrada" }, { status: 404 });
    }
    // filas de log que pudieran haber quedado sin conversacion_id
    await client.query(`delete from mensajes_log where agente_id=$1 and telefono=$2`, [agenteId, telefono]);
    await client.query(`delete from mensajes_raw where agente_id=$1 and telefono=$2`, [agenteId, telefono]);
    await client.query(`delete from n8n_chat_histories where session_id=$1`, [`${agenteId}:${telefono}`]);
    await client.query("commit");
    return new Response(null, { status: 204 });
  } catch (e) {
    await client.query("rollback").catch(() => {});
    return Response.json({ error: e instanceof Error ? e.message : "error al borrar" }, { status: 500 });
  } finally {
    client.release();
  }
}
