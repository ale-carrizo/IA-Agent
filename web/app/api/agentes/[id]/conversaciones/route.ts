import { db } from "@/lib/db";

// GET /api/agentes/:id/conversaciones -> resumen + lista de sesiones
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { rows: sesiones } = await db.query(
    `select
       c.telefono,
       nullif(coalesce(c.variables_recolectadas->>'nombre_lead', c.variables_recolectadas->>'nombre'), '') as nombre,
       e.nombre as etapa_actual,
       c.transbordado,
       c.ultima_actividad,
       (select min(ml.creado_en) from mensajes_log ml where ml.conversacion_id = c.id) as inicio,
       (select count(*)::int from mensajes_log ml where ml.conversacion_id = c.id) as turnos,
       case
         when c.transbordado then 'transbordo'
         when now() - c.ultima_actividad < interval '1 hour' then 'activa'
         else 'esperando'
       end as estado
     from conversaciones c
     left join etapas e on e.id = c.etapa_actual_id
     where c.agente_id = $1
     order by c.ultima_actividad desc
     limit 200`,
    [id]
  );

  // total y esperando4h reales sobre TODAS las conversaciones (no solo las 200 listadas)
  const { rows: agg } = await db.query(
    `select
       count(*)::int as total,
       count(*) filter (where not transbordado and now() - ultima_actividad >= interval '4 hours')::int as esperando4h
     from conversaciones where agente_id = $1`,
    [id]
  );

  return Response.json({ total: agg[0]?.total ?? 0, esperando4h: agg[0]?.esperando4h ?? 0, sesiones });
}
