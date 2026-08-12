"use client";

import { use, useState, useEffect, useCallback } from "react";
import { Sparkles, Search, Check, FlaskConical, X, AlertTriangle, Repeat, History, ChevronDown, ChevronUp } from "lucide-react";
import { Field, useToast, api } from "@/lib/ui";

type Propuesta = {
  caso_id?: string | null;
  diagnostico?: string;
  causa?: string;
  es_patron?: boolean;
  frecuencia?: number;
  etapa_id?: string | null;
  etapa_nombre?: string;
  campo?: string;
  accion?: string;
  texto_actual?: string;
  texto_propuesto?: string;
  justificacion?: string;
  conclusion?: string;
  riesgo?: string;
  error?: string;
  raw?: string;
};
type Caso = Propuesta & { id: string; telefono?: string; creado_en?: string };
type Casos = {
  pendientes: Caso[];
  patrones: { causa: { causa: string; n: number; pendientes: number }[]; etapa: { etapa_nombre: string; n: number }[] };
  resumen: { total: number; pendientes: number; aplicados: number };
};
type AuditEntry = {
  id: string; telefono?: string; feedback?: string; diagnostico?: string; causa?: string;
  etapa_nombre?: string; campo?: string; accion?: string;
  texto_antes?: string; texto_propuesto?: string; justificacion?: string; riesgo?: string;
  estado: string; creado_en?: string;
  aplicado_en?: string; aplicado_por?: string;
  descartado_en?: string; descartado_por?: string;
};

const inputCls = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const taCls = "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-vertical";
const riesgoCls: Record<string, string> = { bajo: "bg-success/15 text-success", medio: "bg-warning/15 text-warning", alto: "bg-destructive/15 text-destructive" };

