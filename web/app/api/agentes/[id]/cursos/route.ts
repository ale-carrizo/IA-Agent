import { db } from "@/lib/db";

// GET /api/agentes/:id/cursos -> cursos + sus turmas
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows: cursos } = await db.query(
    "select * from cursos where agente_id=$1 order by creado_en", [id]
  );
  for (const c of cursos as any[]) {
    const { rows: t } = await db.query(
      "select id, fecha_inicio, cupos, activo from turmas where curso_id=$1 order by fecha_inicio", [c.id]
    );
    c.turmas = t;
  }
  return Response.json(cursos);
}

// POST /api/agentes/:id/cursos
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  if (!b.nombre) return Response.json({ error: "falta nombre" }, { status: 400 });
  const { rows } = await db.query(
    `insert into cursos (agente_id, nombre, tipo, area, modalidad, nivel, duracion, precio, condiciones, descripcion, pdf_url, checkout_url,
                          cobro_por_credito, costo_credito, creditos_totales, creditos_base, creditos_especializacion, moneda)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning *`,
    [id, b.nombre, b.tipo ?? null, b.area ?? null, b.modalidad ?? null, b.nivel ?? null, b.duracion ?? null,
     b.precio ?? null, b.condiciones ?? null, b.descripcion ?? null, b.pdf_url ?? null, b.checkout_url ?? null,
     b.cobro_por_credito ?? false, b.costo_credito ?? null, b.creditos_totales ?? null, b.creditos_base ?? null,
     b.creditos_especializacion ?? null, b.moneda ?? null]
  );
  return Response.json(rows[0], { status: 201 });
}
