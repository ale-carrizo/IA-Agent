import { db } from "@/lib/db";

// PATCH /api/canales/:canalId  -> actualiza config del canal (token solo si viene no vacío)
export async function PATCH(req: Request, { params }: { params: Promise<{ canalId: string }> }) {
  const { canalId } = await params;
  const b = await req.json();
  const cols = ["canal_numero", "nombre", "plataforma", "handoff_intent_id", "cola", "activo"];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const c of cols) if (c in b) { vals.push(b[c]); sets.push(`${c}=$${vals.length}`); }
  // cola_atencion: string vacío -> null (el bot atiende cualquier cola)
  if ("cola_atencion" in b) { vals.push(b.cola_atencion || null); sets.push(`cola_atencion=$${vals.length}`); }
  // channel_id_botmaker: string vacío -> null (necesario para follow-ups HSM)
  if ("channel_id_botmaker" in b) { vals.push(b.channel_id_botmaker || null); sets.push(`channel_id_botmaker=$${vals.length}`); }
  // kapso_phone_number_id: string vacío -> null (id del número en Kapso, clave del webhook entrante)
  if ("kapso_phone_number_id" in b) { vals.push(b.kapso_phone_number_id || null); sets.push(`kapso_phone_number_id=$${vals.length}`); }
  // tokens/keys solo se actualizan si mandan uno no vacío (para no borrarlos sin querer)
  if (b.botmaker_token) { vals.push(b.botmaker_token); sets.push(`botmaker_token=$${vals.length}`); }
  if (b.kapso_api_key) { vals.push(b.kapso_api_key); sets.push(`kapso_api_key=$${vals.length}`); }
  if (!sets.length) return Response.json({ error: "nada para actualizar" }, { status: 400 });
  vals.push(canalId);
  const { rows } = await db.query(
    `update canales set ${sets.join(", ")} where id=$${vals.length} returning id`, vals
  );
  return Response.json(rows[0]);
}

// DELETE /api/canales/:canalId
export async function DELETE(_req: Request, { params }: { params: Promise<{ canalId: string }> }) {
  const { canalId } = await params;
  await db.query("delete from canales where id=$1", [canalId]);
  return new Response(null, { status: 204 });
}
