"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  Layers,
  User,
  Variable,
  Wrench,
  Clock,
  FileText,
  ChevronLeft,
  Copy,
} from "lucide-react";
import { Field, Toggle, useToast, api } from "@/lib/ui";

type Calif = "ninguna" | "sal" | "sql";

type Etapa = {
  id: string;
  nombre: string;
  objetivo: string | null;
  calificacion: Calif;
  tono_override: string | null;
  reglas: string | null;
  activo: boolean;
};

type Variable = { id: string; nombre: string; tipo: string };
type Herramienta = { id: string; clave: string; nombre: string; descripcion: string; tipo: string };
type Horario = { dia: number; hora_inicio: string; hora_fin: string; cerrado: boolean };

const TABS = ["Identidad", "Variables", "Herramientas", "Horarios", "Prompt"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, React.ComponentType<{ className?: string }>> = {
  Identidad: User,
  Variables: Variable,
  Herramientas: Wrench,
  Horarios: Clock,
  Prompt: FileText,
};

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const inputCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

const textareaCls =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow resize-vertical";

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

export default function StageEditorPage({ params }: { params: Promise<{ id: string; stageId: string }> }) {
  const { id, stageId } = use(params);
  const { show, node } = useToast();
  const [tab, setTab] = useState<Tab>("Identidad");

  // ---- Identidad ----
  const [etapa, setEtapa] = useState<Etapa | null>(null);
  const [nombre, setNombre] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [calificacion, setCalificacion] = useState<Calif>("ninguna");
  const [tonoOverride, setTonoOverride] = useState("");
  const [reglas, setReglas] = useState("");
  const [activo, setActivo] = useState(true);

  // ---- Variables ----
  const [variables, setVariables] = useState<Variable[]>([]);
  const [varVinc, setVarVinc] = useState<Set<string>>(new Set());
  const [varCargado, setVarCargado] = useState(false);

  // ---- Herramientas ----
  const [herramientas, setHerramientas] = useState<Herramienta[]>([]);
  const [herrVinc, setHerrVinc] = useState<Set<string>>(new Set());
  const [herrCargado, setHerrCargado] = useState(false);

  // ---- Horarios ----
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [horCargado, setHorCargado] = useState(false);

  // ---- Prompt ----
  const [prompt, setPrompt] = useState("");
  const [promptCargado, setPromptCargado] = useState(false);

  async function cargarEtapa() {
    try {
      const e: Etapa = await api(`/api/etapas/${stageId}`, "GET");
      setEtapa(e);
      setNombre(e.nombre ?? "");
      setObjetivo(e.objetivo ?? "");
      setCalificacion(e.calificacion ?? "ninguna");
      setTonoOverride(e.tono_override ?? "");
      setReglas(e.reglas ?? "");
      setActivo(e.activo);
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  useEffect(() => {
    cargarEtapa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId]);

  // lazy load por tab
  useEffect(() => {
    if (tab === "Variables" && !varCargado) cargarVariables();
    if (tab === "Herramientas" && !herrCargado) cargarHerramientas();
    if (tab === "Horarios" && !horCargado) cargarHorarios();
    if (tab === "Prompt" && !promptCargado) cargarPrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function guardarIdentidad() {
    try {
      await api(`/api/etapas/${stageId}`, "PATCH", {
        nombre: nombre.trim(),
        objetivo,
        calificacion,
        tono_override: tonoOverride.trim() || null,
        reglas,
        activo,
      });
      await cargarEtapa();
      setPromptCargado(false);
      show("Cambios guardados");
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  // ---- Variables ----
  async function cargarVariables() {
    try {
      const [todas, vinc]: [Variable[], string[]] = await Promise.all([
        api(`/api/agentes/${id}/variables`, "GET"),
        api(`/api/etapas/${stageId}/variables`, "GET"),
      ]);
      setVariables(todas);
      setVarVinc(new Set(vinc));
      setVarCargado(true);
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  async function guardarVariables() {
    try {
      await api(`/api/etapas/${stageId}/variables`, "PUT", { ids: [...varVinc] });
      setPromptCargado(false);
      show("Variables guardadas");
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  // ---- Herramientas ----
  async function cargarHerramientas() {
    try {
      const [catalogo, vinc]: [Herramienta[], string[]] = await Promise.all([
        api(`/api/herramientas`, "GET"),
        api(`/api/etapas/${stageId}/herramientas`, "GET"),
      ]);
      setHerramientas(catalogo);
      setHerrVinc(new Set(vinc));
      setHerrCargado(true);
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  async function guardarHerramientas() {
    try {
      await api(`/api/etapas/${stageId}/herramientas`, "PUT", { ids: [...herrVinc] });
      setPromptCargado(false);
      show("Herramientas guardadas");
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  // ---- Horarios ----
  async function cargarHorarios() {
    try {
      const rows: Horario[] = await api(`/api/etapas/${stageId}/horarios`, "GET");
      const base: Horario[] = DIAS.map((_, dia) => {
        const found = rows.find((r) => r.dia === dia);
        return found
          ? {
              dia,
              hora_inicio: found.hora_inicio ?? "09:00",
              hora_fin: found.hora_fin ?? "18:00",
              cerrado: !!found.cerrado,
            }
          : { dia, hora_inicio: "09:00", hora_fin: "18:00", cerrado: false };
      });
      setHorarios(base);
      setHorCargado(true);
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  function setHorario(dia: number, patch: Partial<Horario>) {
    setHorarios((prev) => prev.map((h) => (h.dia === dia ? { ...h, ...patch } : h)));
  }

  async function guardarHorarios() {
    try {
      await api(`/api/etapas/${stageId}/horarios`, "PUT", { horarios });
      setPromptCargado(false);
      show("Horarios guardados");
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  // ---- Prompt ----
  async function cargarPrompt() {
    try {
      const r: { prompt: string } = await api(`/api/etapas/${stageId}/prompt`, "GET");
      setPrompt(r.prompt);
      setPromptCargado(true);
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  async function copiarPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      show("Prompt copiado");
    } catch {
      show("No se pudo copiar", true);
    }
  }

  function guardarActual() {
    if (tab === "Identidad") guardarIdentidad();
    else if (tab === "Variables") guardarVariables();
    else if (tab === "Herramientas") guardarHerramientas();
    else if (tab === "Horarios") guardarHorarios();
    else if (tab === "Prompt") cargarPrompt();
  }

  return (
    <>
      {/* Breadcrumb */}
      <Link
        href={`/agent/${id}/stages`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Volver a Etapas
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {etapa?.nombre ?? "Etapa"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configurá la identidad, variables, herramientas y horarios de esta etapa.
            </p>
          </div>
        </div>
        {tab !== "Prompt" && (
          <button
            onClick={guardarActual}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Guardar Cambios
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {TABS.map((t) => {
            const Icon = TAB_ICONS[t];
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={[
                  "inline-flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                ].join(" ")}
              >
                <Icon className="w-4 h-4" />
                {t}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ---------- Identidad ---------- */}
      {tab === "Identidad" && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-5">
          <Field label="Nombre">
            <input
              className={inputCls}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </Field>
          <Field label="Descripción del Objetivo">
            <textarea
              className={textareaCls}
              style={{ minHeight: 80 }}
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
            />
          </Field>
          <Field label="Calificación">
            <select
              className={selectCls}
              value={calificacion}
              onChange={(e) => setCalificacion(e.target.value as Calif)}
            >
              <option value="ninguna">Ninguna</option>
              <option value="sal">SAL</option>
              <option value="sql">SQL</option>
            </select>
          </Field>
          <Field label="Tono override" hint="Vacío = usa el tono global del agente">
            <input
              className={inputCls}
              value={tonoOverride}
              onChange={(e) => setTonoOverride(e.target.value)}
            />
          </Field>
          <Field label="Reglas" hint="Markdown con las reglas de la etapa">
            <textarea
              className={textareaCls}
              style={{ minHeight: 200 }}
              value={reglas}
              onChange={(e) => setReglas(e.target.value)}
            />
          </Field>
          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <div className="text-sm font-semibold text-foreground">Etapa activa</div>
            </div>
            <Toggle on={activo} onChange={setActivo} label="Etapa activa" />
          </div>
        </div>
      )}

      {/* ---------- Variables ---------- */}
      {tab === "Variables" && (
        <div className="space-y-3">
          {variables.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-10 shadow-card flex items-center justify-center">
              <p className="text-sm text-muted-foreground text-center">
                Definí variables en la sección Variables del Agente primero.
              </p>
            </div>
          ) : (
            variables.map((v) => (
              <div
                key={v.id}
                className="bg-card rounded-xl border border-border p-4 shadow-card flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm text-foreground">{v.nombre}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                    {v.tipo}
                  </span>
                </div>
                <Toggle
                  on={varVinc.has(v.id)}
                  onChange={(on) =>
                    setVarVinc((prev) => {
                      const n = new Set(prev);
                      if (on) n.add(v.id);
                      else n.delete(v.id);
                      return n;
                    })
                  }
                />
              </div>
            ))
          )}
        </div>
      )}

      {/* ---------- Herramientas ---------- */}
      {tab === "Herramientas" && (
        <div className="space-y-3">
          {herramientas.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-10 shadow-card flex items-center justify-center">
              <p className="text-sm text-muted-foreground text-center">
                No hay herramientas en el catálogo.
              </p>
            </div>
          ) : (
            herramientas.map((h) => (
              <div
                key={h.id}
                className="bg-card rounded-xl border border-border p-4 shadow-card flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-foreground">{h.nombre}</div>
                  {h.descripcion && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {h.descripcion}
                    </div>
                  )}
                </div>
                <Toggle
                  on={herrVinc.has(h.id)}
                  onChange={(on) =>
                    setHerrVinc((prev) => {
                      const n = new Set(prev);
                      if (on) n.add(h.id);
                      else n.delete(h.id);
                      return n;
                    })
                  }
                />
              </div>
            ))
          )}
        </div>
      )}

      {/* ---------- Horarios ---------- */}
      {tab === "Horarios" && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-4">
          <p className="text-xs text-muted-foreground">
            Sin configuración, la etapa está disponible 24/7.
          </p>
          <div className="space-y-3">
            {horarios.map((h) => (
              <div
                key={h.dia}
                className="flex items-center gap-4 flex-wrap py-2 border-b border-border last:border-0"
              >
                <span className="text-sm font-semibold text-foreground w-24 flex-shrink-0">
                  {DIAS[h.dia]}
                </span>
                <Toggle
                  on={h.cerrado}
                  onChange={(on) => setHorario(h.dia, { cerrado: on })}
                  label="Cerrado"
                />
                <div className="flex items-center gap-2 ml-auto">
                  <input
                    type="time"
                    className={[inputCls, "w-32"].join(" ")}
                    value={h.hora_inicio}
                    disabled={h.cerrado}
                    onChange={(e) => setHorario(h.dia, { hora_inicio: e.target.value })}
                  />
                  <span className="text-xs text-muted-foreground">a</span>
                  <input
                    type="time"
                    className={[inputCls, "w-32"].join(" ")}
                    value={h.hora_fin}
                    disabled={h.cerrado}
                    onChange={(e) => setHorario(h.dia, { hora_fin: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- Prompt ---------- */}
      {tab === "Prompt" && (
        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <p className="text-xs text-muted-foreground">
              Prompt completo generado a partir de todas las configuraciones de la etapa.
            </p>
            <button
              onClick={copiarPrompt}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-xs font-medium text-foreground hover:bg-muted transition-colors flex-shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar
            </button>
          </div>
          <pre className="p-5 text-xs font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed overflow-x-auto bg-muted/30">
            {prompt}
          </pre>
        </div>
      )}

      {node}
    </>
  );
}
