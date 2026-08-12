import { db } from "@/lib/db";

// GET /api/pulido/casos?agente_id=...  -> cola de pendientes + patrones (memoria larga)
export async function GET(req: Request) {
  const agenteId = new URL(req.url).searchParams.get("agente_id");
  if (!agenteId) return Response.json({ error: "falta agente_id" }, { status: 400 });

  const { rows: pendientes } = await db.query(
    `select id, telefono, feedback, diagnostico, causa, etapa_id, etapa_nombre, campo, accion,
            texto_actual, texto_propuesto, justificacion, riesgo, es_patron, frecuencia, creado_en
     from pulido_casos
     where agente_id=$1 and estado='pendiente'
     order by es_patron desc, creado_en desc limit 50`,
    [agenteId]
  );

  const { rows: porCausa } = await db.query(
    `select causa, count(*)::int n,
            count(*) filter (where estado='pendiente')::int pendientes
     from pulido_casos where agente_id=$1 and causa is not null
     group by causa order by n desc`,
    [agenteId]
  );
  const { rows: porEtapa } = await db.query(
    `select etapa_nombre, count(*)::int n from pulido_casos
     where agente_id=$1 and etapa_nombre is not null
     group by etapa_nombre order by n desc limit 8`,
    [agenteId]
  );
  const { rows: tot } = await db.query(
    `select count(*)::int total,
            count(*) filter (where estado='pendiente')::int pendientes,
            count(*) filter (where estado='aplicado')::int aplicados
     from pulido_casos where agente_id=$1`,
    [agenteId]
  );

  return Response.json({ pendientes, patrones: { causa: porCausa, etapa: porEtapa }, resumen: tot[0] });
}
