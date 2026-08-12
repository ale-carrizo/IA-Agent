import { db } from "@/lib/db";

// PATCH /api/follow-ups/:fuId  { delay_minutos?, mensaje?, activo?, orden? }
export async function PATCH(req: Request, { params }: { params: Promise<{ fuId: string }> }) {
  const { fuId } = await params;
  const b = await req.json();
  // tope de delay según tipo: hsm hasta 30 días, texto 24h. Si no viene tipo, se asume texto.
  if ("delay_minutos" in b) {
    const maxDelay = b.tipo === "hsm" ? 43200 : 1439;
    if (b.delay_minutos < 1 || b.delay_minutos > maxDelay)
      return Response.json({ error: `delay_minutos debe estar entre 1 y ${maxDelay}` }, { status: 400 });
  }
  const cols = ["delay_minutos", "mensaje", "activo", "orden", "tipo", "intent_hsm"];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const c of cols) if (c in b) { vals.push(b[c]); sets.push(`${c}=$${vals.length}`); }
  if ("variables_hsm" in b) { vals.push(JSON.stringify(b.variables_hsm || {})); sets.push(`variables_hsm=$${vals.length}::jsonb`); }
  if (!sets.length) return Response.json({ error: "nada para actualizar" }, { status: 400 });
  vals.push(fuId);
  const { rows } = await db.query(`update follow_ups set ${sets.join(", ")} where id=$${vals.length} returning *`, vals);
  return Response.json(rows[0]);
}

// DELETE /api/follow-ups/:fuId
export async function DELETE(_req: Request, { params }: { params: Promise<{ fuId: string }> }) {
  const { fuId } = await params;
  await db.query("delete from follow_ups where id=$1", [fuId]);
  return new Response(null, { status: 204 });
}
