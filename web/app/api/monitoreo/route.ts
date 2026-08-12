import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/monitoreo
// Consumo de OpenAI por cliente (tenant), serie diaria, breakdown por modelo,
// y uso del mes vs quota. Todo desde uso_tokens (el motor ya lo registra).

// TARIFAS ASUMIDAS (USD por 1.000.000 de tokens). AJUSTAR con los precios reales
// de OpenAI cuando los tengas — se muestran en el panel para que sean transparentes.
const PRECIOS: Record<string, { in: number; out: number }> = {
  "gpt-5.1": { in: 1.25, out: 10 },
  "gpt-4.1": { in: 2, out: 8 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-5-mini": { in: 0.25, out: 2 },
  "o4-mini": { in: 1.1, out: 4.4 },
  default: { in: 1, out: 5 },
};

function familia(modelo: string): string {
  const m = (modelo || "").toLowerCase();
  for (const k of Object.keys(PRECIOS)) if (k !== "default" && m.startsWith(k)) return k;
  return "default";
}
function costo(modelo: string, pin: number, pout: number): number {
  const p = PRECIOS[familia(modelo)] || PRECIOS.default;
  return (pin / 1e6) * p.in + (pout / 1e6) * p.out;
}

export async function GET() {
  // 1) Consumo por tenant + modelo, con cortes de período
  const { rows } = await db.query(`
    select coalesce(a.tenant,'(sin tenant)') as tenant, ut.modelo,
      sum(ut.prompt_tokens)::bigint as pin,
      sum(ut.completion_tokens)::bigint as pout,
      count(*)::int as llamadas,
      coalesce(sum(ut.prompt_tokens) filter (where ut.creado_en >= date_trunc('month', now())),0)::bigint as pin_mes,
      coalesce(sum(ut.completion_tokens) filter (where ut.creado_en >= date_trunc('month', now())),0)::bigint as pout_mes,
      coalesce(sum(ut.prompt_tokens+ut.completion_tokens) filter (where ut.creado_en >= now()-interval '7 days'),0)::bigint as tok_7d,
      coalesce(sum(ut.prompt_tokens+ut.completion_tokens) filter (where ut.creado_en::date = now()::date),0)::bigint as tok_hoy
    from uso_tokens ut
    join conversaciones c on c.id = ut.conversacion_id
    join agentes a on a.id = c.agente_id
    group by a.tenant, ut.modelo
  `);

  // límite por tenant (suma de los límites de sus agentes)
  const { rows: lims } = await db.query(`
    select coalesce(tenant,'(sin tenant)') as tenant, sum(limite_tokens_mes)::bigint as limite
    from agentes where limite_tokens_mes is not null group by tenant
  `);
  const limitePorTenant = new Map(lims.map((r) => [r.tenant, Number(r.limite)]));

  // agregación por tenant en JS (para computar costo con tarifas)
  const porTenant = new Map<string, {
    tenant: string; tokens_total: number; tokens_mes: number; tokens_7d: number; tokens_hoy: number;
    costo_total: number; costo_mes: number; llamadas: number;
  }>();
  const porModelo = new Map<string, { modelo: string; tokens: number; costo: number; llamadas: number }>();

  for (const r of rows) {
    const pin = Number(r.pin), pout = Number(r.pout);
    const c = costo(r.modelo, pin, pout);
    const cMes = costo(r.modelo, Number(r.pin_mes), Number(r.pout_mes));
    const t = porTenant.get(r.tenant) || { tenant: r.tenant, tokens_total: 0, tokens_mes: 0, tokens_7d: 0, tokens_hoy: 0, costo_total: 0, costo_mes: 0, llamadas: 0 };
    t.tokens_total += pin + pout;
    t.tokens_mes += Number(r.pin_mes) + Number(r.pout_mes);
    t.tokens_7d += Number(r.tok_7d);
    t.tokens_hoy += Number(r.tok_hoy);
    t.costo_total += c;
    t.costo_mes += cMes;
    t.llamadas += Number(r.llamadas);
    porTenant.set(r.tenant, t);

    const fam = familia(r.modelo);
    const m = porModelo.get(fam) || { modelo: fam, tokens: 0, costo: 0, llamadas: 0 };
    m.tokens += pin + pout; m.costo += c; m.llamadas += Number(r.llamadas);
    porModelo.set(fam, m);
  }

  const tenants = [...porTenant.values()].map((t) => {
    const limite = limitePorTenant.get(t.tenant) ?? null;
    return { ...t, limite_tokens_mes: limite, pct_quota: limite ? Math.round((t.tokens_mes / limite) * 100) : null };
  }).sort((a, b) => b.costo_total - a.costo_total);

  // 2) serie diaria (14d): tokens y costo aproximado (usa tarifa del modelo por fila)
  const { rows: serieRows } = await db.query(`
    select ut.creado_en::date as dia, ut.modelo,
      sum(ut.prompt_tokens)::bigint pin, sum(ut.completion_tokens)::bigint pout
    from uso_tokens ut
    where ut.creado_en >= now()-interval '14 days'
    group by ut.creado_en::date, ut.modelo order by dia
  `);
  const serieMap = new Map<string, { dia: string; tokens: number; costo: number }>();
  for (const r of serieRows) {
    const dia = new Date(r.dia).toISOString().slice(0, 10);
    const s = serieMap.get(dia) || { dia, tokens: 0, costo: 0 };
    s.tokens += Number(r.pin) + Number(r.pout);
    s.costo += costo(r.modelo, Number(r.pin), Number(r.pout));
    serieMap.set(dia, s);
  }
  const serie = [...serieMap.values()];

  const totales = {
    costo_total: tenants.reduce((s, t) => s + t.costo_total, 0),
    costo_mes: tenants.reduce((s, t) => s + t.costo_mes, 0),
    tokens_hoy: tenants.reduce((s, t) => s + t.tokens_hoy, 0),
    tokens_7d: tenants.reduce((s, t) => s + t.tokens_7d, 0),
    llamadas: tenants.reduce((s, t) => s + t.llamadas, 0),
  };

  return Response.json({
    totales,
    tenants,
    modelos: [...porModelo.values()].sort((a, b) => b.costo - a.costo),
    serie,
    tarifas: PRECIOS,
  });
}
