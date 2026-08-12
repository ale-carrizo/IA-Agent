import { db } from "@/lib/db";
import { clasificarLead, TIPIFICACIONES, type Tipificacion } from "@/lib/funnel";

// GET /api/agentes/:id/funnel -> leads tipificados estilo contact center + KPIs.
// Tolerante a que la migración 17-funnel.sql no haya corrido (lead_estado/lead_notas):
// en ese caso responde igual con migrado=false y el override manual queda deshabilitado.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [{ rows: etapas }, { rows: varsDef }] = await Promise.all([
    db.query(
      `select id, orden, nombre, calificacion from etapas
       where agente_id=$1 and activo order by orden`,
      [id]
    ),
    db.query(`select nombre from agente_variables where agente_id=$1`, [id]),
  ]);

  const baseSql = `
    select c.id, c.telefono,
      nullif(coalesce(c.variables_recolectadas->>'nombre_lead',
                      c.variables_recolectadas->>'nombre',
                      c.variables_recolectadas->>'nombre_completo'), '') as nombre,
      c.variables_recolectadas as ficha,
      e.id as etapa_id, e.orden as etapa_orden, e.nombre as etapa_nombre,
      c.transbordado, coalesce(c.pausado, false) as pausado,
      c.ultima_actividad,
      coalesce(c.ultimo_mensaje_lead,
        (select max(ml.creado_en) from mensajes_log ml
          where ml.conversacion_id = c.id and nullif(ml.mensaje_lead, '') is not null)
      ) as ultima_respuesta,
      (select min(ml.creado_en) from mensajes_log ml where ml.conversacion_id = c.id) as inicio,
      (select count(*)::int from mensajes_log ml where ml.conversacion_id = c.id) as turnos,
      (select count(*)::int from mensajes_log ml
        where ml.conversacion_id = c.id and nullif(ml.mensaje_lead, '') is not null) as turnos_lead,
      (select coalesce(max(case e2.calificacion when 'sql' then 2 when 'sal' then 1 else 0 end), 0)
         from etapas e2
         where e2.agente_id = c.agente_id and e2.activo and e2.orden <= coalesce(e.orden, 0)) as calif_nivel
      __EXTRA__
    from conversaciones c
    left join etapas e on e.id = c.etapa_actual_id
    where c.agente_id = $1
    order by c.ultima_actividad desc
    limit 500`;

  let leadsRaw;
  let migrado = true;
  try {
    leadsRaw = (await db.query(baseSql.replace("__EXTRA__", ", c.lead_estado, c.lead_notas"), [id])).rows;
  } catch {
    migrado = false;
    leadsRaw = (
      await db.query(baseSql.replace("__EXTRA__", ", null::text as lead_estado, null::text as lead_notas"), [id])
    ).rows;
  }

  const ordenes = etapas.map((e) => e.orden as number);
  const maxOrden = ordenes.length ? Math.max(...ordenes) : 1;
  const minOrden = ordenes.length ? Math.min(...ordenes) : 1;
  const vars = varsDef.map((v) => v.nombre as string);

  const leads = leadsRaw.map((l) => ({
    telefono: l.telefono,
    nombre: l.nombre,
    etapa_id: l.etapa_id,
    etapa_nombre: l.etapa_nombre,
    etapa_orden: l.etapa_orden,
    transbordado: l.transbordado,
    pausado: l.pausado,
    ultima_actividad: l.ultima_actividad,
    ultima_respuesta: l.ultima_respuesta,
    inicio: l.inicio,
    turnos: l.turnos,
    turnos_lead: l.turnos_lead,
    calif_nivel: l.calif_nivel,
    lead_estado: l.lead_estado,
    lead_notas: l.lead_notas,
    ficha: l.ficha ?? {},
    ...clasificarLead(l, maxOrden, minOrden, vars),
  }));

  const porTip = Object.fromEntries(
    TIPIFICACIONES.map((t) => [t, leads.filter((l) => l.tipificacion === t).length])
  ) as Record<Tipificacion, number>;

  const kpis = { total: leads.length, ...porTip };

  return Response.json({ migrado, kpis, etapas, leads });
}
