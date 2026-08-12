import { db } from "@/lib/db";

// GET /api/agentes/:id/feriados
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await db.query(
    "select id, fecha::text as fecha, descripcion from feriados where agente_id=$1 order by fecha", [id]
  );
  return Response.json(rows);
}

// POST /api/agentes/:id/feriados  { fecha, descripcion? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  if (!b.fecha) return Response.json({ error: "falta fecha" }, { status: 400 });
  try {
    const { rows } = await db.query(
      "insert into feriados (agente_id, fecha, descripcion) values ($1,$2,$3) returning *",
      [id, b.fecha, b.descripcion ?? null]
    );
    return Response.json(rows[0], { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      return Response.json({ error: "esa fecha ya está cargada" }, { status: 409 });
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
