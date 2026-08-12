import { db } from "@/lib/db";

// GET  /api/agentes/:id/variables
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await db.query(
    "select id, nombre, tipo from agente_variables where agente_id=$1 order by nombre", [id]
  );
  return Response.json(rows);
}

// POST /api/agentes/:id/variables  { nombre, tipo }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  if (!b.nombre) return Response.json({ error: "falta nombre" }, { status: 400 });
  try {
    const { rows } = await db.query(
      "insert into agente_variables (agente_id, nombre, tipo) values ($1,$2,coalesce($3,'texto')) returning *",
      [id, b.nombre, b.tipo]
    );
    return Response.json(rows[0], { status: 201 });
  } catch (e: any) {
    if (e?.code === "23505")
      return Response.json({ error: "ya existe una variable con ese nombre" }, { status: 409 });
    return Response.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}
