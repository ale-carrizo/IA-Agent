// POST /api/insights/analizar { agente_id } — proxy al workflow insights-ia de n8n
// (razonamiento con IA sobre los diálogos reales). Puede tardar ~1 min.
export const maxDuration = 300;

export async function POST(req: Request) {
  const b = await req.json();
  if (!b.agente_id) return Response.json({ error: "falta agente_id" }, { status: 400 });

  const base = process.env.N8N_BASE_URL;
  if (!base) return Response.json({ error: "falta N8N_BASE_URL" }, { status: 500 });
  try {
    const r = await fetch(`${base}/webhook/insights-ia`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agente_id: b.agente_id }),
      signal: AbortSignal.timeout(240000),
    });
    if (!r.ok) {
      return Response.json({ error: "n8n respondió " + r.status, detalle: (await r.text()).slice(0, 300) }, { status: 502 });
    }
    return Response.json(await r.json());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
