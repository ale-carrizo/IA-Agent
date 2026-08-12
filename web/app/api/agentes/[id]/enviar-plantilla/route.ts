import { db } from "@/lib/db";

// POST /api/agentes/:id/enviar-plantilla  { telefono, intent? }
// "Playground real": dispara la plantilla HSM de bienvenida por Botmaker al número dado.
// La persona la recibe en su WhatsApp, responde, y arranca la conversación con el bot
// (Botmaker asigna esa plantilla a la cola del bot). Protegido por la sesión del panel.
//
// Usa el mismo endpoint que el motor para el handoff: trigger-intent.

const PLANTILLA_DEFAULT = "bienvenidacarmen";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let b: { telefono?: string; intent?: string; codigo?: string };
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "body inválido" }, { status: 400 });
  }
  const telefono = (b.telefono ?? "").toString().replace(/\D+/g, "");
  const intent = ((b.intent ?? "").toString().trim() || PLANTILLA_DEFAULT);
  const codigo = (b.codigo ?? "").toString().trim();
  if (telefono.length < 8) {
    return Response.json({ error: "teléfono inválido — poné el número con código de país, sin +" }, { status: 400 });
  }

  // Pre-seed del programa (igual que hace Neotel en producción): así cuando la persona
  // responde la plantilla, Carmen ya sabe con qué programa/código entró.
  if (codigo) {
    const { rows: mapa } = await db.query(
      `select programa_nombre from preseed_mapa where agente_id=$1 and lower(codigo)=lower($2) and activo limit 1`,
      [id, codigo]
    );
    if (mapa.length) {
      const { rows: et } = await db.query(
        `select id from etapas where agente_id=$1 and orden=1 and activo limit 1`,
        [id]
      );
      const patch = {
        programa_interes: mapa[0].programa_nombre as string,
        canal_origen: "plantilla_saliente",
        programa_codigo: codigo,
      };
      await db.query(
        `insert into conversaciones
            (agente_id, telefono, contacto_id, etapa_actual_id, variables_recolectadas, ultima_actividad)
         values ($1, $2, $2, $3, $4::jsonb, now())
         on conflict (agente_id, telefono) do update
            set variables_recolectadas = excluded.variables_recolectadas || conversaciones.variables_recolectadas,
                etapa_actual_id = coalesce(conversaciones.etapa_actual_id, excluded.etapa_actual_id)`,
        [id, telefono, et[0]?.id ?? null, JSON.stringify(patch)]
      );
    }
  }

  const { rows } = await db.query(
    `select botmaker_token, canal_numero, channel_id_botmaker
       from canales where agente_id=$1 and plataforma='botmaker' and activo limit 1`,
    [id]
  );
  if (!rows.length) {
    return Response.json({ error: "no hay canal Botmaker activo para este agente" }, { status: 400 });
  }
  const token = rows[0].botmaker_token as string;
  const canalNumero = String(rows[0].canal_numero ?? "");
  let channelId: string | null = rows[0].channel_id_botmaker ?? null;

  // Si el canal no tiene guardado el channelId, lo resolvemos por número contra Botmaker.
  if (!channelId) {
    try {
      const r = await fetch("https://api.botmaker.com/v2.0/channels", {
        headers: { "access-token": token, "Content-Type": "application/json" },
      });
      if (r.ok) {
        const data = (await r.json()) as { items?: Array<{ id: string; platform: string; number?: string }> };
        const wa = (data.items ?? []).find(
          (x) => x.platform === "whatsapp" && String(x.number ?? "") === canalNumero
        );
        channelId = wa?.id ?? null;
      }
    } catch {
      // cae al error de abajo
    }
  }
  if (!channelId) {
    return Response.json({ error: "no se pudo determinar el channelId de Botmaker para este canal" }, { status: 500 });
  }

  // Disparar la plantilla (mismo endpoint que usa el motor para trigger-intent)
  const resp = await fetch("https://api.botmaker.com/v2.0/chats-actions/trigger-intent", {
    method: "POST",
    headers: { "access-token": token, "Content-Type": "application/json" },
    body: JSON.stringify({
      chat: { channelId, contactId: telefono },
      intentIdOrName: intent,
      variables: {},
    }),
  });
  const txt = await resp.text();
  if (!resp.ok) {
    return Response.json({ error: `Botmaker respondió ${resp.status}`, detalle: txt.slice(0, 500) }, { status: 502 });
  }
  return Response.json({ ok: true, telefono, intent });
}
