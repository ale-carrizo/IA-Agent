"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Cpu, Zap, MessageSquare, Phone, Bot, ChevronRight, ChevronDown, Plus, X, TrendingUp, Building2, GraduationCap,
  DollarSign, ShieldAlert, ArrowRightLeft, LogOut, Moon, Sun, Trash2,
} from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { api, useToast } from "@/lib/ui";
import { useTheme } from "./providers";

// ─── Paleta clara + acentos NODS (skill: nods-frontend, variante light) ──────
const C = {
  bg: "var(--c-bg)", sidebar: "var(--c-sidebar)", card: "var(--c-card)", border: "var(--c-border)",
  text: "var(--c-text)", muted: "var(--c-muted)", faint: "var(--c-faint)",
  blue: "var(--c-blue)", blueL: "var(--c-blue-l)", blueSoft: "var(--c-blue-soft)",
};
const PALETTE = ["#1946E3", "#3B63F0", "#16A34A", "#7C3AED", "#0891B2", "#EA580C", "#DB2777", "#0D9488"];

// ─── Types ──────────────────────────────────────────────────────────────────
type ModeloAgg = { modelo: string; llamadas: number; prompt_tokens: number; completion_tokens: number; costo_usd: number };
type BotStat = {
  id: string; nombre: string; tenant: string; ambiente: string; publicado: boolean;
  prompt_tokens: number; completion_tokens: number; llamadas: number; conversaciones: number;
  costo_usd: number; turns: number; bloqueados: number; transbordos: number; modelos: ModeloAgg[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const nf = new Intl.NumberFormat("es-AR");
const fmt = (n: number) => nf.format(n || 0);
function fmtTokens(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n || 0);
}
function fmtUsd(n: number) {
  if (!n) return "US$0";
  if (n < 0.01) return "<US$0.01";
  return "US$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// nombre de modelo abreviado (gpt-4.1-2025-04-14 -> gpt-4.1)
function modeloCorto(m: string) { return (m || "").replace(/-\d{4}-\d{2}-\d{2}$/, "").replace(/-preview$/, ""); }

type SeriePoint = { dia: string; tenant: string; tokens: number; costo_usd: number };
type Periodo = "dia" | "semana" | "mes";
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function isoWeekStart(dia: string) {
  const d = new Date(dia + "T00:00:00");
  const off = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - off);
  return d.toISOString().slice(0, 10);
}
function bucketKey(dia: string, p: Periodo) {
  if (p === "mes") return dia.slice(0, 7);      // YYYY-MM
  if (p === "semana") return isoWeekStart(dia); // YYYY-MM-DD (lunes)
  return dia;                                   // YYYY-MM-DD
}
function bucketLabel(key: string, p: Periodo) {
  if (p === "mes") { const [y, m] = key.split("-"); return `${MESES[+m - 1]} ${y.slice(2)}`; }
  const d = new Date(key + "T00:00:00");
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}
const IDIOMAS = [
  { value: "es", label: "Español" }, { value: "pt", label: "Português" }, { value: "en", label: "English" },
];

// ─── Page ───────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { show, node } = useToast();
  const [bots, setBots] = useState<BotStat[]>([]);
  const [serie, setSerie] = useState<SeriePoint[]>([]);
  const [periodo, setPeriodo] = useState<Periodo>("dia");
  const [metricaSerie, setMetricaSerie] = useState<"tokens" | "usd">("tokens");
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<string>(""); // scope del main ("" = NODS / global)
  const [nodsOpen, setNodsOpen] = useState(true); // carpeta NODS
  const [openTenants, setOpenTenants] = useState<Set<string>>(new Set()); // universidades desplegadas
  const [createOpen, setCreateOpen] = useState(false); // modal crear bot
  const [createTenant, setCreateTenant] = useState(""); // tenant prellenado al crear

  const load = async () => {
    setLoading(true);
    try {
      const data = await api("/api/dashboard", "GET") as { bots?: BotStat[]; serie?: SeriePoint[] };
      setBots(data.bots ?? []);
      setSerie(data.serie ?? []);
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const tenants = useMemo(() => {
    const map = new Map<string, { tenant: string; bots: number; tokens: number; llamadas: number; costo: number }>();
    for (const b of bots) {
      const t = map.get(b.tenant) ?? { tenant: b.tenant, bots: 0, tokens: 0, llamadas: 0, costo: 0 };
      t.bots += 1; t.tokens += b.prompt_tokens + b.completion_tokens; t.llamadas += b.llamadas; t.costo += b.costo_usd;
      map.set(b.tenant, t);
    }
    return [...map.values()].sort((a, b) => b.tokens - a.tokens);
  }, [bots]);

  const botsBy = (t: string) => bots.filter((b) => b.tenant === t).sort((a, b) => (b.prompt_tokens + b.completion_tokens) - (a.prompt_tokens + a.completion_tokens));
  const visibles = useMemo(() => (tenant ? botsBy(tenant) : bots), [bots, tenant]); // eslint-disable-line react-hooks/exhaustive-deps

  const totales = useMemo(() => {
    const acc = { prompt: 0, completion: 0, llamadas: 0, conversaciones: 0, costo: 0, turns: 0, bloqueados: 0, transbordos: 0 };
    for (const b of visibles) {
      acc.prompt += b.prompt_tokens; acc.completion += b.completion_tokens;
      acc.llamadas += b.llamadas; acc.conversaciones += b.conversaciones;
      acc.costo += b.costo_usd; acc.turns += b.turns; acc.bloqueados += b.bloqueados; acc.transbordos += b.transbordos;
    }
    return acc;
  }, [visibles]);
  const tokensTotales = totales.prompt + totales.completion;
  const totalGlobal = useMemo(() => bots.reduce((s, b) => s + b.prompt_tokens + b.completion_tokens, 0), [bots]);

  // modelos agregados sobre lo visible (para la tarjeta "Modelos")
  const modelosAgg = useMemo(() => {
    const map = new Map<string, ModeloAgg>();
    for (const b of visibles) for (const m of b.modelos) {
      const e = map.get(m.modelo) ?? { modelo: m.modelo, llamadas: 0, prompt_tokens: 0, completion_tokens: 0, costo_usd: 0 };
      e.llamadas += m.llamadas; e.prompt_tokens += m.prompt_tokens; e.completion_tokens += m.completion_tokens; e.costo_usd += m.costo_usd;
      map.set(m.modelo, e);
    }
    return [...map.values()].sort((a, b) => b.costo_usd - a.costo_usd);
  }, [visibles]);

  const chartData = useMemo(() => {
    if (!tenant) return tenants.map((t) => ({ label: t.tenant, value: t.tokens, usd: t.costo }));
    return botsBy(tenant).map((b) => ({ label: b.nombre, value: b.prompt_tokens + b.completion_tokens, usd: b.costo_usd }));
  }, [tenant, tenants, bots]); // eslint-disable-line react-hooks/exhaustive-deps

  // serie temporal filtrada por tenant + agrupada por período
  const lineData = useMemo(() => {
    const filt = serie.filter((s) => !tenant || s.tenant === tenant);
    const map = new Map<string, { key: string; tokens: number; costo: number }>();
    for (const s of filt) {
      const k = bucketKey(s.dia, periodo);
      const e = map.get(k) ?? { key: k, tokens: 0, costo: 0 };
      e.tokens += s.tokens; e.costo += s.costo_usd;
      map.set(k, e);
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [serie, tenant, periodo]);

  function toggleTenant(t: string) {
    setOpenTenants((prev) => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });
    setTenant(t);
  }
  function abrirCrear(prefill = "") { setCreateTenant(prefill); setCreateOpen(true); }
  const tenantNames = useMemo(() => tenants.map((t) => t.tenant), [tenants]);

  async function eliminarBot(e: React.MouseEvent, b: BotStat) {
    e.preventDefault(); e.stopPropagation();
    const ok = window.confirm(
      `¿Eliminar "${b.nombre}" (${b.tenant})?\n\nSe borra TODO el agente: etapas, conversaciones, base de conocimiento, cursos, logs e integraciones.\nEsta acción NO se puede deshacer.`
    );
    if (!ok) return;
    try {
      await api(`/api/agentes/${b.id}`, "DELETE");
      show(`Agente "${b.nombre}" eliminado`);
      await load();
    } catch (err) {
      show((err as Error).message, true);
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row font-nods" style={{ background: C.bg, color: C.text }}>
      {/* ── Sidebar: árbol de carpetas NODS ▸ Universidades ▸ Bots ── */}
      <aside className="md:w-72 shrink-0 md:h-screen md:sticky md:top-0 p-3 md:p-4 flex flex-col" style={{ background: C.sidebar, borderRight: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2.5 px-2 pb-3 mb-2" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-semibold" style={{ background: `linear-gradient(135deg, ${C.blue}, #0F2FA0)` }}>N</div>
          <div className="text-sm font-semibold">Sales AI</div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {/* NODS (raíz / empresa) */}
          <TreeRow level={0} folder open={nodsOpen} active={tenant === ""} icon={<Building2 className="w-4 h-4" />}
            label="NODS" right={fmtTokens(totalGlobal)} onClick={() => { setNodsOpen((o) => !o); setTenant(""); }} />

          {nodsOpen && tenants.map((t) => (
            <div key={t.tenant}>
              {/* Universidad */}
              <TreeRow level={1} folder open={openTenants.has(t.tenant)} active={tenant === t.tenant} icon={<GraduationCap className="w-4 h-4" />}
                label={t.tenant} sub={`${t.bots} bot${t.bots === 1 ? "" : "s"}`} right={fmtTokens(t.tokens)}
                onClick={() => toggleTenant(t.tenant)} />
              {/* Bots */}
              {openTenants.has(t.tenant) && (
                botsBy(t.tenant).length === 0
                  ? <div className="text-[11px] italic pl-11 py-1" style={{ color: C.faint }}>Sin bots</div>
                  : botsBy(t.tenant).map((b) => (
                    <TreeLeaf key={b.id} href={`/agent/${b.id}/identidad`} label={b.nombre} publicado={b.publicado}
                      onDelete={(e) => eliminarBot(e, b)} />
                  ))
              )}
            </div>
          ))}

          {!loading && tenants.length === 0 && <div className="text-xs pl-2 py-2" style={{ color: C.muted }}>Sin universidades todavía.</div>}
        </div>

        {/* Crear bot — fijo abajo a la izquierda */}
        <button onClick={() => abrirCrear("")}
          className="mt-3 flex-shrink-0 flex items-center justify-center gap-2 h-10 rounded-[10px] text-sm font-semibold text-white transition-all"
          style={{ background: `linear-gradient(90deg, ${C.blue}, ${C.blueL})`, boxShadow: "0 6px 16px rgba(25,70,227,0.22)" }}>
          <Plus className="w-4 h-4" /> Nuevo bot
        </button>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 min-w-0">
        <div className="max-w-5xl mx-auto px-6 py-7 space-y-6">
          {/* Header + breadcrumb */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.06em] mb-1 flex items-center gap-1.5" style={{ color: C.muted }}>
                <span style={{ color: C.blueL }}>NODS</span>
                {tenant && <><ChevronRight className="w-3 h-3" /> <span style={{ color: C.blueL }}>{tenant}</span></>}
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">{tenant || "Todas las universidades"}</h1>
              <p className="text-sm mt-0.5" style={{ color: C.muted }}>Consumo de tokens {tenant ? "y bots de esta universidad" : "en toda la operación"}.</p>
            </div>
            <UsuarioMenu />
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi hero icon={<Zap className="w-5 h-5" />} label="Tokens totales" value={fmt(tokensTotales)} />
            <Kpi icon={<DollarSign className="w-5 h-5" />} label="Gasto estimado" value={fmtUsd(totales.costo)} />
            <Kpi icon={<MessageSquare className="w-5 h-5" />} label="Llamadas al modelo" value={fmt(totales.llamadas)} />
            <Kpi icon={<Phone className="w-5 h-5" />} label="Conversaciones" value={fmt(totales.conversaciones)} />
          </div>

          {/* Tendencia temporal */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="font-semibold text-base">Tendencia de consumo</h2>
                <p className="text-xs mt-0.5" style={{ color: C.muted }}>Evolución por {periodo === "dia" ? "día" : periodo}</p>
              </div>
              <div className="flex items-center gap-2">
                <Segmented options={[{ v: "tokens", l: "Tokens" }, { v: "usd", l: "USD" }]} value={metricaSerie} onChange={(v) => setMetricaSerie(v as "tokens" | "usd")} />
                <Segmented options={[{ v: "dia", l: "Día" }, { v: "semana", l: "Semana" }, { v: "mes", l: "Mes" }]} value={periodo} onChange={(v) => setPeriodo(v as Periodo)} />
              </div>
            </div>
            <LineChart points={lineData} metric={metricaSerie} periodo={periodo} loading={loading} />
          </Card>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-semibold text-base">Tokens por {tenant ? "bot" : "universidad"}</h2>
                  <p className="text-xs mt-0.5" style={{ color: C.muted }}>{tenant ? `Bots de ${tenant}` : "Comparativa entre universidades"}</p>
                </div>
                <TrendingUp className="w-4 h-4" style={{ color: C.blueL }} />
              </div>
              <BarsChart data={chartData} loading={loading} />
            </Card>
            <Card>
              <h2 className="font-semibold text-base">Prompt vs Completion</h2>
              <p className="text-xs mt-0.5 mb-4" style={{ color: C.muted }}>Distribución del consumo</p>
              <Donut prompt={totales.prompt} completion={totales.completion} />
            </Card>
          </div>

          {/* Modelos + Calidad */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-base">Modelos en uso</h2>
                  <p className="text-xs mt-0.5" style={{ color: C.muted }}>Consumo y costo por modelo</p>
                </div>
                <Cpu className="w-4 h-4" style={{ color: C.blueL }} />
              </div>
              <ModelosCard modelos={modelosAgg} />
            </Card>
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-base">Calidad</h2>
                <ShieldAlert className="w-4 h-4" style={{ color: C.blueL }} />
              </div>
              <Calidad turns={totales.turns} bloqueados={totales.bloqueados} transbordos={totales.transbordos} />
            </Card>
          </div>

          {/* Bots (cards con stats) */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: C.blueL }}>
              {tenant ? `Bots de ${tenant}` : "Todos los bots"}
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-sm" style={{ color: C.muted }}>Cargando…</div>
            ) : visibles.length === 0 ? (
              <Card className="text-center py-12"><span className="text-sm" style={{ color: C.muted }}>No hay bots todavía. Creá uno con “Nuevo agente”.</span></Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {visibles.map((b) => (
                  <a key={b.id} href={`/agent/${b.id}/identidad`} className="block rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg group"
                    style={{ background: C.card, border: `1px solid ${C.border}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(25,70,227,0.4)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: C.blueSoft }}>
                          <Bot className="w-5 h-5" style={{ color: C.blue }} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold truncate">{b.nombre}</h3>
                          <div className="flex items-center gap-1.5 mt-1">
                            {!tenant && <Badge tone="blue">{b.tenant}</Badge>}
                            <Badge>{b.ambiente}</Badge>
                            {b.publicado ? <Badge tone="success">publicado</Badge> : <Badge>borrador</Badge>}
                          </div>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1.5 shrink-0">
                        <span className="inline-flex items-center gap-1 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: C.blue }}>
                          Configurar <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                        <button onClick={(e) => eliminarBot(e, b)} title="Eliminar agente"
                          className="p-1.5 rounded-md transition-all"
                          style={{ color: "#DC2626", border: "1px solid rgba(220,38,38,0.25)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(220,38,38,0.1)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-4 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
                      <Stat label="Tokens" value={fmt(b.prompt_tokens + b.completion_tokens)} />
                      <Stat label="Llamadas" value={fmt(b.llamadas)} />
                      <Stat label="Convs." value={fmt(b.conversaciones)} />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <CrearBotModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} show={show} tenants={tenantNames} tenantPrefill={createTenant} />
      {node}
    </div>
  );
}

// ─── Sidebar tree ───────────────────────────────────────────────────────────
function TreeRow({ level, folder, open, active, icon, label, sub, right, onClick, onAdd, addTitle }: {
  level: number; folder?: boolean; open?: boolean; active: boolean; icon: React.ReactNode;
  label: string; sub?: string; right?: string; onClick: () => void; onAdd?: () => void; addTitle?: string;
}) {
  return (
    <div className="group flex items-center rounded-[10px] transition-colors" style={{ background: active ? C.blueSoft : "transparent" }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--c-hover)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}>
      <button onClick={onClick} className="flex items-center gap-2 flex-1 min-w-0 py-2 pr-1 text-left" style={{ paddingLeft: 8 + level * 16 }}>
        {folder ? (
          <ChevronRight className="w-3.5 h-3.5 shrink-0 transition-transform" style={{ color: active ? C.blue : C.faint, transform: open ? "rotate(90deg)" : "none" }} />
        ) : <span className="w-3.5 shrink-0" />}
        <span className="shrink-0" style={{ color: active ? C.blue : C.faint }}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium truncate" style={{ color: active ? C.blue : C.text }}>{label}</span>
          {sub && <span className="block text-[11px]" style={{ color: C.muted }}>{sub}</span>}
        </span>
      </button>
      {right && <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color: active ? C.blue : C.muted }}>{right}</span>}
      {onAdd && (
        <button onClick={onAdd} title={addTitle} className="shrink-0 p-1 mr-1.5 ml-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: C.blue }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(25,70,227,0.12)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
function TreeLeaf({ href, label, publicado, onDelete }: { href: string; label: string; publicado: boolean; onDelete?: (e: React.MouseEvent) => void }) {
  return (
    <a href={href} className="flex items-center gap-2 rounded-[10px] py-1.5 pr-2 transition-colors group" style={{ paddingLeft: 8 + 2 * 16 }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <span className="w-3.5 shrink-0" />
      <Bot className="w-4 h-4 shrink-0" style={{ color: C.faint }} />
      <span className="text-sm truncate flex-1">{label}</span>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: publicado ? "#16A34A" : C.faint }} title={publicado ? "publicado" : "borrador"} />
      {onDelete && (
        <button onClick={onDelete} title="Eliminar agente" className="p-1 rounded-md shrink-0 transition-colors"
          style={{ color: "#DC2626", opacity: 0.55 }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "rgba(220,38,38,0.1)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.55"; e.currentTarget.style.background = "transparent"; }}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </a>
  );
}

// ─── Primitives ─────────────────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl p-6 shadow-card ${className}`} style={{ background: C.card, border: `1px solid ${C.border}` }}>{children}</div>;
}
function Badge({ children, tone }: { children: React.ReactNode; tone?: "success" | "blue" }) {
  const s = tone === "success" ? { bg: "rgba(22,163,74,0.1)", fg: "#15803D", bd: "rgba(22,163,74,0.2)" }
    : tone === "blue" ? { bg: C.blueSoft, fg: C.blue, bd: "rgba(25,70,227,0.2)" }
    : { bg: "var(--c-hover)", fg: C.muted, bd: C.border };
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: s.bg, color: s.fg, border: `1px solid ${s.bd}` }}>{children}</span>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div><div className="text-sm font-semibold tabular-nums">{value}</div><div className="text-[11px]" style={{ color: C.muted }}>{label}</div></div>;
}
function Kpi({ icon, label, value, hero }: { icon: React.ReactNode; label: string; value: string; hero?: boolean }) {
  return (
    <div className="rounded-2xl p-5 relative overflow-hidden shadow-card" style={hero
      ? { background: `linear-gradient(135deg, ${C.blue}, #0F2FA0)`, boxShadow: "0 8px 24px rgba(25,70,227,0.25)" }
      : { background: C.card, border: `1px solid ${C.border}` }}>
      {hero && <div className="absolute -right-6 -top-8 w-28 h-28 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />}
      <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={hero ? { background: "rgba(255,255,255,0.18)", color: "#fff" } : { background: C.blueSoft, color: C.blue }}>{icon}</div>
      <div className="mt-3 text-[28px] font-semibold tabular-nums leading-none" style={{ color: hero ? "#fff" : C.text }}>{value}</div>
      <div className="text-xs mt-1.5" style={{ color: hero ? "rgba(255,255,255,0.85)" : C.muted }}>{label}</div>
    </div>
  );
}

// ─── Charts ─────────────────────────────────────────────────────────────────
function BarsChart({ data, loading }: { data: { label: string; value: number; usd: number }[]; loading: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const hayDatos = data.some((d) => d.value > 0);
  if (loading) return <div className="h-40 flex items-center justify-center text-sm" style={{ color: C.muted }}>Cargando…</div>;
  if (!data.length || !hayDatos) return <div className="h-40 flex items-center justify-center text-sm" style={{ color: C.muted }}>Sin consumo registrado todavía.</div>;
  return (
    <div className="space-y-3.5">
      {data.map((d, i) => {
        const pct = Math.max(2, Math.round((d.value / max) * 100));
        const c = PALETTE[i % PALETTE.length];
        return (
          <div key={d.label}>
            <div className="flex items-center justify-between mb-1.5 gap-3">
              <span className="text-sm font-medium truncate">{d.label}</span>
              <span className="text-sm font-semibold tabular-nums shrink-0">
                {fmt(d.value)} <span className="font-normal" style={{ color: C.muted }}>· {fmtUsd(d.usd)}</span>
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full overflow-hidden" style={{ background: "var(--c-track)" }}>
              <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${c}cc, ${c})` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ModelosCard({ modelos }: { modelos: ModeloAgg[] }) {
  if (!modelos.length) return <div className="h-28 flex items-center justify-center text-sm" style={{ color: C.muted }}>Sin datos de modelos.</div>;
  const maxTok = Math.max(1, ...modelos.map((m) => m.prompt_tokens + m.completion_tokens));
  return (
    <div className="space-y-3">
      {modelos.map((m, i) => {
        const tok = m.prompt_tokens + m.completion_tokens;
        const pct = Math.max(2, Math.round((tok / maxTok) * 100));
        const c = PALETTE[i % PALETTE.length];
        return (
          <div key={m.modelo} className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: c }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{modeloCorto(m.modelo)}</span>
                <span className="text-xs tabular-nums shrink-0" style={{ color: C.muted }}>{fmt(m.llamadas)} llam.</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full overflow-hidden" style={{ background: "var(--c-track)" }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c }} />
              </div>
            </div>
            <div className="text-right shrink-0 w-20">
              <div className="text-sm font-semibold tabular-nums">{fmtUsd(m.costo_usd)}</div>
              <div className="text-[11px]" style={{ color: C.muted }}>{fmtTokens(tok)} tok</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Calidad({ turns, bloqueados, transbordos }: { turns: number; bloqueados: number; transbordos: number }) {
  const rate = turns ? (bloqueados / turns) * 100 : 0;
  const rateStr = turns ? (rate < 0.1 && rate > 0 ? "<0.1" : rate.toFixed(1)) : "—";
  return (
    <div className="space-y-4">
      {/* Tasa de bloqueos */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm" style={{ color: C.muted }}>Respuestas bloqueadas</span>
          <span className="text-2xl font-semibold tabular-nums">{rateStr}{turns ? "%" : ""}</span>
        </div>
        <div className="mt-1.5 h-2 w-full rounded-full overflow-hidden" style={{ background: "var(--c-track)" }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(rate ? 3 : 0, rate))}%`, background: rate > 5 ? "#EA580C" : "#16A34A" }} />
        </div>
        <div className="text-[11px] mt-1" style={{ color: C.faint }}>{fmt(bloqueados)} de {fmt(turns)} turnos (guardrails)</div>
      </div>
      {/* Transbordos */}
      <div className="flex items-center gap-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: C.blueSoft }}>
          <ArrowRightLeft className="w-4 h-4" style={{ color: C.blue }} />
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums leading-none">{fmt(transbordos)}</div>
          <div className="text-[11px]" style={{ color: C.muted }}>Transbordos a humano</div>
        </div>
      </div>
    </div>
  );
}
function Donut({ prompt, completion }: { prompt: number; completion: number }) {
  const total = prompt + completion;
  const r = 54, Cc = 2 * Math.PI * r;
  const pF = total ? prompt / total : 0, cF = total ? completion / total : 0;
  if (!total) return <div className="h-48 flex items-center justify-center text-sm" style={{ color: C.muted }}>Sin datos.</div>;
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width="150" height="150" viewBox="0 0 150 150" className="-rotate-90">
          <circle cx="75" cy="75" r={r} fill="none" stroke="var(--c-track)" strokeWidth="16" />
          <circle cx="75" cy="75" r={r} fill="none" stroke={C.blueL} strokeWidth="16" strokeLinecap="round" strokeDasharray={`${cF * Cc} ${Cc}`} strokeDashoffset={0} />
          <circle cx="75" cy="75" r={r} fill="none" stroke={C.blue} strokeWidth="16" strokeLinecap="round" strokeDasharray={`${pF * Cc} ${Cc}`} strokeDashoffset={-cF * Cc} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums">{fmtTokens(total)}</span>
          <span className="text-[11px]" style={{ color: C.muted }}>tokens</span>
        </div>
      </div>
      <div className="flex gap-5 mt-4">
        <Legend color={C.blue} label="Prompt" value={`${Math.round(pF * 100)}%`} />
        <Legend color={C.blueL} label="Completion" value={`${Math.round(cF * 100)}%`} />
      </div>
    </div>
  );
}
function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      <div className="leading-tight"><div className="text-sm font-semibold tabular-nums">{value}</div><div className="text-[11px]" style={{ color: C.muted }}>{label}</div></div>
    </div>
  );
}

function Segmented({ options, value, onChange }: { options: { v: string; l: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-[10px] p-0.5" style={{ background: "var(--c-track)" }}>
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} className="px-2.5 h-7 rounded-lg text-xs font-medium transition-colors"
          style={value === o.v ? { background: "#fff", color: C.blue, boxShadow: "0 1px 2px rgba(0,0,0,0.1)" } : { color: C.muted }}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

function LineChart({ points, metric, periodo, loading }: {
  points: { key: string; tokens: number; costo: number }[]; metric: "tokens" | "usd"; periodo: Periodo; loading: boolean;
}) {
  if (loading) return <div className="h-52 flex items-center justify-center text-sm" style={{ color: C.muted }}>Cargando…</div>;
  if (!points.length) return <div className="h-52 flex items-center justify-center text-sm" style={{ color: C.muted }}>Sin consumo registrado todavía.</div>;
  const val = (p: { tokens: number; costo: number }) => (metric === "usd" ? p.costo : p.tokens);
  const vals = points.map(val);
  const max = Math.max(1, ...vals);
  const n = points.length;
  const xOf = (i: number) => (n === 1 ? 50 : 4 + (i / (n - 1)) * 92);
  const yOf = (v: number) => 8 + (1 - v / max) * 84;
  const lp = points.map((p, i) => `${xOf(i)},${yOf(val(p))}`).join(" ");
  const area = `${xOf(0)},100 ${lp} ${xOf(n - 1)},100`;
  const last = vals[n - 1];
  const prev = n > 1 ? vals[n - 2] : null;
  const delta = prev != null && prev > 0 ? ((last - prev) / prev) * 100 : null;
  const fmtV = (v: number) => (metric === "usd" ? fmtUsd(v) : fmt(v));
  const step = Math.ceil(n / 8);
  return (
    <div>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-2xl font-semibold tabular-nums">{fmtV(last)}</span>
        {delta != null && (
          <span className="text-xs font-semibold flex items-center gap-0.5" style={{ color: delta >= 0 ? "#16A34A" : "#EA580C" }}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%
          </span>
        )}
        <span className="text-xs" style={{ color: C.faint }}>último {periodo === "dia" ? "día" : periodo}</span>
      </div>
      <div className="relative w-full" style={{ height: 176 }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id="lgrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.blue} stopOpacity="0.22" />
              <stop offset="100%" stopColor={C.blue} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#lgrad)" />
          <polyline points={lp} fill="none" stroke={C.blue} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        {points.map((p, i) => (
          <div key={p.key} className="absolute rounded-full" title={`${bucketLabel(p.key, periodo)}: ${fmtV(val(p))}`}
            style={{ left: `${xOf(i)}%`, top: `${yOf(val(p))}%`, transform: "translate(-50%,-50%)", width: 8, height: 8, background: "#fff", border: `2px solid ${C.blue}` }} />
        ))}
      </div>
      <div className="relative h-4 mt-1">
        {points.map((p, i) => (
          (n <= 8 || i % step === 0 || i === n - 1) && (
            <span key={p.key} className="absolute text-[10px] whitespace-nowrap" style={{ left: `${xOf(i)}%`, transform: "translateX(-50%)", color: C.faint }}>
              {bucketLabel(p.key, periodo)}
            </span>
          )
        ))}
      </div>
    </div>
  );
}

// ─── Crear bot (modal controlado, con desplegable de tenant) ─────────────────
const NUEVO_TENANT = "__new__";
function CrearBotModal({ open, onClose, onCreated, show, tenants, tenantPrefill }: {
  open: boolean; onClose: () => void; onCreated: () => void; show: (m: string, err?: boolean) => void;
  tenants: string[]; tenantPrefill: string;
}) {
  const [saving, setSaving] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tenantSel, setTenantSel] = useState("");
  const [nuevoTenant, setNuevoTenant] = useState("");
  const [ambiente, setAmbiente] = useState("");
  const [rol, setRol] = useState("");
  const [idioma, setIdioma] = useState("es");
  const [plantilla, setPlantilla] = useState(false); // crear desde plantilla pre-armada

  // al abrir: prellenar tenant y limpiar el resto
  useEffect(() => {
    if (open) {
      setTenantSel(tenantPrefill && tenants.includes(tenantPrefill) ? tenantPrefill : (tenants.length ? "" : NUEVO_TENANT));
      setNuevoTenant(""); setNombre(""); setAmbiente(""); setRol(""); setIdioma("es"); setPlantilla(false);
    }
  }, [open, tenantPrefill, tenants]);

  const esNuevo = tenantSel === NUEVO_TENANT;
  const tenantFinal = (esNuevo ? nuevoTenant : tenantSel).trim();

  async function crear() {
    setSaving(true);
    try {
      if (plantilla) {
        // Agente pre-armado (etapas, orquestador, guardrails, variables, follow-ups)
        const r = (await api("/api/plantilla", "POST", { universidad: tenantFinal, nombre: nombre.trim() })) as { id: string };
        window.location.href = `/agent/${r.id}/summary`;
        return;
      }
      await api("/api/agentes", "POST", { nombre: nombre.trim(), tenant: tenantFinal, ambiente: ambiente.trim() || tenantFinal, rol: rol.trim() || undefined, idioma });
      show("Bot creado"); onClose(); onCreated();
    } catch (e) { show((e as Error).message, true); setSaving(false); }
  }

  if (!open) return null;
  const inp = "w-full h-10 rounded-[10px] px-3 text-sm outline-none focus:border-[#1946E3]";
  const inpStyle = { background: "var(--c-card)", border: `1px solid ${C.border}`, color: C.text } as const;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-nods" style={{ background: "rgba(10,12,20,0.55)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl p-6 space-y-4" style={{ background: "var(--c-card)", border: `1px solid ${C.border}`, color: C.text, boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">Nuevo bot</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: C.muted }}><X className="w-4 h-4" /></button>
        </div>

        {/* Toggle: crear con plantilla */}
        <button type="button" onClick={() => setPlantilla((v) => !v)}
          className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors"
          style={{ border: `1px solid ${plantilla ? C.blue : C.border}`, background: plantilla ? C.blueSoft : "transparent" }}>
          <GraduationCap className="w-5 h-5 flex-shrink-0" style={{ color: C.blue }} />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium">Crear con plantilla</span>
            <span className="block text-[11px]" style={{ color: C.muted }}>Etapas, orquestador, guardrails, variables y follow-ups ya armados.</span>
          </span>
          <Switch on={plantilla} />
        </button>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldN label="Nombre del bot"><input className={inp} style={inpStyle} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Guadalupe" /></FieldN>
          <FieldN label="Universidad (tenant)">
            <select className={inp} style={inpStyle} value={tenantSel} onChange={(e) => setTenantSel(e.target.value)}>
              <option value="" disabled>Elegí una…</option>
              {tenants.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value={NUEVO_TENANT}>＋ Nueva universidad…</option>
            </select>
          </FieldN>
          {esNuevo && (
            <FieldN label="Nombre de la universidad"><input className={inp} style={inpStyle} value={nuevoTenant} onChange={(e) => setNuevoTenant(e.target.value)} placeholder="Ej: Anáhuac" /></FieldN>
          )}
          {!plantilla && (
            <>
              <FieldN label="Ambiente (opcional)"><input className={inp} style={inpStyle} value={ambiente} onChange={(e) => setAmbiente(e.target.value)} placeholder="por defecto = universidad" /></FieldN>
              <FieldN label="Idioma">
                <select className={inp} style={inpStyle} value={idioma} onChange={(e) => setIdioma(e.target.value)}>
                  {IDIOMAS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </FieldN>
            </>
          )}
        </div>
        {!plantilla && (
          <FieldN label="Rol (opcional)"><textarea className={inp + " h-20 py-2 resize-none"} style={inpStyle} value={rol} onChange={(e) => setRol(e.target.value)} /></FieldN>
        )}
        {plantilla && (
          <p className="text-[11px]" style={{ color: C.muted }}>
            Se crea el agente completo desde plantilla. Cursos y Bases de Conocimiento quedan vacíos (cargalos con los datos del cliente).
          </p>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="px-4 h-10 rounded-[10px] text-sm font-medium" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
          <button onClick={crear} disabled={saving || !nombre.trim() || !tenantFinal} className="px-4 h-10 rounded-[10px] text-sm font-semibold text-white disabled:opacity-40" style={{ background: C.blue }}>
            {saving ? "Creando…" : plantilla ? "Crear desde plantilla" : "Crear bot"}
          </button>
        </div>
      </div>
    </div>
  );
}
function FieldN({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.muted }}>{label}</span>{children}</label>;
}

function Avatar({ image, inicial, size }: { image?: string | null; inicial: string; size: number }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" width={size} height={size} referrerPolicy="no-referrer"
        className="rounded-full object-cover" style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center text-white font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(135deg, ${C.blue}, #0F2FA0)` }}>
      {inicial}
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span className="relative inline-block w-9 h-5 rounded-full transition-colors flex-shrink-0" style={{ background: on ? C.blue : "var(--c-track)" }}>
      <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform" style={{ transform: on ? "translateX(16px)" : "none" }} />
    </span>
  );
}

function UsuarioMenu() {
  const { data: session } = useSession();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const u = session?.user;
  if (!u) return null;
  const nombre = u.name || u.email || "Usuario";
  const inicial = (nombre.trim()[0] || "U").toUpperCase();
  return (
    <div className="relative flex-shrink-0">
      <button onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-10 pl-1 pr-2 sm:pr-3 rounded-full transition-all"
        style={{ background: C.card, border: `1px solid ${open ? "rgba(25,70,227,0.4)" : C.border}`, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(25,70,227,0.4)")}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = C.border; }}>
        <Avatar image={u.image} inicial={inicial} size={30} />
        <span className="text-sm font-medium max-w-[160px] truncate hidden sm:block">{nombre}</span>
        <ChevronDown className="w-4 h-4 transition-transform" style={{ color: C.faint, transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-64 rounded-2xl z-50 overflow-hidden"
            style={{ background: C.card, border: `1px solid ${C.border}`, boxShadow: "0 16px 40px rgba(14,21,38,0.14)" }}>
            <div className="p-4 flex items-center gap-3" style={{ borderBottom: `1px solid ${C.border}` }}>
              <Avatar image={u.image} inicial={inicial} size={44} />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{nombre}</div>
                <div className="text-xs truncate" style={{ color: C.muted }}>{u.email}</div>
              </div>
            </div>
            {/* Modo oscuro */}
            <button onClick={toggle}
              className="w-full flex items-center justify-between gap-2.5 px-4 py-3 text-sm font-medium transition-colors"
              style={{ color: C.text }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <span className="flex items-center gap-2.5">
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />} Modo oscuro
              </span>
              <Switch on={theme === "dark"} />
            </button>
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              <button onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium transition-colors"
                style={{ color: "#DC2626" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(220,38,38,0.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <LogOut className="w-4 h-4" /> Cerrar sesión
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
