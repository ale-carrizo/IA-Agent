import { db } from "@/lib/db";

// PATCH /api/guardrails/:gId  { nombre?, regla?, patron_bloqueo?, activo? }
export async function PATCH(req: Request, { params }: { params: Promise<{ gId: string }> }) {
  const { gId } = await params;
  const b = await req.json();
  const cols = ["nombre", "regla", "patron_bloqueo", "activo"];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const c of cols) if (c in b) { vals.push(b[c]); sets.push(`${c}=$${vals.length}`); }
  if (!sets.length) return Response.json({ error: "nada para actualizar" }, { status: 400 });
  vals.push(gId);
  const { rows } = await db.query(
    `update guardrails set ${sets.join(", ")} where id=$${vals.length} returning *`, vals
  );
  return Response.json(rows[0]);
}

// DELETE /api/guardrails/:gId
export async function DELETE(_req: Request, { params }: { params: Promise<{ gId: string }> }) {
  const { gId } = await params;
  await db.query("delete from guardrails where id=$1", [gId]);
  return new Response(null, { status: 204 });
}
