import { db } from "@/lib/db";

// GET /api/etapas?agente_id=...
export async function GET(req: Request) {
  const agenteId = new URL(req.url).searchParams.get("agente_id");
  if (!agenteId) return Response.json({ error: "falta agente_id" }, { status: 400 });

  const { rows } = await db.query(
    "select * from etapas where agente_id = $1 order by orden",
    [agenteId]
  );
  return Response.json(rows);
}

// POST /api/etapas  { agente_id, nombre, objetivo, reglas, calificacion? }
export async function POST(req: Request) {
  const b = await req.json();
  // orden = última + 1
  const { rows: maxRows } = await db.query(
    "select coalesce(max(orden), 0) + 1 as next from etapas where agente_id = $1",
    [b.agente_id]
  );
  const orden = b.orden ?? maxRows[0].next;

  const { rows } = await db.query(
    `insert into etapas (agente_id, orden, nombre, objetivo, reglas, calificacion)
     values ($1, $2, $3, $4, $5, coalesce($6, 'ninguna'))
     returning *`,
    [b.agente_id, orden, b.nombre, b.objetivo ?? null, b.reglas ?? null, b.calificacion]
  );
  return Response.json(rows[0], { status: 201 });
}
