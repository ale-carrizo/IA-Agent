import { db } from "@/lib/db";

// GET /api/agentes/[id]/insights — tablero de Insights.
//   ?dim=<clave_variable>&val=<valor>  filtra el embudo cohort por un campo de la ficha.
// Devuelve: kpis, funnel (foto actual), serie, raw (legacy, intactos) +
//   cohort (embudo de conversión REAL), dims (demanda por variable), calidad
//   (juez QA: resumen + flojas), runs (historial de análisis IA), ultimoRun (completo).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const dim = url.searchParams.get("dim");
  const val = url.searchParams.get("val");
  const filtra = dim && val ? true : false;

  try {
    // Filtro opcional de cohort por campo de la ficha (variables_recolectadas->>dim = val)
    const cohortFiltro = filtra ? ` and c.variables_recolectadas->>$2 = $3` : "";
    const cohortArgs = filtra ? [id, dim, val] : [id];

    const [kpis, funnel, serie, raw, cohortQ, dimsQ, calResumen, calFlojas, runs, ultimo] = await Promise.all([
      db.query(
        `select
           (select count(*)::int from conversaciones where agente_id=$1) as leads_total,
           (select count(*)::int from conversaciones where agente_id=$1 and ultima_actividad > now() - interval '7 days') as leads_7d,
           (select count(*)::int from conversaciones where agente_id=$1 and transbordado) as transbordados,
           (select count(*)::int from mensajes_log where agente_id=$1 and creado_en > now() - interval '7 days') as mensajes_7d,
           (select count(*)::int from mensajes_log where agente_id=$1 and bloqueado and creado_en > now() - interval '7 days') as bloqueados_7d`,
        [id]
      ),
      db.query(
        `select e.orden, e.nombre, count(c.id)::int as leads
         from etapas e
         left join conversaciones c on c.etapa_actual_id = e.id and c.agente_id = e.agente_id
         where e.agente_id=$1 and e.activo
         group by e.id, e.orden, e.nombre
         order by e.orden`,
        [id]
      ),
      db.query(
        `select to_char(creado_en::date,'DD/MM') as dia, count(*)::int as mensajes
         from mensajes_log where agente_id=$1 and creado_en > now() - interval '14 days'
         group by creado_en::date order by creado_en::date`,
        [id]
      ),
      db.query(
        `select direccion, tipo, count(*)::int as c
         from mensajes_raw where agente_id=$1 or telefono in (select telefono from conversaciones where agente_id=$1)
         group by direccion, tipo order by c desc`,
        [id]
      ),
      // Embudo de CONVERSIÓN real: por cada etapa activa, cuántas conversaciones
      // ALCANZARON ese orden alguna vez (máx orden entre sus transiciones + etapa actual).
      db.query(
        `with alcanzado as (
           select c.id,
             greatest(
               coalesce((select max(e2.orden) from conversacion_eventos ev
                          join etapas e2 on e2.id = ev.etapa_hasta_id
                          where ev.conversacion_id = c.id and e2.agente_id = $1), 0),
               coalesce((select orden from etapas where id = c.etapa_actual_id), 0)
             ) as max_orden
           from conversaciones c
           where c.agente_id = $1${cohortFiltro}
         )
         select e.orden, e.nombre, e.calificacion,
           (select count(*) from alcanzado a where a.max_orden >= e.orden)::int as alcanzaron
         from etapas e
         where e.agente_id = $1 and e.activo
         order by e.orden`,
        cohortArgs
      ),
      // Demanda por variable de interés (top valores de la ficha) — determinístico, sin IA.
      db.query(
        `select clave, valor, count(*)::int as n from (
           select key as clave, value as valor
           from conversaciones c, jsonb_each_text(coalesce(c.variables_recolectadas,'{}'::jsonb))
           where c.agente_id = $1 and coalesce(nullif(value,''),'') <> ''
         ) t
         where clave in ('area_interes','carrera_interes','formato_producto','sede','programa_interes')
         group by clave, valor
         having count(*) >= 1
         order by clave, n desc`,
        [id]
      ),
      db.query(
        `select count(*)::int n,
           round(avg(total),1) as promedio,
           round(avg(memoria),1) m, round(avg(etapas),1) et, round(avg(naturalidad),1) na,
           round(avg(ventas),1) ve, round(avg(correccion),1) co
         from qa_evaluaciones where agente_id=$1 and creado_en > now() - interval '30 days'`,
        [id]
      ),
      // Solo la evaluación MÁS RECIENTE por conversación, y solo las flojas (< 35/50).
      db.query(
        `select q.conversacion_id, q.telefono, q.total, q.veredicto, q.fallas, q.creado_en
         from qa_evaluaciones q
         where q.agente_id=$1
           and q.creado_en = (select max(q2.creado_en) from qa_evaluaciones q2 where q2.conversacion_id = q.conversacion_id)
           and q.total < 35
         order by q.total asc, q.creado_en desc
         limit 15`,
        [id]
      ),
      db.query(
        `select id, origen, dialogos_analizados, resumen, generado_en,
           jsonb_array_length(temas) as n_temas, jsonb_array_length(objeciones) as n_objeciones
         from insights_runs where agente_id=$1 order by generado_en desc limit 12`,
        [id]
      ),
      db.query(
        `select id, origen, dialogos_analizados, resumen, temas, objeciones, huecos_kb, recomendaciones, generado_en
         from insights_runs where agente_id=$1 order by generado_en desc limit 1`,
        [id]
      ),
    ]);

    // Agrupa demanda por clave
    const dimsMap: Record<string, { valor: string; n: number }[]> = {};
    for (const r of dimsQ.rows) {
      (dimsMap[r.clave] ||= []).push({ valor: r.valor, n: r.n });
    }

    return Response.json({
      kpis: kpis.rows[0],
      funnel: funnel.rows,
      serie: serie.rows,
      raw: raw.rows,
      cohort: cohortQ.rows,
      dims: dimsMap,
      filtro: filtra ? { dim, val } : null,
      calidad: {
        resumen: calResumen.rows[0],
        flojas: calFlojas.rows,
      },
      runs: runs.rows,
      ultimoRun: ultimo.rows[0] || null,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