export default function PulidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();

  const [telefono, setTelefono] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [prop, setProp] = useState<Propuesta | null>(null);
  const [propuesto, setPropuesto] = useState("");
  const [casos, setCasos] = useState<Casos | null>(null);
  const [historial, setHistorial] = useState<AuditEntry[]>([]);
  const [showHistorial, setShowHistorial] = useState(false);

  const loadCasos = useCallback(async () => {
    try { setCasos((await api(`/api/pulido/casos?agente_id=${id}`, "GET")) as Casos); } catch { /* noop */ }
  }, [id]);
  const loadHistorial = useCallback(async () => {
    try {
      const r = (await api(`/api/pulido/historial?agente_id=${id}`, "GET")) as { historial: AuditEntry[] };
      setHistorial(r.historial || []);
    } catch { /* noop */ }
  }, [id]);
  useEffect(() => { loadCasos(); loadHistorial(); }, [loadCasos, loadHistorial]);

  // Prefill desde Insights (link "Corregir" en una conversación floja).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("telefono"); const f = sp.get("feedback");
    if (t) setTelefono(t);
    if (f) setFeedback(f);
  }, []);

  async function analizar() {
    if (!telefono.trim() || !feedback.trim()) { show("Poné teléfono y feedback", true); return; }
    setLoading(true); setProp(null);
    try {
      const r = (await api("/api/pulido", "POST", { agente_id: id, telefono: telefono.trim(), feedback: feedback.trim() })) as Propuesta;
      setProp(r); setPropuesto(r.texto_propuesto || "");
      loadCasos();
    } catch (e) { show((e as Error).message, true); } finally { setLoading(false); }
  }

  async function aplicar(c: Propuesta, texto: string) {
    if (!confirm("¿Aplicar este cambio a la configuración del agente?")) return;
    try {
      const r = (await api("/api/pulido/aplicar", "POST", {
        agente_id: id, caso_id: c.caso_id || (c as Caso).id, etapa_id: c.etapa_id, campo: c.campo,
        accion: c.accion, texto_actual: c.texto_actual, texto_propuesto: texto,
      })) as { ok?: boolean; aplicado?: string; error?: string };
      if (r.ok) { show("Aplicado: " + (r.aplicado || "")); setProp(null); loadCasos(); loadHistorial(); }
      else show(r.error || "No se pudo aplicar", true);
    } catch (e) { show((e as Error).message, true); }
  }

  async function descartar(casoId: string) {
    try { await api("/api/pulido/descartar", "POST", { caso_id: casoId }); loadCasos(); loadHistorial(); } catch (e) { show((e as Error).message, true); }
  }

  return (
    <>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Pulido IA</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pegá el feedback de calidad. La IA (modelo de razonamiento) analiza la conversación + los prompts + la
            memoria de casos previos, diagnostica, detecta patrones recurrentes y propone un ajuste. Queda pendiente para que lo revisés y apliques.
          </p>
        </div>
      </div>

      {/* Resumen + patrones */}
      {casos && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card rounded-xl border border-border p-5 shadow-card">
            <div className="text-xs font-semibold text-muted-foreground mb-2">MEMORIA</div>
            <div className="flex gap-4 text-sm">
              <span><b className="text-2xl">{casos.resumen?.pendientes ?? 0}</b> pendientes</span>
              <span className="text-muted-foreground"><b>{casos.resumen?.aplicados ?? 0}</b> aplicados</span>
              <span className="text-muted-foreground"><b>{casos.resumen?.total ?? 0}</b> total</span>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 shadow-card">
            <div className="text-xs font-semibold text-muted-foreground mb-2">PATRONES (lo que más nos afecta)</div>
            <div className="flex flex-wrap gap-2">
              {(casos.patrones?.causa || []).map((p) => (
                <span key={p.causa} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                  {p.n > 2 && <Repeat className="w-3 h-3" />} {p.causa}: {p.n}
                </span>
              ))}
              {(!casos.patrones?.causa || casos.patrones.causa.length === 0) && <span className="text-xs text-muted-foreground">Sin datos aún</span>}
            </div>
          </div>
        </div>
      )}

      {/* Formulario */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-4">
        <Field label="Teléfono del lead" hint="Número de la conversación (contactId de Botmaker)">
          <input className={inputCls} value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="549..." />
        </Field>
        <Field label="Feedback del analista" hint="Ej: 'muy agresivo', 'no respondió', 'tiró la inscripción de una', 'poco consultivo'">
          <textarea className={taCls} style={{ minHeight: 80 }} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        </Field>
        <button onClick={analizar} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
          <Search className={`w-4 h-4 ${loading ? "animate-pulse" : ""}`} />
          {loading ? "Razonando (conversación + prompts + memoria)..." : "Analizar y proponer fix"}
        </button>
      </div>

      {/* Propuesta recién generada (editable) */}
      {prop && !prop.error && (
        <PropuestaCard p={prop} texto={propuesto} setTexto={setPropuesto} onAplicar={() => aplicar(prop, propuesto)} onDescartar={prop.caso_id ? () => { descartar(prop.caso_id!); setProp(null); } : undefined} id={id} editable />
      )}
      {prop?.error && <div className="bg-card rounded-xl border border-destructive/30 p-6 text-sm text-destructive">Error: {prop.error}</div>}

      {/* Cola de pendientes (memoria) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning" /> Casos pendientes de fixear ({casos?.pendientes?.length ?? 0})
        </h2>
        {(casos?.pendientes || []).length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-8 text-center text-sm text-muted-foreground shadow-card">Sin pendientes. Todo al día 🎉</div>
        ) : (
          casos!.pendientes.map((c) => (
            <PropuestaCard key={c.id} p={{ ...c, caso_id: c.id }} texto={c.texto_propuesto || ""} onAplicar={() => aplicar({ ...c, caso_id: c.id }, c.texto_propuesto || "")} onDescartar={() => descartar(c.id)} id={id} />
          ))
        )}
      </div>

      {/* Historial / Auditoría */}
      <div className="space-y-3">
        <button
          onClick={() => setShowHistorial(v => !v)}
          className="flex items-center gap-2 text-lg font-semibold text-foreground w-full text-left"
        >
          <History className="w-5 h-5 text-muted-foreground" />
          Historial de auditoría ({historial.length})
          {showHistorial ? <ChevronUp className="w-4 h-4 ml-auto text-muted-foreground" /> : <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground" />}
        </button>
        {showHistorial && (
          historial.length === 0
            ? <div className="bg-card rounded-xl border border-border p-8 text-center text-sm text-muted-foreground shadow-card">Sin cambios registrados todavía.</div>
            : <div className="space-y-2">
                {historial.map(h => <AuditCard key={h.id} h={h} />)}
              </div>
        )}
      </div>

      {node}
    </>
  );
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function AuditCard({ h }: { h: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const ts = h.estado === "aplicado" ? h.aplicado_en : h.descartado_en;
  const por = h.estado === "aplicado" ? h.aplicado_por : h.descartado_por;
  const estadoCls = h.estado === "aplicado"
    ? "bg-success/15 text-success"
    : "bg-muted text-muted-foreground";
  return (
    <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-muted/40 transition-colors">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${estadoCls}`}>{h.estado}</span>
        <span className="text-xs text-muted-foreground">{fmtDate(ts)}</span>
        {por && <span className="text-xs text-muted-foreground truncate max-w-[180px]">{por}</span>}
        <span className="text-xs font-medium text-foreground ml-auto">{h.etapa_nombre ? `${h.etapa_nombre} · ` : ""}{h.campo}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-4 space-y-3 border-t border-border pt-3">
          {h.causa && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">{h.causa}</span>}
          {h.diagnostico && <p className="text-xs text-muted-foreground"><b>Diagnóstico: </b>{h.diagnostico}</p>}
          {h.texto_antes != null && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">ANTES</div>
              <pre className="text-xs bg-destructive/5 border border-destructive/20 rounded-md p-3 whitespace-pre-wrap max-h-40 overflow-auto">{h.texto_antes || "(vacío)"}</pre>
            </div>
          )}
          {h.estado === "aplicado" && h.texto_propuesto && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">DESPUÉS</div>
              <pre className="text-xs bg-success/5 border border-success/20 rounded-md p-3 whitespace-pre-wrap max-h-40 overflow-auto">{h.texto_propuesto}</pre>
            </div>
          )}
          {h.justificacion && <p className="text-xs text-muted-foreground"><b>Justificación: </b>{h.justificacion}</p>}
          <p className="text-xs text-muted-foreground">Feedback original: {h.telefono && <span className="font-medium">{h.telefono} · </span>}{h.feedback || "—"}</p>
        </div>
      )}
    </div>
  );
}

