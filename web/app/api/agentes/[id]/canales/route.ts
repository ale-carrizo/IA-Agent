import { db } from "@/lib/db";

// GET /api/agentes/:id/canales
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await db.query(
    `select id, canal_numero, nombre, plataforma, handoff_intent_id, cola, cola_atencion, activo, channel_id_botmaker,
            kapso_phone_number_id,
            (botmaker_token is not null and botmaker_token <> '') as tiene_token,
            (kapso_api_key is not null and kapso_api_key <> '') as tiene_kapso_key
     from canales where agente_id=$1 order by creado_en`,
    [id]
  );
  return Response.json(rows);
}

// POST /api/agentes/:id/canales  { canal_numero, nombre?, plataforma?, botmaker_token?, handoff_intent_id?, cola?, cola_atencion?, kapso_api_key?, kapso_phone_number_id? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  if (!b.canal_numero) return Response.json({ error: "falta canal_numero" }, { status: 400 });
  const plataforma = b.plataforma === "kapso" ? "kapso" : "botmaker";
  try {
    const { rows } = await db.query(
      `insert into canales (agente_id, canal_numero, nombre, plataforma, botmaker_token, handoff_intent_id, cola, cola_atencion, channel_id_botmaker, kapso_api_key, kapso_phone_number_id)
       values ($1,$2,$3,$4,$5,$6,coalesce($7,'asesores'),nullif($8,''),nullif($9,''),nullif($10,''),nullif($11,'')) returning id`,
      [id, b.canal_numero, b.nombre ?? null, plataforma, b.botmaker_token ?? null, b.handoff_intent_id ?? null, b.cola, b.cola_atencion ?? null, b.channel_id_botmaker ?? null, b.kapso_api_key ?? null, b.kapso_phone_number_id ?? null]
    );
    return Response.json(rows[0], { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      return Response.json({ error: "ese número de canal ya está registrado" }, { status: 409 });
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
