"use client";

import { use, useEffect, useState } from "react";
import {
  User,
  Sparkles,
  MessageCircle,
  GraduationCap,
  Zap,
  Headphones,
  Crosshair,
  Heart,
  Briefcase,
  Sun,
} from "lucide-react";
import { useToast, api } from "@/lib/ui";

type Persona = "consultor" | "agresivo" | "soporte";
type Tono = "directo" | "empatico" | "formal" | "amigable";
type Velocidad = "lento" | "normal" | "rapido";

type Agente = {
  nombre: string;
  tenant: string;
  ambiente: string;
  rol: string;
  idioma: string;
  zona_horaria: string;
  formato_hora: string;
  persona: Persona;
  tono: Tono;
  velocidad_respuesta: Velocidad;
  long_max_mensaje: number;
  mensajes_historial: number;
  usar_emojis: boolean;
  usar_abreviaturas: boolean;
  publicado: boolean;
};

const inputCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

// Zonas horarias (IANA) agrupadas. Foco en LATAM (mercado del producto) + globales frecuentes.
const TIMEZONES: { grupo: string; zonas: { value: string; label: string }[] }[] = [
  {
    grupo: "América Latina",
    zonas: [
      { value: "America/Mexico_City", label: "Ciudad de México (GMT-6)" },
      { value: "America/Tijuana", label: "Tijuana (GMT-8)" },
      { value: "America/Cancun", label: "Cancún (GMT-5)" },
      { value: "America/Bogota", label: "Bogotá (GMT-5)" },
      { value: "America/Lima", label: "Lima (GMT-5)" },
      { value: "America/Guayaquil", label: "Quito / Guayaquil (GMT-5)" },
      { value: "America/Caracas", label: "Caracas (GMT-4)" },
      { value: "America/La_Paz", label: "La Paz (GMT-4)" },
      { value: "America/Santiago", label: "Santiago de Chile (GMT-4/-3)" },
      { value: "America/Asuncion", label: "Asunción (GMT-4/-3)" },
      { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires (GMT-3)" },
      { value: "America/Montevideo", label: "Montevideo (GMT-3)" },
      { value: "America/Sao_Paulo", label: "São Paulo (GMT-3)" },
      { value: "America/Guatemala", label: "Guatemala / San Salvador (GMT-6)" },
      { value: "America/Panama", label: "Panamá (GMT-5)" },
      { value: "America/Santo_Domingo", label: "Santo Domingo (GMT-4)" },
    ],
  },
  {
    grupo: "Norteamérica",
    zonas: [
      { value: "America/New_York", label: "Nueva York — Este (GMT-5/-4)" },
      { value: "America/Chicago", label: "Chicago — Central (GMT-6/-5)" },
      { value: "America/Denver", label: "Denver — Montaña (GMT-7/-6)" },
      { value: "America/Los_Angeles", label: "Los Ángeles — Pacífico (GMT-8/-7)" },
    ],
  },
  {
    grupo: "Europa",
    zonas: [
      { value: "Europe/Madrid", label: "Madrid (GMT+1/+2)" },
      { value: "Europe/London", label: "Londres (GMT+0/+1)" },
      { value: "Europe/Paris", label: "París / Berlín (GMT+1/+2)" },
      { value: "Europe/Lisbon", label: "Lisboa (GMT+0/+1)" },
    ],
  },
  { grupo: "Global", zonas: [{ value: "UTC", label: "UTC (GMT+0)" }] },
];

const TZ_VALUES = new Set(TIMEZONES.flatMap((g) => g.zonas.map((z) => z.value)));

const PERSONAS: {
  value: Persona;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "consultor", label: "Consultor", desc: "Enfoque consultivo y educativo", icon: GraduationCap },
  { value: "agresivo", label: "Agresivo", desc: "Enfoque en cierre rápido", icon: Zap },
  { value: "soporte", label: "Soporte", desc: "Orientado a resolver problemas", icon: Headphones },
];

const TONOS: {
  value: Tono;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "directo", label: "Directo", desc: "Objetivo y pragmático", icon: Crosshair },
  { value: "empatico", label: "Empático", desc: "Comprensivo y acogedor", icon: Heart },
  { value: "formal", label: "Formal", desc: "Profesional y corporativo", icon: Briefcase },
  { value: "amigable", label: "Amigable", desc: "Relajado y cercano", icon: Sun },
];

