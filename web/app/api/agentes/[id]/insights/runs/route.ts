import { db } from "@/lib/db";

// GET /api/agentes/[id]/insights/runs?run=<uuid> — un análisis persistido completo.
// Sin ?run, devuelve la lista liviana (para el selector de historial).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runId = new URL(req.url).searchParams.get("run");
  try {
    if (runId) {
      const { rows } = await db.query(
        `select id, origen, dialogos_analizados, resumen, temas, objeciones, huecos_kb, recomendaciones, generado_en
         from insights_runs where id=$1 and agente_id=$2`,
        [runId, id]
      );
      return Response.json(rows[0] || null);
    }
    const { rows } = await db.query(
      `select id, origen, dialogos_analizados, resumen, generado_en,
         jsonb_array_length(temas) as n_temas, jsonb_array_length(objeciones) as n_objeciones
       from insights_runs where agente_id=$1 order by generado_en desc limit 24`,
      [id]
    );
    return Response.json({ runs: rows });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
