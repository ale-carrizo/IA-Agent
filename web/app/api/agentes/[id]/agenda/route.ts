import { db } from "@/lib/db";

// GET /api/agentes/:id/agenda -> agendamientos + follow-ups enviados (para Observabilidad/Agenda)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { rows: agendamientos } = await db.query(
    `select a.id, a.fecha_hora, a.estado, a.detalle, c.telefono
     from agendamientos a
     left join conversaciones c on c.id = a.conversacion_id
     where a.agente_id=$1
     order by a.fecha_hora desc limit 100`, [id]
  );

  const { rows: followups } = await db.query(
    `select e.enviado_en, f.orden, f.delay_minutos, c.telefono
     from follow_up_envios e
     join follow_ups f on f.id = e.follow_up_id
     join conversaciones c on c.id = e.conversacion_id
     where c.agente_id=$1
     order by e.enviado_en desc limit 100`, [id]
  );

  return Response.json({ agendamientos, followups });
}
