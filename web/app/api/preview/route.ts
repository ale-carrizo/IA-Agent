// POST /api/preview  { agente_id, telefono?, mensaje, etapa_actual_id? }
// Reenvía al webhook de PRUEBA de n8n (el botón ▶ de una etapa).
// El front nunca le habla a n8n directo desde el browser; pasa por acá.
export async function POST(req: Request) {
  const b = await req.json();
  const url = process.env.N8N_PREVIEW_URL;
  if (!url) return Response.json({ error: "falta N8N_PREVIEW_URL" }, { status: 500 });

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agente_id: b.agente_id,
      telefono: b.telefono ?? "preview-" + b.agente_id,
      mensaje: b.mensaje,
      etapa_actual_id: b.etapa_actual_id ?? "",
    }),
  });

  if (!r.ok) {
    return Response.json(
      { error: "n8n respondió " + r.status, detalle: await r.text() },
      { status: 502 }
    );
  }
  return Response.json(await r.json());
}
