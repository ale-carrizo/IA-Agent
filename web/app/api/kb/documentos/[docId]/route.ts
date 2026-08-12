import { db } from "@/lib/db";

// PATCH /api/kb/documentos/:docId  { curso_id }  -> asigna/cambia (o quita con null) el
// curso de un documento ya existente, sin re-subirlo. curso_id vacío/null = KB general.
export async function PATCH(req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const b = await req.json().catch(() => ({}));
  const cursoId = b.curso_id || null;
  const { rows } = await db.query(
    "update documentos_kb set curso_id=$1 where id=$2 returning id, curso_id",
    [cursoId, docId]
  );
  if (!rows[0]) return Response.json({ error: "documento no encontrado" }, { status: 404 });
  return Response.json(rows[0]);
}

// DELETE /api/kb/documentos/:docId -> borra el doc Y sus vectores (evita chunks fantasma)
export async function DELETE(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const { rows } = await db.query("select doc_id from documentos_kb where id=$1", [docId]);
  if (rows[0]) {
    await db.query("delete from kb_embeddings where doc_id=$1", [rows[0].doc_id]);
  }
  await db.query("delete from documentos_kb where id=$1", [docId]);
  return new Response(null, { status: 204 });
}
