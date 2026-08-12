import { db } from "@/lib/db";

// Tarifas OpenAI en USD por 1M de tokens: [input, output]. Editar si cambian.
const PRICING: Record<string, [number, number]> = {
  "gpt-4.1-mini": [0.4, 1.6],
  "gpt-4.1-nano": [0.1, 0.4],
  "gpt-4.1": [2.0, 8.0],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4o": [2.5, 10.0],
  "gpt-4-turbo": [10, 30],
  "gpt-4": [30, 60],
  "gpt-3.5-turbo": [0.5, 1.5],
};
const PRICING_KEYS = Object.keys(PRICING).sort((a, b) => b.length - a.length); // más largo primero
function priceFor(modelo: string): [number, number] {
  const m = (modelo || "").toLowerCase();
  for (const k of PRICING_KEYS) if (m.startsWith(k)) return PRICING[k];
  return [2.5, 10.0]; // fallback ~ gpt-4o
}
function costUsd(modelo: string, pt: number, ct: number): number {
  const [i, o] = priceFor(modelo);
  return (pt / 1e6) * i + (ct / 1e6) * o;
}

type ModeloAgg = { modelo: string; llamadas: number; prompt_tokens: number; completion_tokens: number; costo_usd: number };
type Bot = {
  id: string; nombre: string; tenant: string; ambiente: string; publicado: boolean;
  prompt_tokens: number; completion_tokens: number; llamadas: number; conversaciones: number;
  costo_usd: number; turns: number; bloqueados: number; transbordos: number; modelos: ModeloAgg[];
};

// GET /api/dashboard — agregados por bot: tokens, costo USD, modelos y calidad.
export async function GET() {
  const [base, porModelo, calidad, transb, serieRaw] = await Promise.all([
    db.query(
      `select a.id, a.nombre, a.tenant, a.ambiente, a.publicado,
              coalesce(sum(ut.prompt_tokens),0)::int as prompt_tokens,
              coalesce(sum(ut.completion_tokens),0)::int as completion_tokens,
              count(ut.id)::int as llamadas,
              count(distinct c.id)::int as conversaciones
       from agentes a
       left join conversaciones c on c.agente_id = a.id
       left join uso_tokens ut on ut.conversacion_id = c.id
       group by a.id, a.nombre, a.tenant, a.ambiente, a.publicado
       order by a.tenant, a.nombre`
    ),
    db.query(
      `select c.agente_id, ut.modelo,
              sum(ut.prompt_tokens)::int as prompt_tokens,
              sum(ut.completion_tokens)::int as completion_tokens,
              count(*)::int as llamadas
       from uso_tokens ut join conversaciones c on c.id = ut.conversacion_id
       where ut.modelo is not null
       group by c.agente_id, ut.modelo`
    ),
    db.query(
      `select agente_id, count(*)::int as turns, count(*) filter (where bloqueado)::int as bloqueados
       from mensajes_log group by agente_id`
    ),
    db.query(
      `select c.agente_id, count(*)::int as transbordos
       from conversacion_eventos ev join conversaciones c on c.id = ev.conversacion_id
       where ev.tipo = 'transbordo' group by c.agente_id`
    ),
    // serie temporal por día + tenant + modelo (el costo se colapsa en JS)
    db.query(
      `select date_trunc('day', ut.creado_en)::date as dia, a.tenant, ut.modelo,
              sum(ut.prompt_tokens)::int as prompt_tokens,
              sum(ut.completion_tokens)::int as completion_tokens
       from uso_tokens ut
       join conversaciones c on c.id = ut.conversacion_id
       join agentes a on a.id = c.agente_id
       where ut.modelo is not null
       group by 1, 2, 3 order by 1`
    ),
  ]);

  const byId = new Map<string, Bot>();
  for (const r of base.rows as any[]) {
    byId.set(r.id, { ...r, costo_usd: 0, turns: 0, bloqueados: 0, transbordos: 0, modelos: [] });
  }
  for (const r of porModelo.rows as any[]) {
    const bot = byId.get(r.agente_id);
    if (!bot) continue;
    const c = costUsd(r.modelo, r.prompt_tokens, r.completion_tokens);
    bot.modelos.push({ modelo: r.modelo, llamadas: r.llamadas, prompt_tokens: r.prompt_tokens, completion_tokens: r.completion_tokens, costo_usd: c });
    bot.costo_usd += c;
  }
  for (const r of calidad.rows as any[]) {
    const bot = byId.get(r.agente_id);
    if (bot) { bot.turns = r.turns; bot.bloqueados = r.bloqueados; }
  }
  for (const r of transb.rows as any[]) {
    const bot = byId.get(r.agente_id);
    if (bot) bot.transbordos = r.transbordos;
  }

  // serie: colapsa día+tenant+modelo -> día+tenant con tokens y costo
  const serieMap = new Map<string, { dia: string; tenant: string; tokens: number; costo_usd: number }>();
  for (const r of serieRaw.rows as any[]) {
    const dia = typeof r.dia === "string" ? r.dia.slice(0, 10) : new Date(r.dia).toISOString().slice(0, 10);
    const key = `${dia}|${r.tenant}`;
    const e = serieMap.get(key) ?? { dia, tenant: r.tenant, tokens: 0, costo_usd: 0 };
    e.tokens += r.prompt_tokens + r.completion_tokens;
    e.costo_usd += costUsd(r.modelo, r.prompt_tokens, r.completion_tokens);
    serieMap.set(key, e);
  }
  const serie = [...serieMap.values()].sort((a, b) => a.dia.localeCompare(b.dia));

  return Response.json({ bots: [...byId.values()], serie });
}
