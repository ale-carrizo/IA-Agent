import { db } from "@/lib/db";

// GET /api/canales/:canalId/asesores — lista de asesores para el round-robin de handoff Kapso.
export async function GET(_req: Request, { params }: { params: Promise<{ canalId: string }> }) {
  const { canalId } = await params;
  const { rows } = await db.query(
    `select id, kapso_user_id, nombre, activo, last_assigned_at
     from asesores_kapso where canal_id=$1 order by creado_en`,
    [canalId]
  );
  return Response.json(rows);
}

// POST /api/canales/:canalId/asesores  { kapso_user_id, nombre? }
export async function POST(req: Request, { params }: { params: Promise<{ canalId: string }> }) {
  const { canalId } = await params;
  const b = await req.json();
  if (!b.kapso_user_id) return Response.json({ error: "falta kapso_user_id" }, { status: 400 });
  try {
    const { rows } = await db.query(
      `insert into asesores_kapso (canal_id, kapso_user_id, nombre) values ($1,$2,$3) returning id`,
      [canalId, String(b.kapso_user_id).trim(), b.nombre ?? null]
    );
    return Response.json(rows[0], { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      return Response.json({ error: "ese asesor ya está cargado en este canal" }, { status: 409 });
    if ((e as { code?: string }).code === "22P02")
      return Response.json({ error: "el user_id de Kapso debe ser un UUID válido" }, { status: 400 });
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
