"use client";

import { use, useEffect, useState, useCallback } from "react";
import {
  Filter,
  RefreshCw,
  Search,
  Users,
  Eye,
  X,
  Download,
  Table2,
  Columns3,
  Pin,
} from "lucide-react";
import { api, useToast } from "@/lib/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tipificacion = "interesado" | "potencial" | "responde" | "no_responde" | "no_contesta";

type EtapaInfo = {
  id: string;
  orden: number;
  nombre: string;
  calificacion: "ninguna" | "sal" | "sql";
};

type Lead = {
  telefono: string;
  nombre: string | null;
  etapa_id: string | null;
  etapa_nombre: string | null;
  etapa_orden: number | null;
  transbordado: boolean;
  pausado: boolean;
  ultima_actividad: string;
  ultima_respuesta: string | null;
  inicio: string | null;
  turnos: number;
  turnos_lead: number;
  calif_nivel: number;
  lead_estado: string | null;
  lead_notas: string | null;
  ficha: Record<string, unknown>;
  score: number;
  temperatura: "caliente" | "tibio" | "frio";
  tipificacion: Tipificacion;
  tip_manual: boolean;
  ficha_ok: number;
  ficha_total: number;
};

type FunnelData = {
  migrado: boolean;
  kpis: { total: number } & Record<Tipificacion, number>;
  etapas: EtapaInfo[];
  leads: Lead[];
};

type Evento = {
  tipo: string;
  calificacion: string | null;
  creado_en: string;
  etapa_desde: string | null;
  etapa_hasta: string | null;
};

// ─── Tipificaciones ──────────────────────────────────────────────────────────

const TIPS: Tipificacion[] = ["interesado", "potencial", "responde", "no_responde", "no_contesta"];

const TIP_LABEL: Record<Tipificacion, string> = {
  interesado: "Interesado",
  potencial: "Potencial",
  responde: "Responde WhatsApp",
  no_responde: "No responde WhatsApp",
  no_contesta: "No contesta",
};

const TIP_BADGE: Record<Tipificacion, string> = {
  interesado: "bg-success/15 text-success",
  potencial: "bg-primary/10 text-primary",
  responde: "bg-secondary text-foreground",
  no_responde: "bg-warning/15 text-warning",
  no_contesta: "bg-muted text-muted-foreground",
};

