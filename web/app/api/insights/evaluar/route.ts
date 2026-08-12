// POST /api/insights/evaluar { limite? } — dispara el workflow "Juez QA" de n8n.
// Async: n8n responde al toque y el juicio corre en background (el panel refetchea luego).
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const limite = Number(b.limite) > 0 ? Number(b.limite) : undefined;
  const base = process.env.N8N_BASE_URL;
  if (!base) return Response.json({ error: "falta N8N_BASE_URL" }, { status: 500 });
  try {
    const r = await fetch(`${base}/webhook/juez-qa-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(limite ? { limite } : {}),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      return Response.json({ error: "n8n respondió " + r.status, detalle: (await r.text()).slice(0, 300) }, { status: 502 });
    }
    return Response.json({ ok: true, mensaje: "Evaluación en curso. Refrescá en ~1 minuto." });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