export default function IdentidadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();
  const [form, setForm] = useState<Agente | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api("/api/agentes/" + id, "GET")
      .then((a) => setForm(a as Agente))
      .catch((e: Error) => show(e.message, true));
  }, [id, show]);

  function set<K extends keyof Agente>(key: K, value: Agente[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function guardar() {
    if (!form) return;
    setSaving(true);
    try {
      const upd = await api("/api/agentes/" + id, "PATCH", form);
      setForm(upd as Agente);
      show("Cambios guardados");
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }

  if (!form) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        Cargando…
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Identidad y Comportamiento</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configurá la personalidad y estilo de comunicación del agente.
            </p>
          </div>
        </div>
        <button
          onClick={guardar}
          disabled={saving}
          className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar Cambios"}
        </button>
      </div>

      {/* Configuración Básica */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-semibold text-base">Configuración Básica</h2>
        </div>

        <FieldRow label="Nombre" hint="Nombre con el que se presentará el agente">
          <input
            className={inputCls}
            value={form.nombre ?? ""}
            onChange={(e) => set("nombre", e.target.value)}
            placeholder="Ej: Sofía"
          />
        </FieldRow>

        <FieldRow label="Rol" hint="Descripción del rol, objetivo general y contexto del agente">
          <textarea
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow resize-vertical min-h-[96px]"
            value={form.rol ?? ""}
            onChange={(e) => set("rol", e.target.value)}
            rows={4}
            placeholder="Ej: Sos una asesora comercial de la empresa X. Tu objetivo es..."
          />
        </FieldRow>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <FieldRow label="Tenant">
            <input
              className={inputCls}
              value={form.tenant ?? ""}
              onChange={(e) => set("tenant", e.target.value)}
              placeholder="Ej: empresa-demo"
            />
          </FieldRow>
          <FieldRow label="Ambiente">
            <input
              className={inputCls}
              value={form.ambiente ?? ""}
              onChange={(e) => set("ambiente", e.target.value)}
              placeholder="Ej: producción"
            />
          </FieldRow>
        </div>

        <FieldRow label="Idioma">
          <select
            className={selectCls}
            value={form.idioma ?? "es"}
            onChange={(e) => set("idioma", e.target.value)}
          >
            <option value="es">Español</option>
            <option value="pt">Portugués</option>
            <option value="en">Inglés</option>
          </select>
        </FieldRow>

        {/* Ubicación */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <FieldRow label="Zona horaria">
            <select
              className={selectCls}
              value={form.zona_horaria ?? ""}
              onChange={(e) => set("zona_horaria", e.target.value)}
            >
              {!form.zona_horaria && <option value="">Seleccioná una zona…</option>}
              {/* Conserva un valor guardado que no esté en la lista curada */}
              {form.zona_horaria && !TZ_VALUES.has(form.zona_horaria) && (
                <option value={form.zona_horaria}>{form.zona_horaria}</option>
              )}
              {TIMEZONES.map((g) => (
                <optgroup key={g.grupo} label={g.grupo}>
                  {g.zonas.map((z) => (
                    <option key={z.value} value={z.value}>
                      {z.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Formato de hora">
            <select
              className={selectCls}
              value={form.formato_hora ?? "24h"}
              onChange={(e) => set("formato_hora", e.target.value)}
            >
              <option value="AM/PM">AM/PM</option>
              <option value="24h">24h</option>
            </select>
          </FieldRow>
        </div>
      </div>

      {/* Persona */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-base">Persona</h2>
            <p className="text-xs text-muted-foreground">Estilo general de conducta del agente</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PERSONAS.map((p) => {
            const Icon = p.icon;
            const active = form.persona === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => set("persona", p.value)}
                className={[
                  "flex flex-col items-start gap-3 p-4 rounded-lg text-left transition-all",
                  active
                    ? "border-2 border-primary bg-primary/5"
                    : "border border-border hover:border-primary/50",
                ].join(" ")}
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{p.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{p.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tono de Voz */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-base">Tono de Voz</h2>
            <p className="text-xs text-muted-foreground">Cómo se expresa el agente en cada interacción</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TONOS.map((t) => {
            const Icon = t.icon;
            const active = form.tono === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => set("tono", t.value)}
                className={[
                  "flex flex-col items-start gap-3 p-4 rounded-lg text-left transition-all",
                  active
                    ? "border-2 border-primary bg-primary/5"
                    : "border border-border hover:border-primary/50",
                ].join(" ")}
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{t.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Estilo de Comunicación */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-semibold text-base">Estilo de Comunicación</h2>
        </div>

        <FieldRow label="Velocidad de Respuesta">
          <select
            className={selectCls}
            value={form.velocidad_respuesta ?? "normal"}
            onChange={(e) => set("velocidad_respuesta", e.target.value as Velocidad)}
          >
            <option value="lento">Lento</option>
            <option value="normal">Normal</option>
            <option value="rapido">Rápido</option>
          </select>
        </FieldRow>

        <FieldRow label="Longitud Máxima del Mensaje">
          <input
            className={inputCls}
            type="number"
            min={0}
            value={form.long_max_mensaje ?? 0}
            onChange={(e) => set("long_max_mensaje", parseInt(e.target.value, 10) || 0)}
          />
        </FieldRow>

        <FieldRow
          label="Mensajes en Historial"
          hint="Cantidad de mensajes anteriores que el agente considera para responder"
        >
          <input
            className={inputCls}
            type="number"
            min={0}
            value={form.mensajes_historial ?? 0}
            onChange={(e) => set("mensajes_historial", parseInt(e.target.value, 10) || 0)}
          />
        </FieldRow>

        <div className="flex items-center justify-between py-1">
          <div>
            <div className="text-sm font-semibold text-foreground">Usar Emojis</div>
          </div>
          <Switch on={form.usar_emojis} onChange={(v) => set("usar_emojis", v)} />
        </div>

        <div className="flex items-center justify-between py-1">
          <div>
            <div className="text-sm font-semibold text-foreground">Usar Abreviaturas</div>
            <div className="text-xs text-muted-foreground mt-0.5">tb, tmb, xq, etc.</div>
          </div>
          <Switch on={form.usar_abreviaturas} onChange={(v) => set("usar_abreviaturas", v)} />
        </div>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 bg-gradient-to-t from-background via-background/80 to-transparent pt-4 pb-6 flex justify-end">
        <button
          onClick={guardar}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-card"
        >
          {saving ? "Guardando…" : "Guardar Cambios"}
        </button>
      </div>

      {node}
    </>
  );
}

// ─── Helper components ───────────────────────────────────────────────────────

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

function Switch({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={[
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex-shrink-0",
        on ? "bg-primary" : "bg-input",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
          on ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}