const TIP_DOT: Record<Tipificacion, string> = {
  interesado: "bg-success",
  potencial: "bg-primary",
  responde: "bg-foreground/50",
  no_responde: "bg-warning",
  no_contesta: "bg-muted-foreground/50",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtFecha(d: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// CSV con ; (Excel es-AR) y BOM. Incluye datos de contact center + toda la ficha.
function exportarCsv(leads: Lead[], nombreArchivo: string) {
  const fichaKeys = Array.from(new Set(leads.flatMap((l) => Object.keys(l.ficha ?? {})))).sort();
  const headers = [
    "telefono", "nombre", "tipificacion", "tipificacion_manual", "etapa", "calificacion",
    "temperatura", "score", "derivado_humano", "primer_contacto", "ultima_respuesta_lead",
    "ultima_actualizacion", "turnos", "respuestas_lead", "ficha_completa", "notas",
    ...fichaKeys.map((k) => `ficha_${k}`),
  ];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const filas = leads.map((l) =>
    [
      l.telefono,
      l.nombre ?? "",
      TIP_LABEL[l.tipificacion],
      l.tip_manual ? "SI" : "NO",
      l.etapa_nombre ?? "",
      l.calif_nivel >= 2 ? "SQL" : l.calif_nivel >= 1 ? "SAL" : "",
      l.temperatura,
      l.score,
      l.transbordado ? "SI" : "NO",
      fmtFecha(l.inicio),
      fmtFecha(l.ultima_respuesta),
      fmtFecha(l.ultima_actividad),
      l.turnos,
      l.turnos_lead,
      l.ficha_total > 0 ? `${l.ficha_ok}/${l.ficha_total}` : "",
      l.lead_notas ?? "",
      ...fichaKeys.map((k) => l.ficha?.[k] ?? ""),
    ]
      .map(esc)
      .join(";")
  );
  const csv = "﻿" + [headers.join(";"), ...filas].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FunnelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FunnelData | null>(null);
  const [vista, setVista] = useState<"tabla" | "kanban">("tabla");
  const [busqueda, setBusqueda] = useState("");
  const [fTip, setFTip] = useState("todas");
  const [fTemp, setFTemp] = useState("todas");
  const [fEtapa, setFEtapa] = useState("todas");
  const [detalle, setDetalle] = useState<Lead | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api(`/api/agentes/${id}/funnel`, "GET");
      setData(d as FunnelData);
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al cargar", true);
    } finally {
      setLoading(false);
    }
  }, [id, show]);

  useEffect(() => {
    load();
  }, [load]);

  const cambiarTip = useCallback(
    async (telefono: string, valor: string) => {
      try {
        await api(`/api/agentes/${id}/leads/${encodeURIComponent(telefono)}`, "PATCH", {
          lead_estado: valor === "auto" ? null : valor,
        });
        show(
          valor === "auto"
            ? "Tipificación en automático"
            : `Tipificado como ${TIP_LABEL[valor as Tipificacion] ?? valor}`
        );
        await load();
      } catch (e) {
        show(e instanceof Error ? e.message : "Error al actualizar", true);
      }
    },
    [id, show, load]
  );

  const leads = data?.leads ?? [];
  const filtrados = leads.filter((l) => {
    const q = busqueda.toLowerCase();
    const matchQ =
      !q || l.telefono.toLowerCase().includes(q) || (l.nombre ?? "").toLowerCase().includes(q);
    const matchTip = fTip === "todas" || l.tipificacion === fTip;
    const matchT = fTemp === "todas" || l.temperatura === fTemp;
    const matchEt = fEtapa === "todas" || l.etapa_id === fEtapa;
    return matchQ && matchTip && matchT && matchEt;
  });

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Filter className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Funnel de Leads</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tipificación automática de leads según respuesta, etapa y calificación. Podés pisarla a mano.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() =>
              exportarCsv(filtrados, `funnel_leads_${new Date().toISOString().slice(0, 10)}.csv`)
            }
            disabled={!filtrados.length}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      </div>

      {data && !data.migrado && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
          Falta correr la migración <code className="font-mono text-xs">db/17-funnel.sql</code>: el funnel
          funciona igual, pero la tipificación manual y las notas están deshabilitadas.
        </div>
      )}

      {/* ── KPIs por tipificación (clic = filtrar) ─────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <button
          onClick={() => setFTip("todas")}
          className={`bg-card rounded-xl border p-4 shadow-card flex items-center gap-3 text-left transition-colors ${fTip === "todas" ? "border-primary" : "border-border hover:bg-muted/40"}`}
        >
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">{data?.kpis.total ?? "—"}</div>
            <div className="text-[11px] text-muted-foreground">Total leads</div>
          </div>
        </button>
        {TIPS.map((t) => (
          <button
            key={t}
            onClick={() => setFTip(fTip === t ? "todas" : t)}
            className={`bg-card rounded-xl border p-4 shadow-card flex items-center gap-3 text-left transition-colors ${fTip === t ? "border-primary" : "border-border hover:bg-muted/40"}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${TIP_DOT[t]}`} />
            <div className="min-w-0">
              <div className="text-lg font-bold text-foreground">{data?.kpis[t] ?? "—"}</div>
              <div className="text-[11px] text-muted-foreground truncate">{TIP_LABEL[t]}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ── Filtros + toggle de vista ──────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-card">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex-1 min-w-48 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
            />
          </div>
          <select value={fTip} onChange={(e) => setFTip(e.target.value)} className="px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30">
            <option value="todas">Toda tipificación</option>
            {TIPS.map((t) => (
              <option key={t} value={t}>{TIP_LABEL[t]}</option>
            ))}
          </select>
          <select value={fTemp} onChange={(e) => setFTemp(e.target.value)} className="px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30">
            <option value="todas">Toda temperatura</option>
            <option value="caliente">🔥 Caliente</option>
            <option value="tibio">Tibio</option>
            <option value="frio">Frío</option>
          </select>
          <select value={fEtapa} onChange={(e) => setFEtapa(e.target.value)} className="px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30">
            <option value="todas">Todas las etapas</option>
            {(data?.etapas ?? []).map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setVista("tabla")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${vista === "tabla" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
            >
              <Table2 className="w-4 h-4" /> Tabla
            </button>
            <button
              onClick={() => setVista("kanban")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${vista === "kanban" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
            >
              <Columns3 className="w-4 h-4" /> Kanban
            </button>
          </div>
        </div>
      </div>

      {/* ── Vista ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="bg-card rounded-xl border border-border shadow-card flex items-center justify-center py-16 text-muted-foreground text-sm">
          Cargando…
        </div>
      ) : vista === "kanban" ? (
        <Kanban
          leads={filtrados}
          migrado={data?.migrado ?? false}
          onDrop={cambiarTip}
          onOpen={setDetalle}
        />
      ) : (
        <TablaLeads
          leads={filtrados}
          migrado={data?.migrado ?? false}
          onTip={cambiarTip}
          onOpen={setDetalle}
        />
      )}

      {detalle && (
        <LeadDrawer
          agenteId={id}
          lead={detalle}
          migrado={data?.migrado ?? false}
          onClose={() => setDetalle(null)}
          onSaved={load}
          onTip={cambiarTip}
          show={show}
        />
      )}

      {node}
    </>
  );
}

// ─── Badges ──────────────────────────────────────────────────────────────────

function TipBadge({ tip, manual }: { tip: Tipificacion; manual: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${TIP_BADGE[tip]}`}
      title={manual ? "Tipificación manual" : "Tipificación automática"}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${TIP_DOT[tip]}`} />
      {TIP_LABEL[tip]}
      {manual && <Pin className="w-3 h-3 opacity-70" />}
    </span>
  );
}

function TempBadge({ temp, score }: { temp: string; score: number }) {
  const style =
    temp === "caliente"
      ? "bg-destructive/10 text-destructive"
      : temp === "tibio"
      ? "bg-warning/15 text-warning"
      : "bg-muted text-muted-foreground";
  const label = temp === "caliente" ? "🔥 Caliente" : temp === "tibio" ? "Tibio" : "Frío";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${style}`}
      title={`Score ${score}/100: progreso de etapa (40) + ficha (30) + recencia (20) + turnos (10)`}
    >
      {label} <span className="tabular-nums opacity-70">{score}</span>
    </span>
  );
}

// ─── Tabla ───────────────────────────────────────────────────────────────────

function TablaLeads({
  leads,
  migrado,
  onTip,
  onOpen,
}: {
  leads: Lead[];
  migrado: boolean;
  onTip: (telefono: string, valor: string) => void;
  onOpen: (l: Lead) => void;
}) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h2 className="font-semibold text-sm text-foreground">
          Leads <span className="text-muted-foreground font-normal">({leads.length} encontrados)</span>
        </h2>
      </div>

      {leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
          <Filter className="w-8 h-8 opacity-30" />
          Sin leads que coincidan
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Contacto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Tipificación</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Etapa</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap hidden xl:table-cell">Temperatura</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Últ. respuesta</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap hidden 2xl:table-cell">Últ. actualización</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.telefono} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{l.telefono}</td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    <span className="block max-w-[140px] truncate" title={l.nombre ?? undefined}>{l.nombre ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={l.tip_manual ? l.tipificacion : "auto"}
                      onChange={(e) => onTip(l.telefono, e.target.value)}
                      disabled={!migrado}
                      className={`px-2 py-1 rounded-full text-xs font-semibold border-0 cursor-pointer disabled:cursor-not-allowed appearance-none ${TIP_BADGE[l.tipificacion]}`}
                      title={l.tip_manual ? "Tipificación manual (elegí Automática para volver)" : "Tipificación automática"}
                    >
                      <option value="auto">
                        {l.tip_manual ? "Automática" : `${TIP_LABEL[l.tipificacion]} (auto)`}
                      </option>
                      {TIPS.map((t) => (
                        <option key={t} value={t}>{TIP_LABEL[t]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    <span className="block max-w-[160px] truncate" title={l.etapa_nombre ?? undefined}>{l.etapa_nombre ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell"><TempBadge temp={l.temperatura} score={l.score} /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtFecha(l.ultima_respuesta)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap hidden 2xl:table-cell">{fmtFecha(l.ultima_actividad)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onOpen(l)}
                      className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Ver ficha y recorrido"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Kanban (drag & drop = tipificar a mano) ─────────────────────────────────

function Kanban({
  leads,
  migrado,
  onDrop,
  onOpen,
}: {
  leads: Lead[];
  migrado: boolean;
  onDrop: (telefono: string, valor: string) => void;
  onOpen: (l: Lead) => void;
}) {
  const [sobre, setSobre] = useState<Tipificacion | null>(null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3 items-start">
      {TIPS.map((t) => {
        const col = leads.filter((l) => l.tipificacion === t);
        return (
          <div
            key={t}
            onDragOver={(e) => {
              if (!migrado) return;
              e.preventDefault();
              setSobre(t);
            }}
            onDragLeave={() => setSobre((s) => (s === t ? null : s))}
            onDrop={(e) => {
              if (!migrado) return;
              e.preventDefault();
              setSobre(null);
              const tel = e.dataTransfer.getData("text/plain");
              if (tel) onDrop(tel, t);
            }}
            className={`bg-card rounded-xl border shadow-card overflow-hidden transition-colors ${sobre === t ? "border-primary bg-primary/5" : "border-border"}`}
          >
            <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${TIP_DOT[t]}`} />
              <span className="text-xs font-semibold text-foreground flex-1 truncate">{TIP_LABEL[t]}</span>
              <span className="text-xs font-bold text-muted-foreground tabular-nums">{col.length}</span>
            </div>
            <div className="p-2 space-y-2 min-h-[80px] max-h-[65vh] overflow-y-auto">
              {col.length === 0 && (
                <div className="text-[11px] text-muted-foreground text-center py-4">Sin leads</div>
              )}
              {col.map((l) => (
                <div
                  key={l.telefono}
                  draggable={migrado}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", l.telefono)}
                  onClick={() => onOpen(l)}
                  className="rounded-lg border border-border bg-background p-2.5 cursor-pointer hover:border-primary/50 transition-colors"
                  title={migrado ? "Arrastrá a otra columna para re-tipificar" : undefined}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground truncate flex-1">
                      {l.nombre ?? l.telefono}
                    </span>
                    {l.tip_manual && <Pin className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                  </div>
                  {l.nombre && (
                    <div className="text-[11px] font-mono text-muted-foreground truncate">{l.telefono}</div>
                  )}
                  <div className="flex items-center justify-between mt-1.5 gap-2">
                    <span className="text-[11px] text-muted-foreground truncate" title={l.etapa_nombre ?? undefined}>
                      {l.etapa_nombre ?? "—"}
                    </span>
                    <span
                      className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded flex-shrink-0 ${
                        l.temperatura === "caliente"
                          ? "bg-destructive/10 text-destructive"
                          : l.temperatura === "tibio"
                          ? "bg-warning/15 text-warning"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {l.score}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Últ. resp: {fmtFecha(l.ultima_respuesta)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Drawer de detalle: ficha + notas + recorrido ────────────────────────────

function LeadDrawer({
  agenteId,
  lead,
  migrado,
  onClose,
  onSaved,
  onTip,
  show,
}: {
  agenteId: string;
  lead: Lead;
  migrado: boolean;
  onClose: () => void;
  onSaved: () => void;
  onTip: (telefono: string, valor: string) => void;
  show: (msg: string, err?: boolean) => void;
}) {
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [notas, setNotas] = useState(lead.lead_notas ?? "");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api(`/api/agentes/${agenteId}/leads/${encodeURIComponent(lead.telefono)}`, "GET")
      .then((d) => setEventos((d as { eventos: Evento[] }).eventos))
      .catch(() => setEventos([]));
  }, [agenteId, lead.telefono]);

  async function guardarNotas() {
    setGuardando(true);
    try {
      await api(`/api/agentes/${agenteId}/leads/${encodeURIComponent(lead.telefono)}`, "PATCH", {
        lead_notas: notas || null,
      });
      show("Notas guardadas");
      onSaved();
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al guardar", true);
    } finally {
      setGuardando(false);
    }
  }

  const fichaEntries = Object.entries(lead.ficha ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== ""
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-card border-l border-border shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <div className="font-semibold text-foreground truncate">{lead.nombre ?? lead.telefono}</div>
            <div className="text-xs text-muted-foreground font-mono">{lead.telefono}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <TipBadge tip={lead.tipificacion} manual={lead.tip_manual} />
            <TempBadge temp={lead.temperatura} score={lead.score} />
            {lead.calif_nivel >= 1 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-success/15 text-success">
                {lead.calif_nivel >= 2 ? "SQL" : "SAL"}
              </span>
            )}
          </div>

          {/* Tipificación manual */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Tipificación</h3>
            <select
              value={lead.tip_manual ? lead.tipificacion : "auto"}
              onChange={(e) => onTip(lead.telefono, e.target.value)}
              disabled={!migrado}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
            >
              <option value="auto">Automática ({TIP_LABEL[lead.tipificacion]})</option>
              {TIPS.map((t) => (
                <option key={t} value={t}>{TIP_LABEL[t]}</option>
              ))}
            </select>
          </div>

          {/* Datos de contacto */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Actividad</h3>
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden text-sm">
              <Dato label="Primer contacto" valor={fmtFecha(lead.inicio)} />
              <Dato label="Última respuesta del lead" valor={fmtFecha(lead.ultima_respuesta)} />
              <Dato label="Última actualización" valor={fmtFecha(lead.ultima_actividad)} />
              <Dato label="Turnos (lead)" valor={`${lead.turnos} (${lead.turnos_lead})`} />
              <Dato label="Etapa" valor={lead.etapa_nombre ?? "—"} />
              <Dato label="Derivado a humano" valor={lead.transbordado ? "Sí" : "No"} />
            </div>
          </div>

          {/* Ficha */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              Ficha ({lead.ficha_ok}/{lead.ficha_total || "—"} variables)
            </h3>
            {fichaEntries.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sin datos recolectados todavía.</div>
            ) : (
              <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                {fichaEntries.map(([k, v]) => (
                  <div key={k} className="flex items-start gap-3 px-3 py-2 text-sm">
                    <span className="w-36 flex-shrink-0 text-xs text-muted-foreground font-mono pt-0.5 break-all">{k}</span>
                    <span className="text-foreground break-words min-w-0">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Notas internas</h3>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              disabled={!migrado}
              rows={3}
              placeholder={migrado ? "Notas del equipo sobre este lead…" : "Corré la migración 17-funnel.sql para habilitar notas"}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
            />
            <button
              onClick={guardarNotas}
              disabled={!migrado || guardando}
              className="mt-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar notas"}
            </button>
          </div>

          {/* Timeline */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Recorrido</h3>
            {eventos === null ? (
              <div className="text-sm text-muted-foreground">Cargando…</div>
            ) : eventos.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sin eventos registrados.</div>
            ) : (
              <div className="space-y-2">
                {eventos.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-foreground">
                        {ev.tipo === "transbordo"
                          ? "Transbordo a humano"
                          : ev.tipo === "calificacion"
                          ? `Calificado como ${(ev.calificacion ?? "").toUpperCase()}`
                          : ev.etapa_hasta
                          ? `${ev.etapa_desde ? ev.etapa_desde + " → " : ""}${ev.etapa_hasta}`
                          : ev.tipo}
                      </div>
                      <div className="text-xs text-muted-foreground">{fmtFecha(ev.creado_en)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground text-right">{valor}</span>
    </div>
  );
}
