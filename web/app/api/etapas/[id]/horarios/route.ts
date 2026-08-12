import { db } from "@/lib/db";

// GET /api/etapas/:id/horarios -> 7 filas (una por día 0..6)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await db.query(
    "select id, dia, hora_inicio, hora_fin, cerrado from etapa_horarios where etapa_id=$1 order by dia", [id]
  );
  return Response.json(rows);
}

// PUT /api/etapas/:id/horarios  { horarios: [{dia, hora_inicio, hora_fin, cerrado}, ...] }
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { horarios } = await req.json();
  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query("delete from etapa_horarios where etapa_id=$1", [id]);
    for (const h of horarios ?? []) {
      await client.query(
        "insert into etapa_horarios (etapa_id, dia, hora_inicio, hora_fin, cerrado) values ($1,$2,$3,$4,$5)",
        [id, h.dia, h.cerrado ? null : (h.hora_inicio || null), h.cerrado ? null : (h.hora_fin || null), !!h.cerrado]
      );
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  return Response.json({ ok: true });
}
