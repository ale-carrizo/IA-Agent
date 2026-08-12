"use client";

import { use, useEffect, useState, useCallback } from "react";
import { MessageSquare, Clock, Eye, RefreshCw, Search, Trash2 } from "lucide-react";
import { api, useToast } from "@/lib/ui";
import { Detalle } from "./Detalle";

// ─── Types ────────────────────────────────────────────────────────────────────

type EstadoType = "activa" | "esperando" | "transbordo";

type Sesion = {
  telefono: string;
  nombre: string | null;
  etapa_actual: string | null;
  transbordado: boolean;
  ultima_actividad: string;
  inicio: string;
  turnos: number;
  estado: EstadoType;
};

type ConversacionesData = {
  total: number;
  esperando4h: number;
  sesiones: Sesion[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtFecha(d: string) {
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConversacionesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { show, node } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ConversacionesData | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [detalle, setDetalle] = useState<{ telefono: string; estado: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api(`/api/agentes/${id}/conversaciones`, "GET");
      setData(d as ConversacionesData);
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al cargar", true);
    } finally {
      setLoading(false);
    }
  }, [id, show]);

  useEffect(() => {
    load();
  }, [load]);

  const [borrando, setBorrando] = useState<string | null>(null);

  async function borrar(s: Sesion) {
    const quien = s.nombre ? `${s.nombre} (${s.telefono})` : s.telefono;
    if (
      !confirm(
        `¿Borrar la conversación con ${quien}?\n\nSe elimina el historial completo y la memoria del bot: si el lead vuelve a escribir, arranca de cero. Esta acción no se puede deshacer.`
      )
    )
      return;
    setBorrando(s.telefono);
    try {
      await api(`/api/conversaciones/${encodeURIComponent(s.telefono)}?agente_id=${id}`, "DELETE");
      show("Conversación borrada");
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al borrar", true);
    } finally {
      setBorrando(null);
    }
  }

  const sesiones = data?.sesiones ?? [];
  const filtradas = sesiones.filter((s) => {
    const q = busqueda.toLowerCase();
    const matchQ =
      !q ||
      s.telefono.toLowerCase().includes(q) ||
      (s.nombre ?? "").toLowerCase().includes(q);
    const matchE = filtroEstado === "todos" || s.estado === filtroEstado;
    return matchQ && matchE;
  });

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Conversaciones</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Visualice y gestione las conversaciones de sus agentes.
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* ── Summary cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Total conversaciones */}
        <div className="bg-card rounded-xl border border-border p-5 shadow-card flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">
              {data?.total ?? "—"}
            </div>
            <div className="text-sm text-muted-foreground">Conversaciones</div>
          </div>
        </div>

        {/* Esperando +4h */}
        <div className="bg-card rounded-xl border border-warning/40 p-5 shadow-card flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-warning/10 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-warning" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">
              {data?.esperando4h ?? "—"}
            </div>
            <div className="text-sm text-muted-foreground">Esperando +4h</div>
          </div>
        </div>
      </div>

      {/* ── Filtros ────────────────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-card">
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-48 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por ID, nombre o teléfono"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
            />
          </div>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
          >
            <option value="todos">Todos los estados</option>
            <option value="activa">Activa</option>
            <option value="esperando">Esperando</option>
            <option value="transbordo">Transbordo</option>
          </select>
        </div>
      </div>

      {/* ── Tabla de sesiones ──────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h2 className="font-semibold text-sm text-foreground">
            Sesiones{" "}
            <span className="text-muted-foreground font-normal">
              ({filtradas.length} encontradas)
            </span>
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            Cargando…
          </div>
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
            <MessageSquare className="w-8 h-8 opacity-30" />
            Sin conversaciones que coincidan
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    Contacto
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">
                    Nombre
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    Etapa Actual
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">
                    Estado
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap hidden 2xl:table-cell">
                    Inicio
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    Última interacción
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((s) => (
                  <tr
                    key={s.telefono}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {s.telefono}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">
                      <span className="block max-w-[160px] truncate" title={s.nombre ?? undefined}>
                        {s.nombre ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      <span className="block max-w-[240px] truncate" title={s.etapa_actual ?? undefined}>
                        {s.etapa_actual ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={s.estado} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap hidden 2xl:table-cell">
                      {fmtFecha(s.inicio)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {fmtFecha(s.ultima_actividad)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() =>
                            setDetalle({ telefono: s.telefono, estado: s.estado })
                          }
                          className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Ver conversación"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => borrar(s)}
                          disabled={borrando === s.telefono}
                          className="p-1.5 rounded-lg border border-border bg-card hover:bg-destructive/10 hover:border-destructive/40 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                          title="Borrar historial"
                        >
                          <Trash2 className={`w-4 h-4 ${borrando === s.telefono ? "animate-pulse" : ""}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal detalle ──────────────────────────────────────────── */}
      {detalle && (
        <Detalle
          telefono={detalle.telefono}
          agenteId={id}
          estado={detalle.estado}
          onClose={() => setDetalle(null)}
        />
      )}

      {node}
    </>
  );
}

// ─── EstadoBadge ─────────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === "activa") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        Activa
      </span>
    );
  }
  if (estado === "transbordo") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-success/15 text-success whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-success" />
        Transbordo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-warning/15 text-warning whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-warning" />
      Esperando
    </span>
  );
}
