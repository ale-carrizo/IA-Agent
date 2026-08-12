import { db } from "@/lib/db";

// POST /api/cursos/:cursoId/turmas  { fecha_inicio, cupos? }
export async function POST(req: Request, { params }: { params: Promise<{ cursoId: string }> }) {
  const { cursoId } = await params;
  const b = await req.json();
  if (!b.fecha_inicio) return Response.json({ error: "falta fecha_inicio" }, { status: 400 });
  const { rows: c } = await db.query("select agente_id from cursos where id=$1", [cursoId]);
  if (!c[0]) return Response.json({ error: "curso no encontrado" }, { status: 404 });
  const { rows } = await db.query(
    "insert into turmas (curso_id, agente_id, fecha_inicio, cupos) values ($1,$2,$3,$4) returning *",
    [cursoId, c[0].agente_id, b.fecha_inicio, b.cupos ?? null]
  );
  return Response.json(rows[0], { status: 201 });
}
