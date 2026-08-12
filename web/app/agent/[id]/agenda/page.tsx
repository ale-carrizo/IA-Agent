"use client";

import { use, useCallback, useEffect, useState } from "react";
import { CalendarClock, RefreshCw, Calendar, Send } from "lucide-react";
import { api, useToast } from "@/lib/ui";

type Agendamiento = {
  id: string;
  fecha_hora: string;
  estado: "pendiente" | "propuesto" | "confirmado" | "ejecutado" | "cancelado";
  detalle: string;
  telefono: string;
};

type Followup = {
  enviado_en: string;
  orden: number;
  delay_minutos: number;
  telefono: string;
};

type AgendaData = { agendamientos: Agendamiento[]; followups: Followup[] };

function fmtFecha(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtDelay(min: number) {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${m}m`;
  }
  return `${min}m`;
}

const estadoConfig: Record<Agendamiento["estado"], { cls: string; label: string }> = {
  pendiente: { cls: "bg-warning/15 text-warning", label: "Pendiente" },
  propuesto: { cls: "bg-warning/15 text-warning", label: "Propuesto" },
  confirmado: { cls: "bg-primary/10 text-primary", label: "Confirmado" },
  ejecutado: { cls: "bg-success/10 text-success", label: "Ejecutado" },
  cancelado: { cls: "bg-muted text-muted-foreground", label: "Cancelado" },
};

function AgendaTabla({
  titulo,
  hint,
  lista,
  vacio,
  destacar,
}: {
  titulo: string;
  hint: string;
  lista: Agendamiento[];
  vacio: string;
  destacar?: boolean;
}) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center gap-3">
        <div
          className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
            destacar ? "bg-warning/15" : "bg-primary/10"
          }`}
        >
          <Calendar className={`w-4 h-4 ${destacar ? "text-warning" : "text-primary"}`} />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-base">{titulo}</h2>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">({lista.length})</span>
      </div>
      {lista.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-muted-foreground text-sm gap-2">
          <Calendar className="w-8 h-8 opacity-30" />
          {vacio}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Fecha y hora
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">
                  Teléfono
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">
                  Estado
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">
                  Detalle
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => {
                const cfg =
                  estadoConfig[a.estado] ?? {
                    cls: "bg-muted text-muted-foreground",
                    label: a.estado || "—",
                  };
                return (
                  <tr
                    key={a.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {fmtFecha(a.fecha_hora)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {a.telefono}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}
                      >
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground"><span className="block max-w-[360px] truncate" title={a.detalle}>{a.detalle}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AgendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();
  const [data, setData] = useState<AgendaData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = (await api(`/api/agentes/${id}/agenda`, "GET")) as AgendaData;
      setData(d);
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al cargar la agenda", true);
    } finally {
      setLoading(false);
    }
  }, [id, show]);

  useEffect(() => {
    load();
  }, [load]);

  const agendamientos = data?.agendamientos ?? [];
  const followups = data?.followups ?? [];
  // Pendientes = todavía no ejecutadas ni canceladas (upcoming). Pasadas = ejecutadas/canceladas.
  const esPendiente = (a: Agendamiento) =>
    a.estado !== "ejecutado" && a.estado !== "cancelado";
  const pendientes = agendamientos
    .filter(esPendiente)
    .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime());
  const pasadas = agendamientos
    .filter((a) => !esPendiente(a))
    .sort((a, b) => new Date(b.fecha_hora).getTime() - new Date(a.fecha_hora).getTime());

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <CalendarClock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Agenda y Follow-ups</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Reuniones agendadas por el agente y follow-ups enviados.
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

      {/* Agendas pendientes (a futuro) */}
      <AgendaTabla
        titulo="Agendas pendientes"
        hint="Reuniones a futuro. El motor ejecutará el hand-off al asesor en la fecha/hora acordada con el lead."
        lista={pendientes}
        vacio="No hay agendas pendientes."
        destacar
      />

      {/* Agendas pasadas (ejecutadas o vencidas) */}
      <AgendaTabla
        titulo="Agendas pasadas"
        hint="Agendas ya ejecutadas (hand-off disparado) o vencidas."
        lista={pasadas}
        vacio="Sin agendas pasadas."
      />

      {/* Follow-ups enviados */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Send className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-semibold text-base">Follow-ups enviados</h2>
          <span className="text-xs text-muted-foreground">({followups.length})</span>
        </div>

        {followups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-muted-foreground text-sm gap-2">
            <Send className="w-8 h-8 opacity-30" />
            Sin follow-ups enviados todavía.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    Enviado
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">
                    Paso
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">
                    Delay
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">
                    Teléfono
                  </th>
                </tr>
              </thead>
              <tbody>
                {followups.map((f, i) => (
                  <tr
                    key={i}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {fmtFecha(f.enviado_en)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                        #{f.orden}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {fmtDelay(f.delay_minutos)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {f.telefono}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {node}
    </>
  );
}
