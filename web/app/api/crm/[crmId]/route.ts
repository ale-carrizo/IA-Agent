import { db } from "@/lib/db";

// PATCH /api/crm/:crmId  { nombre?, config?, activo? }
export async function PATCH(req: Request, { params }: { params: Promise<{ crmId: string }> }) {
  const { crmId } = await params;
  const b = await req.json();
  const { rows } = await db.query(
    `update crm_integraciones set
       nombre = coalesce($2, nombre),
       config = coalesce($3, config),
       activo = coalesce($4, activo),
       actualizado_en = now()
     where id=$1 returning *`,
    [crmId, b.nombre ?? null, b.config ? JSON.stringify(b.config) : null, b.activo ?? null]
  );
  if (!rows[0]) return Response.json({ error: "integración no encontrada" }, { status: 404 });
  return Response.json(rows[0]);
}

// DELETE /api/crm/:crmId
export async function DELETE(_req: Request, { params }: { params: Promise<{ crmId: string }> }) {
  const { crmId } = await params;
  await db.query("delete from crm_integraciones where id=$1", [crmId]);
  return new Response(null, { status: 204 });
}
