import { db } from "@/lib/db";

// PATCH /api/cursos/:cursoId
export async function PATCH(req: Request, { params }: { params: Promise<{ cursoId: string }> }) {
  const { cursoId } = await params;
  const b = await req.json();
  const cols = ["nombre", "tipo", "area", "modalidad", "nivel", "duracion", "precio", "condiciones", "descripcion", "pdf_url", "checkout_url", "activo",
    "cobro_por_credito", "costo_credito", "creditos_totales", "creditos_base", "creditos_especializacion", "moneda"];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const c of cols) if (c in b) { vals.push(b[c]); sets.push(`${c}=$${vals.length}`); }
  if (!sets.length) return Response.json({ error: "nada para actualizar" }, { status: 400 });
  vals.push(cursoId);
  const { rows } = await db.query(`update cursos set ${sets.join(", ")} where id=$${vals.length} returning *`, vals);
  return Response.json(rows[0]);
}

// DELETE /api/cursos/:cursoId
export async function DELETE(_req: Request, { params }: { params: Promise<{ cursoId: string }> }) {
  const { cursoId } = await params;
  await db.query("delete from cursos where id=$1", [cursoId]);
  return new Response(null, { status: 204 });
}
