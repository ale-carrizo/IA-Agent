import { db } from "@/lib/db";

// POST /api/etapas/reorder  { agente_id, ids: [idEnOrdenNuevo...] }
// Reindexa orden = 1..N de forma atómica (2 fases para no violar UNIQUE(agente_id,orden)).
export async function POST(req: Request) {
  const { agente_id, ids } = await req.json();
  if (!agente_id || !Array.isArray(ids) || !ids.length)
    return Response.json({ error: "faltan agente_id o ids" }, { status: 400 });

  const client = await db.connect();
  try {
    await client.query("begin");
    // Fase 1: correr todos a un rango temporal alto (evita choques con el UNIQUE)
    await client.query("update etapas set orden = orden + 1000 where agente_id=$1", [agente_id]);
    // Fase 2: asignar el orden nuevo (1..N) según el array recibido
    for (let i = 0; i < ids.length; i++) {
      await client.query("update etapas set orden=$1 where id=$2 and agente_id=$3", [i + 1, ids[i], agente_id]);
    }
    await client.query("commit");
    return Response.json({ ok: true });
  } catch (e) {
    await client.query("rollback");
    return Response.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
