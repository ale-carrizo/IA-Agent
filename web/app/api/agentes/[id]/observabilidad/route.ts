import { db } from "@/lib/db";

// GET /api/agentes/:id/observabilidad
// Devuelve: resumen de tokens, eventos de etapa (qué etapa entró cada mensaje),
// conversaciones activas y disponibilidad del historial de n8n.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // tokens
  const { rows: tok } = await db.query(
    `select coalesce(sum(prompt_tokens),0)::int as prompt,
            coalesce(sum(completion_tokens),0)::int as completion,
            count(*)::int as llamadas
     from uso_tokens ut
     join conversaciones c on c.id = ut.conversacion_id
     where c.agente_id=$1`, [id]
  );

  // eventos: transiciones / calificaciones / transbordos (con nombres de etapa)
  const { rows: eventos } = await db.query(
    `select ev.tipo, ev.calificacion, ev.detalle, ev.creado_en,
            ed.nombre as etapa_desde, eh.nombre as etapa_hasta,
            c.telefono
     from conversacion_eventos ev
     join conversaciones c on c.id = ev.conversacion_id
     left join etapas ed on ed.id = ev.etapa_desde_id
     left join etapas eh on eh.id = ev.etapa_hasta_id
     where c.agente_id=$1
     order by ev.creado_en desc limit 100`, [id]
  );

  // conversaciones (estado actual + etapa)
  const { rows: convs } = await db.query(
    `select c.telefono, c.transbordado, c.ultima_actividad,
            e.nombre as etapa_actual, c.variables_recolectadas
     from conversaciones c
     left join etapas e on e.id = c.etapa_actual_id
     where c.agente_id=$1
     order by c.ultima_actividad desc limit 50`, [id]
  );

  // historial de chat de n8n (tabla que crea memoryPostgresChat). Puede no existir aún.
  let historial: any[] = [];
  let historialDisponible = false;
  try {
    const { rows } = await db.query(
      `select split_part(session_id, ':', 2) as session_id, count(*)::int as mensajes
       from n8n_chat_histories where session_id like $1 || ':%'
       group by 1 order by 2 desc limit 50`,
      [id]
    );
    historial = rows;
    historialDisponible = true;
  } catch {
    historialDisponible = false;
  }

  return Response.json({
    tokens: tok[0],
    eventos,
    conversaciones: convs,
    historial,
    historialDisponible,
  });
}
