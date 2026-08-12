"use client";

import { useEffect, useState, useRef } from "react";
import { X, MessageSquare } from "lucide-react";
import { api, useToast } from "@/lib/ui";

type Contacto = {
  telefono: string;
  nombre: string;
  transbordado: boolean;
  etapa_actual: string | null;
  variables_recolectadas: Record<string, unknown> | null;
};

type Turno = {
  mensaje_lead: string;
  respuesta_bot: string | null;
  etapa_nombre: string | null;
  razon: string | null;
  bloqueado: boolean;
  creado_en: string;
};

type DetalleData = {
  contacto: Contacto;
  mensajes: Turno[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(nombre: string) {
  return nombre
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function fmtFecha(d: string) {
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

function fmtHora(d: string) {
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Detalle ─────────────────────────────────────────────────────────────────

export function Detalle({
  telefono,
  agenteId,
  estado,
  onClose,
}: {
  telefono: string;
  agenteId: string;
  estado: string;
  onClose: () => void;
}) {
  const { show, node } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DetalleData | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const d = await api(
          `/api/conversaciones/${encodeURIComponent(telefono)}?agente_id=${agenteId}`,
          "GET"
        );
        if (!cancel) setData(d as DetalleData);
      } catch (e) {
        if (!cancel) show(e instanceof Error ? e.message : "Error al cargar", true);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [telefono, agenteId, show]);

  useEffect(() => {
    if (data) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data]);

  const badgeClass =
    estado === "activa"
      ? "bg-primary/10 text-primary"
      : estado === "transbordo"
      ? "bg-success/15 text-success"
      : "bg-warning/15 text-warning";

  const badgeLabel =
    estado === "activa"
      ? "Conversación activa"
      : estado === "transbordo"
      ? "Transbordo"
      : "Esperando";

  const nombreContacto = data?.contacto?.nombre ?? telefono;
  const primeraFecha = data?.mensajes?.[0]?.creado_en;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Panel lateral */}
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl z-50 flex flex-col bg-background shadow-xl border-l border-border">
        {/* Header del modal */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-border bg-card flex-shrink-0">
          <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm flex-shrink-0 select-none">
            {nombreContacto !== telefono ? (
              initials(nombreContacto)
            ) : (
              <MessageSquare className="w-4 h-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground truncate">
                {nombreContacto}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${badgeClass}`}
              >
                {badgeLabel}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {telefono}
              {data?.contacto?.etapa_actual ? ` · ${data.contacto.etapa_actual}` : ""}
            </div>
            {primeraFecha && (
              <div className="text-xs text-muted-foreground mt-0.5">
                Iniciada el {fmtFecha(primeraFecha)}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cuerpo del chat */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-muted">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
              Cargando…
            </div>
          ) : !data?.mensajes?.length ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-sm gap-2">
              <MessageSquare className="w-8 h-8 opacity-30" />
              Sin mensajes registrados aún
            </div>
          ) : (
            <ChatTurnos mensajes={data.mensajes} />
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {node}
    </>
  );
}

// ─── ChatTurnos ──────────────────────────────────────────────────────────────

function ChatTurnos({ mensajes }: { mensajes: Turno[] }) {
  let prevEtapa: string | null = null;

  return (
    <>
      {mensajes.map((turno, i) => {
        const etapaCambio = turno.etapa_nombre && turno.etapa_nombre !== prevEtapa;
        if (etapaCambio) prevEtapa = turno.etapa_nombre;

        return (
          <div key={i} className="space-y-2">
            {/* Divisor de etapa */}
            {etapaCambio && (
              <div className="flex items-center justify-center py-1.5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  {turno.etapa_nombre}
                </span>
              </div>
            )}

            {/* Burbuja del lead (izquierda) */}
            <div className="flex items-end gap-2">
              <div className="max-w-[75%] bg-card rounded-2xl rounded-bl-sm px-3.5 py-2.5 shadow-card border border-border">
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                  {turno.mensaje_lead}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 text-right">
                  {fmtHora(turno.creado_en)}
                </p>
              </div>
            </div>

            {/* Burbuja del bot (derecha) + razonamiento */}
            {turno.respuesta_bot && (
              <div className="flex flex-col items-end gap-1.5">
                <div className="max-w-[75%] bg-success/10 rounded-2xl rounded-br-sm px-3.5 py-2.5 shadow-card border border-success/20">
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                    {turno.respuesta_bot}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 flex items-center justify-end gap-1">
                    {fmtHora(turno.creado_en)}
                    <span className="text-success font-bold tracking-tighter">✓✓</span>
                  </p>
                </div>

                {/* Caja de razonamiento */}
                {(turno.razon || turno.bloqueado) && (
                  <div className="max-w-[75%] bg-warning/10 border border-warning/30 rounded-xl px-3 py-2 flex gap-2 items-start">
                    <span className="text-base flex-shrink-0 leading-tight">💡</span>
                    <div className="min-w-0">
                      {turno.bloqueado && (
                        <p className="text-xs font-semibold text-warning mb-0.5">
                          🛡 Respuesta bloqueada por guardrail
                        </p>
                      )}
                      {turno.razon && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {turno.razon}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
