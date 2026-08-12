import { db } from "@/lib/db";

// GET /api/agentes/[id]/informe?mes=YYYY-MM — compila el informe mensual del cliente:
// KPIs del período, embudo de conversión (cohort de las conversaciones iniciadas en el mes),
// demanda, calidad (juez QA) y el análisis IA persistido más cercano al mes.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mesParam = new URL(req.url).searchParams.get("mes"); // YYYY-MM
  // primer día del mes; default: mes actual
  const mes = /^\d{4}-\d{2}$/.test(mesParam || "") ? `${mesParam}-01` : null;

  try {
    const { rows: ag } = await db.query(`select nombre, tenant from agentes where id=$1`, [id]);
    if (!ag[0]) return Response.json({ error: "agente no existe" }, { status: 404 });

    const rango = mes ? mes : null;
    // Si no se pasó mes, usamos el mes calendario actual (date_trunc en SQL).
    const desde = rango ? "$2::date" : "date_trunc('month', now())::date";
    const hasta = rango ? "($2::date + interval '1 month')" : "(date_trunc('month', now()) + interval '1 month')::date";
    const args = rango ? [id, rango] : [id];

    const [convsMes, embudo, kpis, calidad, demanda, run] = await Promise.all([
      // cohort de conversaciones iniciadas en el mes
      db.query(
        `with convs as (
           select c.id,
             (select min(ml.creado_en) from mensajes_log ml where ml.conversacion_id=c.id) as inicio
           from conversaciones c where c.agente_id=$1
         )
         select count(*)::int as n from convs
         where inicio >= ${desde} and inicio < ${hasta}`,
        args
      ),
      db.query(
        `with convs as (
           select c.id, c.etapa_actual_id,
             (select min(ml.creado_en) from mensajes_log ml where ml.conversacion_id=c.id) as inicio,
             greatest(
               coalesce((select max(e2.orden) from conversacion_eventos ev
                          join etapas e2 on e2.id=ev.etapa_hasta_id
                          where ev.conversacion_id=c.id and e2.agente_id=$1),0),
               coalesce((select orden from etapas where id=c.etapa_actual_id),0)
             ) as max_orden
           from conversaciones c where c.agente_id=$1
         ),
         mes as (select * from convs where inicio >= ${desde} and inicio < ${hasta})
         select e.orden, e.nombre, e.calificacion,
           (select count(*) from mes m where m.max_orden >= e.orden)::int as alcanzaron
         from etapas e where e.agente_id=$1 and e.activo order by e.orden`,
        args
      ),
      db.query(
        `select
           (select count(*)::int from mensajes_log where agente_id=$1 and creado_en >= ${desde} and creado_en < ${hasta}) as mensajes,
           (select count(*)::int from mensajes_log where agente_id=$1 and bloqueado and creado_en >= ${desde} and creado_en < ${hasta}) as bloqueados,
           (select count(distinct conversacion_id)::int from conversacion_eventos ev
              where ev.tipo='transbordo' and ev.creado_en >= ${desde} and ev.creado_en < ${hasta}
              and ev.conversacion_id in (select id from conversaciones where agente_id=$1)) as transbordados`,
        args
      ),
      db.query(
        `select count(*)::int n, round(avg(total),1) promedio,
           round(avg(memoria),1) m, round(avg(etapas),1) et, round(avg(naturalidad),1) na,
           round(avg(ventas),1) ve, round(avg(correccion),1) co
         from qa_evaluaciones where agente_id=$1 and creado_en >= ${desde} and creado_en < ${hasta}`,
        args
      ),
      db.query(
        `select clave, valor, count(*)::int as n from (
           select key as clave, value as valor
           from conversaciones c, jsonb_each_text(coalesce(c.variables_recolectadas,'{}'::jsonb))
           where c.agente_id=$1 and coalesce(nullif(value,''),'')<>''
         ) t
         where clave in ('area_interes','carrera_interes','formato_producto','sede','programa_interes')
         group by clave, valor order by clave, n desc`,
        [id]
      ),
      // análisis IA del mes (o el más reciente si no hubo en el mes)
      db.query(
        `select resumen, temas, objeciones, huecos_kb, recomendaciones, generado_en
         from insights_runs where agente_id=$1
         order by (generado_en >= ${desde} and generado_en < ${hasta}) desc, generado_en desc
         limit 1`,
        args
      ),
    ]);

    const dimsMap: Record<string, { valor: string; n: number }[]> = {};
    for (const r of demanda.rows) (dimsMap[r.clave] ||= []).push({ valor: r.valor, n: r.n });

    const base = embudo.rows.length ? embudo.rows[0].alcanzaron : 0;

    return Response.json({
      agente: ag[0],
      mes: mesParam || new Date().toISOString().slice(0, 7),
      leads: convsMes.rows[0]?.n ?? 0,
      kpis: kpis.rows[0],
      embudo: embudo.rows,
      embudoBase: base,
      calidad: calidad.rows[0],
      demanda: dimsMap,
      analisis: run.rows[0] || null,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
