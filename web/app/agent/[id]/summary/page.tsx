"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  User,
  Variable,
  Shield,
  Clock,
  Layers,
  Send,
  Radio,
  Check,
  ChevronRight,
} from "lucide-react";
import { useToast, api } from "@/lib/ui";

const WEBHOOK = "POST https://n8n-ac1b.srv1490495.hstgr.cloud/webhook/agente-entrada";

type Agente = {
  id: string;
  nombre: string;
  rol: string | null;
  tenant: string | null;
  persona: string | null;
  tono: string | null;
  velocidad_respuesta: string | null;
  usar_emojis: boolean;
  long_max_mensaje: number | null;
  publicado: boolean;
};

type Etapa = {
  id: string;
  orden: number;
  nombre: string;
  calificacion: "ninguna" | "sal" | "sql";
};

export default function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();

  const [loading, setLoading] = useState(true);
  const [agente, setAgente] = useState<Agente | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [varCount, setVarCount] = useState(0);
  const [grCount, setGrCount] = useState(0);
  const [horCount, setHorCount] = useState(0);
  const [fuCount, setFuCount] = useState(0);
  const [obsConvs, setObsConvs] = useState(0);
  const [pubSaving, setPubSaving] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [ag, et, va, gu, hor, fu, ob] = await Promise.all([
          api(`/api/agentes/${id}`, "GET"),
          api(`/api/etapas?agente_id=${id}`, "GET"),
          api(`/api/agentes/${id}/variables`, "GET"),
          api(`/api/agentes/${id}/guardrails`, "GET"),
          api(`/api/agentes/${id}/horarios`, "GET"),
          api(`/api/agentes/${id}/follow-ups`, "GET"),
          api(`/api/agentes/${id}/observabilidad`, "GET"),
        ]);
        if (cancel) return;
        setAgente(ag as Agente);
        setEtapas(Array.isArray(et) ? (et as Etapa[]) : []);
        setVarCount(Array.isArray(va) ? va.length : 0);
        setGrCount(Array.isArray(gu) ? gu.length : 0);
        setHorCount(Array.isArray(hor) ? hor.length : 0);
        setFuCount(Array.isArray(fu) ? fu.length : 0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setObsConvs(Array.isArray((ob as any)?.conversaciones) ? (ob as any).conversaciones.length : 0);
      } catch (e) {
        if (!cancel) show(e instanceof Error ? e.message : "Error al cargar", true);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [id, show]);

  async function togglePublicado(v: boolean) {
    if (!agente || pubSaving) return;
    setPubSaving(true);
    try {
      const updated = await api(`/api/agentes/${id}`, "PATCH", { publicado: v });
      setAgente((a) => (a ? { ...a, publicado: (updated as Agente)?.publicado ?? v } : a));
      show(v ? "Agente publicado" : "En borrador");
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al guardar", true);
    } finally {
      setPubSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        Cargando…
      </div>
    );
  }

  if (!agente) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        No se pudo cargar el agente.
      </div>
    );
  }

  const identidadDone = !!(agente.nombre && agente.rol);
  const varDone = varCount > 0;
  const grDone = grCount > 0;
  const horDone = horCount > 0;
  const stagesDone = etapas.length > 0;
  const fuDone = fuCount > 0;

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <LayoutDashboard className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Resumen del Agente</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Vista general del agente y su configuración.
          </p>
        </div>
      </div>

      {/* Estado General */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card">
        <h2 className="font-semibold text-base mb-4">Estado General</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Publicado toggle-badge */}
          <button
            onClick={() => togglePublicado(!agente.publicado)}
            disabled={pubSaving}
            className={[
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors disabled:opacity-60",
              agente.publicado
                ? "bg-success/15 text-success hover:bg-success/25"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            ].join(" ")}
          >
            <span
              className={[
                "w-1.5 h-1.5 rounded-full",
                agente.publicado ? "bg-success" : "bg-muted-foreground",
              ].join(" ")}
            />
            {agente.publicado ? "Activo" : "Borrador"}
          </button>

          {/* WhatsApp badge */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-whatsapp/10 text-whatsapp">
            <Radio className="w-3 h-3" />
            WhatsApp
          </span>

          {/* Conversaciones chip */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
            {obsConvs} conversaciones
          </span>
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Webhook de entrada</p>
          <p className="text-xs font-mono text-muted-foreground bg-muted px-3 py-2 rounded-md break-all">
            {WEBHOOK}
          </p>
        </div>
      </div>

      {/* Section cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Identidad */}
        <SectionCard
          icon={<User className="w-4 h-4 text-primary" />}
          title="Identidad y Comportamiento"
          done={identidadDone}
          href={`/agent/${id}/identidad`}
        >
          {identidadDone ? (
            <dl className="space-y-1">
              <DataRow k="Nombre" v={agente.nombre} />
              <DataRow k="Persona" v={agente.persona} />
              <DataRow k="Tono" v={agente.tono} />
              <DataRow k="Velocidad" v={agente.velocidad_respuesta} />
              <DataRow k="Emojis" v={agente.usar_emojis ? "Sí" : "No"} />
              {agente.long_max_mensaje != null && (
                <DataRow k="Long. máx" v={`${agente.long_max_mensaje} chars`} />
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground italic">Sin configuración definida</p>
          )}
        </SectionCard>

        {/* Variables */}
        <SectionCard
          icon={<Variable className="w-4 h-4 text-primary" />}
          title="Variables del Agente"
          done={varDone}
          href={`/agent/${id}/variables`}
        >
          {varDone ? (
            <p className="text-sm text-foreground">
              {varCount} variable{varCount !== 1 ? "s" : ""} configurada{varCount !== 1 ? "s" : ""}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Sin configuración definida</p>
          )}
        </SectionCard>

        {/* Guardrails */}
        <SectionCard
          icon={<Shield className="w-4 h-4 text-primary" />}
          title="Guardrails"
          done={grDone}
          href={`/agent/${id}/guardrails`}
        >
          {grDone ? (
            <p className="text-sm text-foreground">
              {grCount} guardrail{grCount !== 1 ? "s" : ""} configurado{grCount !== 1 ? "s" : ""}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Sin configuración definida</p>
          )}
        </SectionCard>

        {/* Horario */}
        <SectionCard
          icon={<Clock className="w-4 h-4 text-primary" />}
          title="Horario de Atención"
          done={horDone}
          href={`/agent/${id}/horarios`}
        >
          {horDone ? (
            <p className="text-sm text-foreground">
              {horCount} día{horCount !== 1 ? "s" : ""} configurado{horCount !== 1 ? "s" : ""}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Sin configuración definida</p>
          )}
        </SectionCard>

        {/* Etapas */}
        <SectionCard
          icon={<Layers className="w-4 h-4 text-primary" />}
          title="Etapas de Conversación"
          done={stagesDone}
          href={`/agent/${id}/stages`}
        >
          {stagesDone ? (
            <p className="text-sm text-foreground">
              {etapas.length} etapa{etapas.length !== 1 ? "s" : ""} configurada{etapas.length !== 1 ? "s" : ""}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Sin configuración definida</p>
          )}
        </SectionCard>

        {/* Follow-ups */}
        <SectionCard
          icon={<Send className="w-4 h-4 text-primary" />}
          title="Follow-ups"
          done={fuDone}
          href={`/agent/${id}/follow-ups`}
        >
          {fuDone ? (
            <p className="text-sm text-foreground">
              {fuCount} follow-up{fuCount !== 1 ? "s" : ""} configurado{fuCount !== 1 ? "s" : ""}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Sin configuración definida</p>
          )}
        </SectionCard>
      </div>

      {/* Resumen de Etapas */}
      {etapas.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base">Resumen de Etapas</h2>
            <Link
              href={`/agent/${id}/stages`}
              className="text-xs text-primary font-medium hover:underline"
            >
              Ver todas →
            </Link>
          </div>
          <div className="space-y-1">
            {etapas.slice(0, 7).map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 py-2 border-b border-border last:border-0"
              >
                <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                  {e.orden}
                </span>
                <span className="flex-1 text-sm truncate">{e.nombre}</span>
                {e.calificacion === "sal" && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-warning/15 text-warning">
                    SAL
                  </span>
                )}
                {e.calificacion === "sql" && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                    SQL
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {node}
    </>
  );
}

// ─── Helper components ───────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  done,
  href,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  done: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-card flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{title}</div>
          {done ? (
            <div className="flex items-center gap-1 text-xs text-success mt-0.5">
              <Check className="w-3 h-3" />
              Configurado
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <Clock className="w-3 h-3" />
              Pendiente
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-[3rem]">{children}</div>

      <Link
        href={href}
        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline w-fit"
      >
        {done ? "Editar" : "Configurar"}
        <ChevronRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

function DataRow({
  k,
  v,
}: {
  k: string;
  v: string | number | null | undefined;
}) {
  if (v == null || v === "") return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <dt className="text-muted-foreground w-20 flex-shrink-0">{k}:</dt>
      <dd className="text-foreground capitalize">{String(v)}</dd>
    </div>
  );
}