function PropuestaCard({ p, texto, setTexto, onAplicar, onDescartar, id, editable }: {
  p: Propuesta; texto: string; setTexto?: (v: string) => void; onAplicar: () => void; onDescartar?: () => void; id: string; editable?: boolean;
}) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2 flex-wrap">
        {p.causa && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">{p.causa}</span>}
        {p.es_patron && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning"><Repeat className="w-3 h-3" /> patrón x{p.frecuencia}</span>}
        {p.riesgo && <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${riesgoCls[p.riesgo] || "bg-muted text-muted-foreground"}`}>riesgo {p.riesgo}</span>}
        {p.etapa_nombre && <span className="text-xs text-muted-foreground ml-auto">{p.etapa_nombre} · {p.campo}/{p.accion}</span>}
      </div>
      <div className="p-5 space-y-3">
        {p.diagnostico && <p className="text-sm text-foreground whitespace-pre-wrap"><b className="text-muted-foreground text-xs">DIAGNÓSTICO: </b>{p.diagnostico}</p>}
        {p.accion === "replace" && p.texto_actual && (
          <pre className="text-xs bg-destructive/5 border border-destructive/20 rounded-md p-3 whitespace-pre-wrap">- {p.texto_actual}</pre>
        )}
        {editable && setTexto ? (
          <textarea className={taCls} style={{ minHeight: 100 }} value={texto} onChange={(e) => setTexto(e.target.value)} />
        ) : (
          <pre className="text-xs bg-success/5 border border-success/20 rounded-md p-3 whitespace-pre-wrap">+ {texto}</pre>
        )}
        {p.conclusion && <p className="text-xs text-muted-foreground"><b>Conclusión: </b>{p.conclusion}</p>}
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <button onClick={onAplicar} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90">
            <Check className="w-4 h-4" /> Aplicar
          </button>
          {onDescartar && (
            <button onClick={onDescartar} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-background text-sm font-medium text-foreground hover:bg-muted">
              <X className="w-4 h-4" /> Descartar
            </button>
          )}
          <a href={`/agent/${id}/preview`} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-background text-sm font-medium text-foreground hover:bg-muted ml-auto">
            <FlaskConical className="w-4 h-4" /> Re-testear
          </a>
        </div>
      </div>
    </div>
  );
}
