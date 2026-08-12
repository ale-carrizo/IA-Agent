import { db } from "@/lib/db";

// PATCH /api/asesores-kapso/:asesorId  { activo?, nombre? }
export async function PATCH(req: Request, { params }: { params: Promise<{ asesorId: string }> }) {
  const { asesorId } = await params;
  const b = await req.json();
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const c of ["activo", "nombre"]) if (c in b) { vals.push(b[c]); sets.push(`${c}=$${vals.length}`); }
  if (!sets.length) return Response.json({ error: "nada para actualizar" }, { status: 400 });
  vals.push(asesorId);
  const { rows } = await db.query(`update asesores_kapso set ${sets.join(", ")} where id=$${vals.length} returning id`, vals);
  return Response.json(rows[0] || null);
}

// DELETE /api/asesores-kapso/:asesorId
export async function DELETE(_req: Request, { params }: { params: Promise<{ asesorId: string }> }) {
  const { asesorId } = await params;
  await db.query("delete from asesores_kapso where id=$1", [asesorId]);
  return new Response(null, { status: 204 });
}
