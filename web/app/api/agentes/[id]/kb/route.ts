import { db } from "@/lib/db";

// GET /api/agentes/:id/kb -> bases + sus documentos
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows: bases } = await db.query(
    "select id, nombre, coleccion_vector from bases_conocimiento where agente_id=$1 order by nombre", [id]
  );
  for (const b of bases as any[]) {
    const { rows: docs } = await db.query(
      `select d.id, d.programa, d.curso_id, c.nombre as curso_nombre,
              d.nombre, d.pdf_url, d.doc_id, d.version, d.estado, d.creado_en
       from documentos_kb d
       left join cursos c on c.id = d.curso_id
       where d.base_id=$1 order by d.creado_en desc`,
      [b.id]
    );
    b.documentos = docs;
  }
  return Response.json(bases);
}

// POST /api/agentes/:id/kb  { nombre, coleccion_vector }  -> crea base de conocimiento
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  if (!b.nombre) return Response.json({ error: "falta nombre" }, { status: 400 });
  const coleccion = b.coleccion_vector || `kb_${id.slice(0, 8)}`;
  const { rows } = await db.query(
    "insert into bases_conocimiento (agente_id, nombre, coleccion_vector) values ($1,$2,$3) returning *",
    [id, b.nombre, coleccion]
  );
  return Response.json(rows[0], { status: 201 });
}
