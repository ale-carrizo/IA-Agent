import { db } from "@/lib/db";
import { auth } from "@/auth";

// POST /api/pulido/descartar  { caso_id }  -> marca el caso como descartado
export async function POST(req: Request) {
  const session = await auth();
  const descartado_por = session?.user?.email ?? null;

  const { caso_id } = await req.json();
  if (!caso_id) return Response.json({ error: "falta caso_id" }, { status: 400 });
  await db.query(
    "update pulido_casos set estado='descartado', descartado_en=now(), descartado_por=$2 where id=$1",
    [caso_id, descartado_por]
  );
  return Response.json({ ok: true });
}
