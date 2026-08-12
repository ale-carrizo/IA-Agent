"use client";

import { Fragment, use, useState, useEffect, useCallback } from "react";
import { Activity, RefreshCw, MessageSquare, ArrowRight, ChevronDown } from "lucide-react";
import { useToast, api } from "@/lib/ui";

type Tokens = { prompt: number; completion: number; llamadas: number };
type Evento = {
  tipo: "transicion" | "calificacion" | "transbordo" | "guardrail" | "follow_up";
  calificacion?: string | null;
  detalle?: { regla?: string; orden?: number | string; [k: string]: unknown } | null;
  creado_en: string;
  etapa_desde?: string | null;
  etapa_hasta?: string | null;
  telefono: string;
};
type Conversacion = {
  telefono: string;
  transbordado: boolean;
  ultima_actividad: string;
  etapa_actual: string;
  variables_recolectadas?: unknown;
};
type Observabilidad = {
  tokens: Tokens;
  eventos: Evento[];
  conversaciones: Conversacion[];
  historial?: { session_id: string; mensajes: unknown }[];
  historialDisponible?: boolean;
};
type MsgHist = { rol: "user" | "bot"; texto: string };

function fmtFecha(s: string) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function ObservabilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();

  const [data, setData] = useState<Observabilidad | null>(null);
  const [cargando, setCargando] = useState(true);

  const [histTel, setHistTel] = useState<string | null>(null);
  const [histMsgs, setHistMsgs] = useState<MsgHist[]>([]);
  const [histDisponible, setHistDisponible] = useState(true);
  const [histCargando, setHistCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = await api(`/api/agentes/${id}/observabilidad`, "GET") as any;
      setData(d);
    } catch (e: unknown) {
      show((e instanceof Error ? e.message : null) || "No se pudo cargar la observabilidad", true);
    } finally {
      setCargando(false);
    }
  }, [id, show]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function verHistorial(telefono: string) {
    // toggle: si ya está abierto para esta conversación, se cierra
    if (histTel === telefono) {
      setHistTel(null);
      return;
    }
    setHistTel(telefono);
    setHistMsgs([]);
    setHistCargando(true);
    setHistDisponible(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = await api(`/api/historial/${encodeURIComponent(telefono)}?agente_id=${id}`, "GET") as any;
      setHistDisponible(d.disponible !== false);
      setHistMsgs(Array.isArray(d.mensajes) ? d.mensajes : []);
    } catch (e: unknown) {
      show((e instanceof Error ? e.message : null) || "No se pudo cargar el historial", true);
    } finally {
      setHistCargando(false);
    }
  }

  const tokens = data?.tokens ?? { prompt: 0, completion: 0, llamadas: 0 };
  const eventos = data?.eventos ?? [];
  const conversaciones = data?.conversaciones ?? [];
  const todoVacio =
    !cargando &&
    eventos.length === 0 &&
    conversaciones.length === 0 &&
    tokens.prompt === 0 &&
    tokens.completion === 0 &&
    tokens.llamadas === 0;

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Observabilidad</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Consumo de tokens, ruteo de etapas y historial de conversaciones.
            </p>
          </div>
        </div>
        <button
          onClick={cargar}
          disabled={cargando}
          className="flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={["w-4 h-4", cargando ? "animate-spin" : ""].join(" ")} />
          Actualizar
        </button>
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
          Cargando…
        </div>
      ) : todoVacio ? (
        <div className="bg-card rounded-xl border border-border p-12 shadow-card flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Activity className="w-6 h-6 text-muted-foreground opacity-50" />
          </div>
          <p className="text-sm text-muted-foreground">
            Todavía no hay datos. Hablá con el agente desde Preview para generar actividad.
          </p>
        </div>
      ) : (
        <>
          {/* Consumo de Tokens */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Prompt tokens" value={tokens.prompt} />
            <StatCard label="Completion tokens" value={tokens.completion} />
            <StatCard label="Llamadas" value={tokens.llamadas} />
          </div>

          {/* Conversaciones */}
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <h2 className="font-semibold text-sm text-foreground">Conversaciones</h2>
            </div>
            {conversaciones.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
                <MessageSquare className="w-5 h-5 opacity-30" />
                No hay conversaciones todavía.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">Teléfono</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">Etapa actual</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Transbordado</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">Última actividad</th>
                        <th className="px-4 py-2.5 w-32" />
                      </tr>
                    </thead>
                    <tbody>
                      {conversaciones.map((c) => (
                        <Fragment key={c.telefono}>
                        <tr
                          className={[
                            "border-b border-border last:border-0 transition-colors",
                            histTel === c.telefono ? "bg-muted/30" : "hover:bg-muted/20",
                          ].join(" ")}
                        >
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {c.telefono}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-block max-w-[240px] truncate px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary align-middle"
                              title={c.etapa_actual || undefined}
                            >
                              {c.etapa_actual || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {c.transbordado ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning">
                                Humano
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">No</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {fmtFecha(c.ultima_actividad)}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => verHistorial(c.telefono)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-xs font-medium text-foreground hover:bg-muted transition-colors whitespace-nowrap"
                            >
                              Ver historial
                              <ChevronDown
                                className={[
                                  "w-3.5 h-3.5 transition-transform",
                                  histTel === c.telefono ? "rotate-180" : "",
                                ].join(" ")}
                              />
                            </button>
                          </td>
                        </tr>
                        {histTel === c.telefono && (
                          <tr className="border-b border-border last:border-0">
                            <td colSpan={5} className="px-4 py-4 bg-muted/20">
                              {histCargando ? (
                                <div className="text-sm text-muted-foreground py-2">Cargando…</div>
                              ) : !histDisponible ? (
                                <div className="text-sm text-muted-foreground py-2">
                                  El historial todavía no está disponible (n8n lo crea en la primera
                                  conversación real).
                                </div>
                              ) : histMsgs.length === 0 ? (
                                <div className="text-sm text-muted-foreground py-2">
                                  Sin mensajes guardados.
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="text-xs text-muted-foreground">
                                    {histMsgs.length} {histMsgs.length === 1 ? "mensaje" : "mensajes"}
                                  </div>
                                  <div className="bg-card border border-border rounded-lg p-4 max-h-80 overflow-y-auto space-y-2">
                                    {histMsgs.map((m, i) => (
                                      <div
                                        key={i}
                                        className={["flex", m.rol === "user" ? "justify-end" : "justify-start"].join(" ")}
                                      >
                                        <span
                                          className={[
                                            "inline-block px-3 py-2 rounded-xl text-sm max-w-[75%] whitespace-pre-wrap break-words",
                                            m.rol === "user"
                                              ? "bg-primary text-primary-foreground"
                                              : "bg-muted/50 border border-border text-foreground",
                                          ].join(" ")}
                                        >
                                          {m.texto}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

              </>
            )}
          </div>

          {/* Ruteo de Etapas */}
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <h2 className="font-semibold text-sm text-foreground">Ruteo de Etapas (eventos)</h2>
            </div>
            {eventos.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                No hay eventos de ruteo todavía.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Fecha</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">Teléfono</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Tipo</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventos.map((ev, i) => (
                      <tr
                        key={i}
                        className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtFecha(ev.creado_en)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {ev.telefono}
                        </td>
                        <td className="px-4 py-3">
                          <TipoBadge tipo={ev.tipo} />
                        </td>
                        <td className="px-4 py-3">
                          <DetalleEvento ev={ev} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {node}
    </>
  );
}

// ─── Helper components ───────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold text-foreground mt-1">
        {(value ?? 0).toLocaleString("es-AR")}
      </div>
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: Evento["tipo"] }) {
  if (tipo === "calificacion") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-accent text-accent-foreground">
        {tipo}
      </span>
    );
  }
  if (tipo === "transbordo") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning">
        {tipo}
      </span>
    );
  }
  if (tipo === "guardrail") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-destructive/10 text-destructive">
        guardrail
      </span>
    );
  }
  if (tipo === "follow_up") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-success/15 text-success">
        follow-up
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
      {tipo}
    </span>
  );
}

function DetalleEvento({ ev }: { ev: Evento }) {
  if (ev.tipo === "transicion") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
        <span>{ev.etapa_desde || "—"}</span>
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
        <span>{ev.etapa_hasta || "—"}</span>
      </span>
    );
  }
  if (ev.tipo === "calificacion") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-success/15 text-success">
        {ev.calificacion || "—"}
      </span>
    );
  }
  if (ev.tipo === "transbordo") {
    return <span className="text-xs text-muted-foreground">→ humano</span>;
  }
  if (ev.tipo === "guardrail") {
    return (
      <span className="text-xs text-destructive">
        bloqueó: {ev.detalle?.regla || "—"}
      </span>
    );
  }
  if (ev.tipo === "follow_up") {
    return (
      <span className="text-xs text-muted-foreground">
        follow-up #{ev.detalle?.orden ?? "—"} enviado
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}
