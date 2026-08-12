"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Send, Plus, Save, Trash2, Timer, MessageSquare, FileText } from "lucide-react";
import { Toggle, useToast, api } from "@/lib/ui";

type FollowUp = {
  id: number;
  orden: number;
  delay_minutos: number;
  mensaje: string;
  activo: boolean;
  tipo?: "texto" | "hsm";
  intent_hsm?: string | null;
  variables_hsm?: Record<string, string> | null;
};

function fmtDelay(min: number) {
  if (!min || min < 1) return "—";
  if (min < 60) return `${min}m`;
  if (min < 1440) {
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}

const inputCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";
const textareaCls =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow resize-vertical min-h-[96px]";

export default function FollowUpsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();

  const [items, setItems] = useState<FollowUp[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [varsBuf, setVarsBuf] = useState<Record<number, string>>({});

  // alta
  const [nuevoTipo, setNuevoTipo] = useState<"texto" | "hsm">("texto");
  const [nuevoDelay, setNuevoDelay] = useState(60);
  const [nuevoMensaje, setNuevoMensaje] = useState("");
  const [nuevoIntent, setNuevoIntent] = useState("");
  const [nuevoVars, setNuevoVars] = useState('{\n  "contactFirstName": "{{nombre}}"\n}');
  const [creando, setCreando] = useState(false);

  const load = useCallback(async () => {
    try {
      const data: FollowUp[] = await api(`/api/agentes/${id}/follow-ups`, "GET");
      data.sort((a, b) => a.orden - b.orden);
      setItems(data);
      const bufs: Record<number, string> = {};
      for (const fu of data) if (fu.tipo === "hsm") bufs[fu.id] = JSON.stringify(fu.variables_hsm || {}, null, 2);
      setVarsBuf(bufs);
    } catch (e) {
      show((e as Error).message, true);
    }
  }, [id, show]);

  useEffect(() => { load(); }, [load]);

  function setLocal(fuId: number, patch: Partial<FollowUp>) {
    setItems((prev) => prev.map((it) => (it.id === fuId ? { ...it, ...patch } : it)));
  }

  function parseVars(raw: string): Record<string, string> | null {
    if (!raw.trim()) return {};
    try {
      const o = JSON.parse(raw);
      return o && typeof o === "object" && !Array.isArray(o) ? o : null;
    } catch { return null; }
  }

  async function toggleActivo(fuId: number, v: boolean) {
    setLocal(fuId, { activo: v });
    try {
      await api(`/api/follow-ups/${fuId}`, "PATCH", { activo: v });
    } catch (e) {
      setLocal(fuId, { activo: !v });
      show((e as Error).message, true);
    }
  }

  async function guardar(fu: FollowUp) {
    const esHsm = fu.tipo === "hsm";
    const maxDelay = esHsm ? 43200 : 1439;
    if (fu.delay_minutos < 1 || fu.delay_minutos > maxDelay) {
      show(`Máximo ${maxDelay} minutos`, true); return;
    }
    const body: Record<string, unknown> = { delay_minutos: fu.delay_minutos, activo: fu.activo, tipo: fu.tipo || "texto" };
    if (esHsm) {
      if (!fu.intent_hsm?.trim()) { show("Poné el nombre de la plantilla (intent)", true); return; }
      const vars = parseVars(varsBuf[fu.id] ?? "");
      if (vars === null) { show("Variables: JSON inválido", true); return; }
      body.intent_hsm = fu.intent_hsm.trim();
      body.variables_hsm = vars;
    } else {
      if (!fu.mensaje.trim()) { show("Poné un mensaje", true); return; }
      body.mensaje = fu.mensaje.trim();
    }
    setSavingId(fu.id);
    try {
      await api(`/api/follow-ups/${fu.id}`, "PATCH", body);
      show("Paso guardado");
      await load();
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setSavingId(null);
    }
  }

  async function eliminar(fuId: number) {
    if (!confirm("¿Eliminar este paso de la secuencia?")) return;
    try {
      await api(`/api/follow-ups/${fuId}`, "DELETE");
      show("Paso eliminado");
      await load();
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  async function agregar() {
    const maxDelay = nuevoTipo === "hsm" ? 43200 : 1439;
    if (nuevoDelay < 1 || nuevoDelay > maxDelay) { show(`Máximo ${maxDelay} minutos`, true); return; }
    const body: Record<string, unknown> = { delay_minutos: nuevoDelay, activo: true, tipo: nuevoTipo };
    if (nuevoTipo === "hsm") {
      if (!nuevoIntent.trim()) { show("Poné el nombre de la plantilla (intent)", true); return; }
      const vars = parseVars(nuevoVars);
      if (vars === null) { show("Variables: JSON inválido", true); return; }
      body.intent_hsm = nuevoIntent.trim();
      body.variables_hsm = vars;
    } else {
      if (!nuevoMensaje.trim()) { show("Poné un mensaje", true); return; }
      body.mensaje = nuevoMensaje.trim();
    }
    setCreando(true);
    try {
      await api(`/api/agentes/${id}/follow-ups`, "POST", body);
      setNuevoDelay(60); setNuevoMensaje(""); setNuevoIntent("");
      show("Paso agregado");
      await load();
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setCreando(false);
    }
  }

  return (
    <>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Send className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Follow-ups</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Secuencia para reenganchar leads inactivos. Texto libre dentro de las 24h; plantilla HSM para después.
          </p>
        </div>
      </div>

      <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
        <Timer className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
        <p className="text-sm text-warning">
          WhatsApp solo permite <b>texto libre dentro de las 24h</b> del último mensaje del lead. Para follow-ups
          más tardíos usá tipo <b>Plantilla (HSM)</b> con una plantilla aprobada en Botmaker. Requiere el
          <b> channelId de Botmaker</b> cargado en la sección Canal.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-muted-foreground text-sm gap-2">
          <Send className="w-8 h-8 opacity-30" />
          Sin follow-ups. Agregá el primer paso.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((fu) => {
            const esHsm = fu.tipo === "hsm";
            return (
              <div key={fu.id} className="bg-card rounded-xl border border-border shadow-card p-6 space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                      Paso #{fu.orden}
                    </span>
                    <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium " + (esHsm ? "bg-blue-500/10 text-blue-500" : "bg-secondary text-muted-foreground")}>
                      {esHsm ? <FileText className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                      {esHsm ? "Plantilla HSM" : "Texto"}
                    </span>
                    <span className="text-xs text-muted-foreground">— a los {fmtDelay(fu.delay_minutos)}</span>
                  </div>
                  <Toggle on={fu.activo} onChange={(v) => toggleActivo(fu.id, v)} label={fu.activo ? "Activo" : "Pausado"} />
                </div>

                <FieldRow label="Delay (minutos)" hint={`Se envía a los ${fmtDelay(fu.delay_minutos)} del último mensaje del lead.`}>
                  <input className={inputCls} type="number" min={1} max={esHsm ? 43200 : 1439}
                    value={fu.delay_minutos} onChange={(e) => setLocal(fu.id, { delay_minutos: Number(e.target.value) })} />
                </FieldRow>

                {esHsm ? (
                  <>
                    <FieldRow label="Plantilla (intent de Botmaker)" hint="Nombre exacto de la plantilla HSM aprobada, ej: anahuac_reapertura">
                      <input className={inputCls} value={fu.intent_hsm || ""} onChange={(e) => setLocal(fu.id, { intent_hsm: e.target.value })} placeholder="anahuac_reapertura" />
                    </FieldRow>
                    <FieldRow label="Variables (JSON)" hint="Usá {{nombre}} para el nombre del lead. Ej: { &quot;contactFirstName&quot;: &quot;{{nombre}}&quot; }">
                      <textarea className={textareaCls + " font-mono text-xs"} value={varsBuf[fu.id] ?? ""} onChange={(e) => setVarsBuf((p) => ({ ...p, [fu.id]: e.target.value }))} />
                    </FieldRow>
                  </>
                ) : (
                  <FieldRow label="Mensaje">
                    <textarea className={textareaCls} value={fu.mensaje} onChange={(e) => setLocal(fu.id, { mensaje: e.target.value })} />
                  </FieldRow>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button className="inline-flex items-center gap-2 px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                    onClick={() => guardar(fu)} disabled={savingId === fu.id}>
                    <Save className="w-3.5 h-3.5" />{savingId === fu.id ? "Guardando…" : "Guardar"}
                  </button>
                  <button className="inline-flex items-center gap-2 px-4 h-9 rounded-md bg-destructive/10 text-destructive text-sm font-semibold hover:bg-destructive/20 transition-colors"
                    onClick={() => eliminar(fu.id)}>
                    <Trash2 className="w-3.5 h-3.5" />Eliminar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Agregar paso */}
      <div className="bg-card rounded-xl border border-border shadow-card p-6 space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Plus className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-semibold text-base">Agregar paso</h2>
        </div>

        <FieldRow label="Tipo">
          <div className="flex gap-2">
            <TipoBtn active={nuevoTipo === "texto"} onClick={() => setNuevoTipo("texto")} icon={<MessageSquare className="w-4 h-4" />} label="Texto (dentro de 24h)" />
            <TipoBtn active={nuevoTipo === "hsm"} onClick={() => setNuevoTipo("hsm")} icon={<FileText className="w-4 h-4" />} label="Plantilla HSM (fuera de 24h)" />
          </div>
        </FieldRow>

        <FieldRow label="Delay (minutos)" hint={nuevoTipo === "hsm" ? "minutos desde el último mensaje; hasta 43200 (30 días)" : "minutos desde el último mensaje; máx 1439 (24h)"}>
          <input className={inputCls} type="number" min={1} max={nuevoTipo === "hsm" ? 43200 : 1439} value={nuevoDelay} onChange={(e) => setNuevoDelay(Number(e.target.value))} />
        </FieldRow>

        {nuevoTipo === "hsm" ? (
          <>
            <FieldRow label="Plantilla (intent de Botmaker)" hint="Nombre exacto de la plantilla HSM aprobada.">
              <input className={inputCls} value={nuevoIntent} onChange={(e) => setNuevoIntent(e.target.value)} placeholder="anahuac_reapertura" />
            </FieldRow>
            <FieldRow label="Variables (JSON)" hint="Usá {{nombre}} para el nombre del lead.">
              <textarea className={textareaCls + " font-mono text-xs"} value={nuevoVars} onChange={(e) => setNuevoVars(e.target.value)} />
            </FieldRow>
          </>
        ) : (
          <FieldRow label="Mensaje">
            <textarea className={textareaCls} value={nuevoMensaje} onChange={(e) => setNuevoMensaje(e.target.value)}
              placeholder="ej: ¡Hola! ¿Pudiste ver la info que te pasé? Quedo atento." />
          </FieldRow>
        )}

        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          onClick={agregar} disabled={creando}>
          <Plus className="w-4 h-4" />{creando ? "Agregando…" : "Agregar paso"}
        </button>
      </div>

      {node}
    </>
  );
}

function TipoBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={"inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium border transition-colors " + (active ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:bg-secondary")}>
      {icon}{label}
    </button>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}
