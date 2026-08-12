import { db } from "@/lib/db";

// GET /api/pulido/historial?agente_id=...  -> casos aplicados y descartados (auditoría)
export async function GET(req: Request) {
  const agente_id = new URL(req.url).searchParams.get("agente_id");
  if (!agente_id) return Response.json({ error: "falta agente_id" }, { status: 400 });

  const { rows } = await db.query(
    `select id, telefono, feedback, diagnostico, causa, etapa_nombre, campo, accion,
            texto_antes, texto_propuesto, justificacion, riesgo, es_patron, frecuencia,
            estado, creado_en, aplicado_en, aplicado_por, descartado_en, descartado_por
     from pulido_casos
     where agente_id=$1 and estado in ('aplicado','descartado')
     order by coalesce(aplicado_en, descartado_en, creado_en) desc
     limit 100`,
    [agente_id]
  );

  return Response.json({ historial: rows });
}
