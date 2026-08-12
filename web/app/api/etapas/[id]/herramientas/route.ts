import { db } from "@/lib/db";

// GET /api/etapas/:id/herramientas -> ids de herramientas habilitadas en la etapa
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await db.query(
    "select herramienta_id from etapa_herramientas where etapa_id=$1", [id]
  );
  return Response.json(rows.map((r: any) => r.herramienta_id));
}

// PUT /api/etapas/:id/herramientas  { ids: [...] }  -> reemplaza el set
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ids } = await req.json();
  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query("delete from etapa_herramientas where etapa_id=$1", [id]);
    for (const hid of ids ?? []) {
      await client.query(
        "insert into etapa_herramientas (etapa_id, herramienta_id) values ($1,$2) on conflict do nothing",
        [id, hid]
      );
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  return Response.json({ ok: true, count: (ids ?? []).length });
}
