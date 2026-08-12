"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp, Sparkles, MessageSquare, Users, ArrowRightLeft, ShieldAlert,
  RefreshCw, Filter, Gauge, ClipboardCheck, History, Wrench, FileText,
} from "lucide-react";
import { useToast, api } from "@/lib/ui";

type Kpis = { leads_total: number; leads_7d: number; transbordados: number; mensajes_7d: number; bloqueados_7d: number };
type SerieRow = { dia: string; mensajes: number };
type RawRow = { direccion: string; tipo: string; c: number };
type CohortRow = { orden: number; nombre: string; calificacion: string | null; alcanzaron: number };
type DimItem = { valor: string; n: number };
type Floja = { conversacion_id: string; telefono: string; total: number; veredicto: string; fallas: string[] | string; creado_en: string };
type CalResumen = { n: number; promedio: number | null; m: number; et: number; na: number; ve: number; co: number };
type RunLite = { id: string; origen: string; dialogos_analizados: number; resumen: string; generado_en: string; n_temas: number; n_objeciones: number };
type Analisis = {
  id?: string; resumen?: string;
  temas?: { tema: string; frecuencia: string; ejemplo: string }[];
  temas_frecuentes?: { tema: string; frecuencia: string; ejemplo: string }[];
  objeciones?: { objecion: string; ejemplo: string; sugerencia: string }[];
  huecos_kb?: { pregunta: string; motivo: string }[];
  recomendaciones?: string[];
  dialogos_analizados?: number; generado_en?: string; error?: string;
};

