import { db } from "@/lib/db";

// GET /api/agentes -> lista
export async function GET() {
  const { rows } = await db.query(
    "select id, nombre, tenant, ambiente, persona, tono, publicado from agentes order by creado_en"
  );
  return Response.json(rows);
}

// POST /api/agentes -> crea agente nuevo (mínimo: nombre, tenant, ambiente)
export async function POST(req: Request) {
  const b = await req.json();
  if (!b.nombre || !b.tenant || !b.ambiente) {
    return Response.json({ error: "nombre, tenant y ambiente son obligatorios" }, { status: 400 });
  }
  const { rows } = await db.query(
    `insert into agentes (nombre, tenant, ambiente, rol, idioma, zona_horaria)
     values ($1,$2,$3,$4, coalesce($5,'es'), coalesce($6,'America/Mexico_City'))
     returning *`,
    [b.nombre, b.tenant, b.ambiente, b.rol ?? null, b.idioma, b.zona_horaria]
  );
  return Response.json(rows[0], { status: 201 });
}
