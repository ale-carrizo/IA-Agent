import { db } from "@/lib/db";

// GET  /api/agentes/:id/guardrails
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await db.query(
    "select id, nombre, regla, patron_bloqueo, activo from guardrails where agente_id=$1 order by nombre", [id]
  );
  return Response.json(rows);
}

// POST /api/agentes/:id/guardrails  { nombre, regla, patron_bloqueo? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  if (!b.nombre || !b.regla) return Response.json({ error: "falta nombre o regla" }, { status: 400 });
  const { rows } = await db.query(
    "insert into guardrails (agente_id, nombre, regla, patron_bloqueo, activo) values ($1,$2,$3,$4,coalesce($5,true)) returning *",
    [id, b.nombre, b.regla, b.patron_bloqueo ?? null, b.activo]
  );
  return Response.json(rows[0], { status: 201 });
}