export default function InsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();

  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [serie, setSerie] = useState<SerieRow[]>([]);
  const [raw, setRaw] = useState<RawRow[]>([]);
  const [cohort, setCohort] = useState<CohortRow[]>([]);
  const [dims, setDims] = useState<Record<string, DimItem[]>>({});
  const [calResumen, setCalResumen] = useState<CalResumen | null>(null);
  const [flojas, setFlojas] = useState<Floja[]>([]);
  const [runs, setRuns] = useState<RunLite[]>([]);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [evaluando, setEvaluando] = useState(false);
  const [filtro, setFiltro] = useState<{ dim: string; val: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = filtro ? `?dim=${encodeURIComponent(filtro.dim)}&val=${encodeURIComponent(filtro.val)}` : "";
      const d = await api(`/api/agentes/${id}/insights${qs}`, "GET");
      setKpis(d.kpis);
      setSerie(d.serie || []);
      setRaw(d.raw || []);
      setCohort(d.cohort || []);
      setDims(d.dims || {});
      setCalResumen(d.calidad?.resumen || null);
      setFlojas(d.calidad?.flojas || []);
      setRuns(d.runs || []);
      // Muestra el último análisis persistido sin volver a gastar saldo.
      if (d.ultimoRun && !analisis) {
        setAnalisis({
          resumen: d.ultimoRun.resumen, temas: d.ultimoRun.temas, objeciones: d.ultimoRun.objeciones,
          huecos_kb: d.ultimoRun.huecos_kb, recomendaciones: d.ultimoRun.recomendaciones,
          dialogos_analizados: d.ultimoRun.dialogos_analizados, generado_en: d.ultimoRun.generado_en,
        });
      }
    } catch (e) {
      show((e as Error).message, true);
    }
  }, [id, show, filtro, analisis]);

  useEffect(() => { load(); }, [load]);

  async function analizar() {
    setAnalizando(true);
    try {
      const d = await api("/api/insights/analizar", "POST", { agente_id: id });
      if (d.error) throw new Error(d.error);
      setAnalisis({ ...d, temas: d.temas_frecuentes });
      show("Análisis generado y guardado en el historial.");
      load();
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setAnalizando(false);
    }
  }

  async function evaluar() {
    setEvaluando(true);
    try {
      const d = await api("/api/insights/evaluar", "POST", {});
      if (d.error) throw new Error(d.error);
      show(d.mensaje || "Evaluación en curso.");
      setTimeout(load, 45000);
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setEvaluando(false);
    }
  }

  async function verRun(runId: string) {
    try {
      const d = await api(`/api/agentes/${id}/insights/runs?run=${runId}`, "GET");
      if (d && !d.error) setAnalisis({ ...d, temas: d.temas });
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  const maxSerie = Math.max(1, ...serie.map((s) => s.mensajes));
  const cohortBase = cohort.length ? cohort[0].alcanzaron : 0;
  const pctTransbordo = kpis && kpis.leads_total > 0 ? Math.round((kpis.transbordados / kpis.leads_total) * 100) : 0;
  const temas = analisis?.temas || analisis?.temas_frecuentes || [];
  const dimLabels: Record<string, string> = {
    area_interes: "Área de interés", carrera_interes: "Carrera", formato_producto: "Formato",
    sede: "Sede", programa_interes: "Programa",
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Insights</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Inteligencia de negocio sobre las conversaciones reales: dónde se cae el lead, qué piden,
              qué objeciones aparecen y qué tan bien responde el agente.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/agent/${id}/informe`}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <FileText className="w-4 h-4" />
            Informe mensual
          </Link>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={<Users className="w-4 h-4" />} label="Leads totales" value={kpis?.leads_total ?? "…"} sub={`${kpis?.leads_7d ?? 0} activos últimos 7d`} />
        <Kpi icon={<MessageSquare className="w-4 h-4" />} label="Mensajes (7d)" value={kpis?.mensajes_7d ?? "…"} sub={`${kpis?.bloqueados_7d ?? 0} bloqueados por guardrail`} />
        <Kpi icon={<ArrowRightLeft className="w-4 h-4" />} label="Transbordados" value={kpis?.transbordados ?? "…"} sub={`${pctTransbordo}% del total`} />
        <Kpi icon={<Gauge className="w-4 h-4" />} label="Calidad (30d)" value={calResumen?.promedio != null ? `${calResumen.promedio}/50` : "—"} sub={`${calResumen?.n ?? 0} conversaciones auditadas`} />
      </div>

      {/* Embudo de conversión (cohort) */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h2 className="font-semibold text-base">Embudo de conversión</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              De todas las conversaciones, cuántas <b>alcanzaron</b> cada etapa. Dónde se enfría el lead.
              {filtro && <span className="ml-1 text-primary">· filtrado por {dimLabels[filtro.dim] || filtro.dim}: “{filtro.val}”</span>}
            </p>
          </div>
          {filtro && (
            <button onClick={() => setFiltro(null)} className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted flex items-center gap-1">
              <Filter className="w-3 h-3" /> Quitar filtro
            </button>
          )}
        </div>
        <div className="space-y-3 mt-4">
          {cohort.map((f, i) => {
            const pct = cohortBase > 0 ? Math.round((f.alcanzaron / cohortBase) * 100) : 0;
            const prev = i > 0 ? cohort[i - 1].alcanzaron : f.alcanzaron;
            const caida = prev > 0 ? Math.round(((prev - f.alcanzaron) / prev) * 100) : 0;
            return (
              <div key={f.orden}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="truncate max-w-[60%] flex items-center gap-2">
                    {f.orden}. {f.nombre}
                    {f.calificacion && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold uppercase">{f.calificacion}</span>}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {i > 0 && caida > 0 && <span className="text-destructive mr-2">−{caida}%</span>}
                    <b className="text-foreground">{f.alcanzaron}</b> <span className="text-xs">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(2, pct)}%` }} />
                </div>
              </div>
            );
          })}
          {cohort.length === 0 && <p className="text-sm text-muted-foreground">Sin datos de recorrido todavía.</p>}
        </div>
      </div>

      {/* Demanda por variable + Mensajes por día */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-6 shadow-card">
          <h2 className="font-semibold text-base mb-1">Demanda real</h2>
          <p className="text-xs text-muted-foreground mb-4">Qué piden los leads, contado de sus fichas. Clic para filtrar el embudo.</p>
          <div className="space-y-4">
            {Object.entries(dims).length === 0 && <p className="text-sm text-muted-foreground">Sin datos de ficha todavía.</p>}
            {Object.entries(dims).map(([clave, items]) => (
              <div key={clave}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{dimLabels[clave] || clave}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {items.slice(0, 8).map((it) => {
                    const activo = filtro?.dim === clave && filtro?.val === it.valor;
                    return (
                      <button
                        key={it.valor}
                        onClick={() => setFiltro(activo ? null : { dim: clave, val: it.valor })}
                        className={`text-xs px-2 py-1 rounded-md border transition-colors ${activo ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                      >
                        {it.valor} <span className={activo ? "opacity-80" : "text-muted-foreground"}>· {it.n}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-card">
          <h2 className="font-semibold text-base mb-1">Mensajes por día</h2>
          <p className="text-xs text-muted-foreground mb-4">Volumen de interacciones de los últimos 14 días.</p>
          {serie.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos todavía.</p>
          ) : (
            <div className="flex items-end gap-1.5 h-36">
              {serie.map((s) => (
                <div key={s.dia} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${s.dia}: ${s.mensajes}`}>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{s.mensajes}</span>
                  <div className="w-full rounded-t bg-primary/70" style={{ height: `${Math.max(4, (s.mensajes / maxSerie) * 100)}%` }} />
                  <span className="text-[9px] text-muted-foreground truncate">{s.dia}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Calidad · Juez IA */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <ClipboardCheck className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Calidad · Juez IA</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Un juez IA puntúa cada conversación (memoria, etapas, naturalidad, ventas, corrección).
                Las flojas se corrigen en Pulido IA.
              </p>
            </div>
          </div>
          <button
            onClick={evaluar}
            disabled={evaluando}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border bg-background text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-60"
          >
            <ClipboardCheck className="w-4 h-4" />
            {evaluando ? "Evaluando…" : "Evaluar ahora"}
          </button>
        </div>

        {calResumen && calResumen.n > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <DimScore label="Promedio" val={calResumen.promedio} max={50} destacado />
            <DimScore label="Memoria" val={calResumen.m} />
            <DimScore label="Etapas" val={calResumen.et} />
            <DimScore label="Natural." val={calResumen.na} />
            <DimScore label="Ventas" val={calResumen.ve} />
            <DimScore label="Correcc." val={calResumen.co} />
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold mb-2">Conversaciones flojas</h3>
          {flojas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {calResumen && calResumen.n > 0 ? "Ninguna floja en la última auditoría. 👌" : "Todavía no se auditó ninguna conversación. Tocá “Evaluar ahora”."}
            </p>
          ) : (
            <div className="space-y-2">
              {flojas.map((f) => {
                const fallas = Array.isArray(f.fallas) ? f.fallas : (() => { try { return JSON.parse(f.fallas as string); } catch { return []; } })();
                const feedback = `El juez IA marcó esta conversación floja (${f.total}/50). ${f.veredicto} Fallas: ${fallas.join(" | ")}`;
                return (
                  <div key={f.conversacion_id + f.creado_en} className="border border-border rounded-lg p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold tabular-nums px-1.5 py-0.5 rounded ${f.total < 25 ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning"}`}>{f.total}/50</span>
                        <span className="text-sm font-medium truncate">{f.telefono}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{f.veredicto}</p>
                      {fallas.length > 0 && <p className="text-[11px] text-destructive/80 mt-1 truncate">✗ {fallas[0]}</p>}
                    </div>
                    <Link
                      href={`/agent/${id}/pulido?telefono=${encodeURIComponent(f.telefono)}&feedback=${encodeURIComponent(feedback)}`}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
                    >
                      <Wrench className="w-3.5 h-3.5" /> Corregir
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Análisis IA */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Análisis con IA</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Un modelo lee los diálogos reales y extrae temas, objeciones, huecos de conocimiento y
                recomendaciones. Cada corrida queda guardada en el historial.
              </p>
            </div>
          </div>
          <button
            onClick={analizar}
            disabled={analizando}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            <Sparkles className="w-4 h-4" />
            {analizando ? "Analizando…" : "Generar análisis"}
          </button>
        </div>

        {/* Historial */}
        {runs.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap border-b border-border pb-3">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><History className="w-3.5 h-3.5" /> Historial:</span>
            {runs.map((r) => (
              <button
                key={r.id}
                onClick={() => verRun(r.id)}
                className={`text-xs px-2 py-1 rounded-md border transition-colors ${analisis?.id === r.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                title={`${r.dialogos_analizados} diálogos · ${r.n_temas} temas · ${r.n_objeciones} objeciones`}
              >
                {new Date(r.generado_en).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}
                {r.origen === "schedule" && <span className="ml-1 opacity-70">auto</span>}
              </button>
            ))}
          </div>
        )}

        {analizando && (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground animate-pulse">
            Razonando sobre los diálogos… esto puede tardar un minuto.
          </div>
        )}

        {analisis && !analisis.error && (
          <div className="space-y-5">
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 text-sm">
              {analisis.resumen}
              <div className="text-xs text-muted-foreground mt-1.5">
                {analisis.dialogos_analizados} diálogos analizados
                {analisis.generado_en && <> · {new Date(analisis.generado_en).toLocaleString("es-AR")}</>}
              </div>
            </div>

            <Seccion titulo="🔥 Temas más frecuentes">
              {temas.map((t, i) => (
                <div key={i} className="border border-border rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{t.tema}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${t.frecuencia === "alta" ? "bg-destructive/10 text-destructive" : t.frecuencia === "media" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>
                      {t.frecuencia}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 italic">“{t.ejemplo}”</p>
                </div>
              ))}
            </Seccion>

            <Seccion titulo="🛡️ Objeciones detectadas">
              {(analisis.objeciones || []).map((o, i) => (
                <div key={i} className="border border-border rounded-lg p-3">
                  <span className="font-medium text-sm">{o.objecion}</span>
                  <p className="text-xs text-muted-foreground mt-1 italic">“{o.ejemplo}”</p>
                  <p className="text-xs mt-1.5"><span className="font-semibold text-primary">Sugerencia:</span> {o.sugerencia}</p>
                </div>
              ))}
            </Seccion>

            <Seccion titulo="🕳️ Huecos de conocimiento (KB)">
              {(analisis.huecos_kb || []).map((h, i) => (
                <div key={i} className="border border-border rounded-lg p-3">
                  <span className="font-medium text-sm">{h.pregunta}</span>
                  <p className="text-xs text-muted-foreground mt-1">{h.motivo}</p>
                </div>
              ))}
            </Seccion>

            <Seccion titulo="✅ Recomendaciones">
              {(analisis.recomendaciones || []).map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-primary font-bold mt-0.5">{i + 1}.</span>
                  <span>{r}</span>
                </div>
              ))}
            </Seccion>
          </div>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <ShieldAlert className="w-3 h-3" /> Eventos raw almacenados: {raw.reduce((a, r) => a + r.c, 0)} · webhook completo.
      </div>

      {node}
    </>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-card">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums mt-2">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function DimScore({ label, val, max = 10, destacado }: { label: string; val: number | null; max?: number; destacado?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 text-center ${destacado ? "border-primary/30 bg-primary/5" : "border-border"}`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold tabular-nums mt-0.5">{val ?? "—"}<span className="text-xs text-muted-foreground font-normal">/{max}</span></div>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{titulo}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
