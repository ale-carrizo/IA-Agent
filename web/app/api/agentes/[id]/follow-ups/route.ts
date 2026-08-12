import { db } from "@/lib/db";

// GET /api/agentes/:id/follow-ups -> secuencia ordenada
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await db.query(
    "select id, orden, delay_minutos, mensaje, activo, tipo, intent_hsm, variables_hsm from follow_ups where agente_id=$1 order by orden", [id]
  );
  return Response.json(rows);
}

// POST /api/agentes/:id/follow-ups  { delay_minutos, mensaje, tipo?, intent_hsm?, variables_hsm? }
// tipo 'texto': delay < 1440 (ventana de 24h). tipo 'hsm': delay hasta 30 días (plantilla).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  const tipo = b.tipo === "hsm" ? "hsm" : "texto";
  if (b.delay_minutos == null) return Response.json({ error: "falta delay_minutos" }, { status: 400 });
  const maxDelay = tipo === "hsm" ? 43200 : 1439; // 30 días vs 24h
  if (b.delay_minutos < 1 || b.delay_minutos > maxDelay)
    return Response.json({ error: `delay_minutos debe estar entre 1 y ${maxDelay}` }, { status: 400 });
  if (tipo === "texto" && !b.mensaje) return Response.json({ error: "falta mensaje" }, { status: 400 });
  if (tipo === "hsm" && !b.intent_hsm) return Response.json({ error: "para HSM falta intent_hsm (nombre de la plantilla)" }, { status: 400 });
  const { rows: mx } = await db.query(
    "select coalesce(max(orden),0)+1 as next from follow_ups where agente_id=$1", [id]
  );
  const { rows } = await db.query(
    "insert into follow_ups (agente_id, orden, delay_minutos, mensaje, activo, tipo, intent_hsm, variables_hsm) values ($1,$2,$3,$4,coalesce($5,true),$6,$7,coalesce($8,'{}')::jsonb) returning *",
    [id, mx[0].next, b.delay_minutos, b.mensaje || "", b.activo, tipo, b.intent_hsm || null, b.variables_hsm ? JSON.stringify(b.variables_hsm) : "{}"]
  );
  return Response.json(rows[0], { status: 201 });
}
