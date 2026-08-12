import { db } from "@/lib/db";

// POST /api/kb/:baseId/documentos  { programa, nombre, pdf_url }
// Registra el documento (la ingesta real PDF->embeddings la hace n8n;
// acá queda en estado 'procesando' hasta que el pipeline lo marque 'listo').
export async function POST(req: Request, { params }: { params: Promise<{ baseId: string }> }) {
  const { baseId } = await params;
  const b = await req.json();
  if (!b.nombre) return Response.json({ error: "falta nombre" }, { status: 400 });
  // doc_id versionado: slug + timestamp-less contador por nombre
  const { rows: prev } = await db.query(
    "select coalesce(max(version),0)+1 as v from documentos_kb where base_id=$1 and nombre=$2",
    [baseId, b.nombre]
  );
  const version = prev[0].v;
  const docId = `${b.nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-v${version}`;
  const { rows } = await db.query(
    `insert into documentos_kb (base_id, programa, curso_id, nombre, pdf_url, doc_id, version, estado)
     values ($1,$2,$3,$4,$5,$6,$7,'procesando') returning *`,
    [baseId, b.programa ?? null, b.curso_id || null, b.nombre, b.pdf_url ?? null, docId, version]
  );
  return Response.json(rows[0], { status: 201 });
}
