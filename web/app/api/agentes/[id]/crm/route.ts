import { db } from "@/lib/db";

// GET /api/agentes/:id/crm -> integraciones CRM del agente
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await db.query(
    "select id, nombre, preset, config, activo, creado_en from crm_integraciones where agente_id=$1 order by creado_en",
    [id]
  );
  return Response.json(rows);
}

// POST /api/agentes/:id/crm  { nombre, preset?, config }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  if (!b.nombre || !b.config?.url) {
    return Response.json({ error: "falta nombre o config.url" }, { status: 400 });
  }
  const { rows } = await db.query(
    "insert into crm_integraciones (agente_id, nombre, preset, config, activo) values ($1,$2,$3,$4,coalesce($5,true)) returning *",
    [id, b.nombre, b.preset ?? null, JSON.stringify(b.config), b.activo]
  );
  return Response.json(rows[0], { status: 201 });
}
