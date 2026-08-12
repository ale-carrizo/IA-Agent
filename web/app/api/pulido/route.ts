// POST /api/pulido  { agente_id, telefono, feedback }
// Proxya al workflow "Pulido IA" de n8n (razona sobre la conversación + config y propone un fix).
export async function POST(req: Request) {
  const b = await req.json();
  const base = process.env.N8N_PREVIEW_URL || "";
  const url = base.replace(/agente-entrada\/?$/, "pulido-ia");
  if (!url || url === base) return Response.json({ error: "N8N_PREVIEW_URL no configurada" }, { status: 500 });
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agente_id: b.agente_id, telefono: String(b.telefono || "").trim(), feedback: b.feedback }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return Response.json({ error: "n8n " + r.status, detalle: data }, { status: 502 });
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
