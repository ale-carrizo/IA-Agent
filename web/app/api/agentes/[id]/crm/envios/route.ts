import { db } from "@/lib/db";

// GET /api/agentes/:id/crm/envios -> últimos envíos al CRM (auditoría)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await db.query(
    `select s.id, s.telefono, s.etapa, s.status_http, s.respuesta, s.exito, s.es_test, s.creado_en,
            i.nombre as integracion
     from crm_envios s
     join crm_integraciones i on i.id = s.integracion_id
     where s.agente_id=$1
     order by s.creado_en desc
     limit 50`,
    [id]
  );
  return Response.json(rows);
}
