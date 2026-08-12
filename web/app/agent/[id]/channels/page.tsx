"use client";

import { use, useEffect, useState, useCallback } from "react";
import { Radio, Plus, Trash2, KeyRound, Users, ChevronDown, ChevronRight } from "lucide-react";
import { api, useToast, Toggle, Field } from "@/lib/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

type Plataforma = "botmaker" | "kapso";

type Canal = {
  id: string;
  canal_numero: string;
  nombre: string | null;
  plataforma: string | null;
  handoff_intent_id: string | null;
  cola: string | null;
  cola_atencion: string | null;
  activo: boolean;
  tiene_token: boolean;
  kapso_phone_number_id: string | null;
  tiene_kapso_key: boolean;
};

type Asesor = { id: string; kapso_user_id: string; nombre: string | null; activo: boolean; last_assigned_at: string | null };

type FormData = {
  plataforma: Plataforma;
  canal_numero: string;
  nombre: string;
  botmaker_token: string;
  handoff_intent_id: string;
  cola: string;
  cola_atencion: string;
  kapso_api_key: string;
  kapso_phone_number_id: string;
};

const EMPTY_FORM: FormData = {
  plataforma: "botmaker",
  canal_numero: "",
  nombre: "",
  botmaker_token: "",
  handoff_intent_id: "",
  cola: "asesores",
  cola_atencion: "",
  kapso_api_key: "",
  kapso_phone_number_id: "",
};

const inputCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChannelsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();

  const [canales, setCanales] = useState<Canal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/api/agentes/${id}/canales`, "GET");
      setCanales(Array.isArray(data) ? (data as Canal[]) : []);
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al cargar", true);
    } finally {
      setLoading(false);
    }
  }, [id, show]);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(c: Canal) {
    setEditingId(c.id);
    setForm({
      plataforma: (c.plataforma === "kapso" ? "kapso" : "botmaker"),
      canal_numero: c.canal_numero,
      nombre: c.nombre ?? "",
      botmaker_token: "",
      handoff_intent_id: c.handoff_intent_id ?? "",
      cola: c.cola ?? "asesores",
      cola_atencion: c.cola_atencion ?? "",
      kapso_api_key: "",
      kapso_phone_number_id: c.kapso_phone_number_id ?? "",
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.canal_numero.trim()) { show("El número de canal es obligatorio", true); return; }
    setSaving(true);
    try {
      const body: Record<string, string> = {
        plataforma: form.plataforma,
        canal_numero: form.canal_numero.trim(),
        nombre: form.nombre.trim(),
        cola: form.cola.trim() || "asesores",
        cola_atencion: form.cola_atencion.trim(),
      };
      if (form.plataforma === "botmaker") {
        body.handoff_intent_id = form.handoff_intent_id.trim();
        if (form.botmaker_token.trim()) body.botmaker_token = form.botmaker_token.trim();
      } else {
        body.kapso_phone_number_id = form.kapso_phone_number_id.trim();
        if (form.kapso_api_key.trim()) body.kapso_api_key = form.kapso_api_key.trim();
      }
      if (editingId) {
        await api(`/api/canales/${editingId}`, "PATCH", body);
        show("Canal actualizado");
      } else {
        await api(`/api/agentes/${id}/canales`, "POST", body);
        show("Canal creado");
      }
      cancelForm();
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al guardar", true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(canalId: string, label: string) {
    if (!confirm(`¿Eliminar el canal "${label}"?`)) return;
    try {
      await api(`/api/canales/${canalId}`, "DELETE");
      show("Canal eliminado");
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al eliminar", true);
    }
  }

  async function handleToggleActivo(canal: Canal, v: boolean) {
    try {
      await api(`/api/canales/${canal.id}`, "PATCH", { activo: v });
      setCanales((prev) => prev.map((c) => (c.id === canal.id ? { ...c, activo: v } : c)));
      show(v ? "Canal activado" : "Canal desactivado");
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al actualizar", true);
    }
  }

  const esKapso = form.plataforma === "kapso";

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Radio className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Canal de Conexión</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Conectá las líneas de WhatsApp por Botmaker o Kapso. Cada línea usa sus propias credenciales.
            </p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            Nuevo canal
          </button>
        )}
      </div>

      {/* ── Aviso ──────────────────────────────────────────────────── */}
      <div className="bg-muted rounded-xl border border-border p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Dos proveedores de transporte.</strong> <b>Botmaker</b> maneja la cola de asesores en su plataforma. <b>Kapso</b> es WhatsApp-first más barato: el motor rutea al asesor con round-robin propio (cargá los asesores abajo). El motor (router, RAG, guardrails) es el mismo para ambos.
      </div>

      {/* ── Form alta / edición ────────────────────────────────────── */}
      {showForm && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-card">
          <h2 className="font-semibold text-base mb-5">{editingId ? "Editar canal" : "Nuevo canal"}</h2>
          <form onSubmit={handleSubmit}>
            {/* Selector de plataforma */}
            <Field label="Proveedor" hint="Botmaker o Kapso. Define cómo entra y sale el mensaje y cómo se hace el handoff.">
              <div className="flex gap-2">
                {(["botmaker", "kapso"] as Plataforma[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, plataforma: p }))}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors capitalize ${
                      form.plataforma === p ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 mt-4">
              <Field label="Nombre" hint='Nombre descriptivo de la línea, ej: "UEES Admisiones"'>
                <input className={inputCls} value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Grupo Nods" />
              </Field>

              <Field
                label={esKapso ? "Etiqueta del canal" : "Canal (número de WhatsApp)"}
                hint={esKapso ? "Identificador visible del canal, ej: UEES-Kapso" : "El whatsappNumber de Botmaker, ej: 5492914852219"}
              >
                <input className={inputCls} value={form.canal_numero} onChange={(e) => setForm((f) => ({ ...f, canal_numero: e.target.value }))} placeholder={esKapso ? "UEES-Kapso" : "5492914852219"} />
              </Field>

              {/* Campos Botmaker */}
              {!esKapso && (
                <>
                  <Field label="Token de Botmaker" hint={editingId ? "access-token. Vacío = no cambia." : "access-token de la cuenta Botmaker."}>
                    <input type="password" className={inputCls} value={form.botmaker_token} onChange={(e) => setForm((f) => ({ ...f, botmaker_token: e.target.value }))} placeholder={editingId ? "••••••• (sin cambios)" : "access-token"} />
                  </Field>
                  <Field label="Intent de derivación" hint="intentId que asigna el chat a la cola de asesores en Botmaker.">
                    <input className={inputCls} value={form.handoff_intent_id} onChange={(e) => setForm((f) => ({ ...f, handoff_intent_id: e.target.value }))} placeholder="handoff-asesores" />
                  </Field>
                </>
              )}

              {/* Campos Kapso */}
              {esKapso && (
                <>
                  <Field label="API Key de Kapso" hint={editingId ? "X-API-Key del proyecto. Vacío = no cambia." : "X-API-Key del proyecto Kapso."}>
                    <input type="password" className={inputCls} value={form.kapso_api_key} onChange={(e) => setForm((f) => ({ ...f, kapso_api_key: e.target.value }))} placeholder={editingId ? "••••••• (sin cambios)" : "X-API-Key"} />
                  </Field>
                  <Field label="Phone Number ID (Kapso)" hint="El phone_number_id del número conectado en Kapso. Es la clave del webhook entrante.">
                    <input className={inputCls} value={form.kapso_phone_number_id} onChange={(e) => setForm((f) => ({ ...f, kapso_phone_number_id: e.target.value }))} placeholder="123456789012345" />
                  </Field>
                </>
              )}

              <Field label="Cola" hint='Cola de asesores destino (default: "asesores").'>
                <input className={inputCls} value={form.cola} onChange={(e) => setForm((f) => ({ ...f, cola: e.target.value }))} placeholder="asesores" />
              </Field>

              <Field label="Cola de atención del bot" hint="El bot solo responde mensajes de esta cola. Vacío = cualquier cola.">
                <input className={inputCls} value={form.cola_atencion} onChange={(e) => setForm((f) => ({ ...f, cola_atencion: e.target.value }))} placeholder="(cualquiera)" />
              </Field>
            </div>

            {esKapso && (
              <p className="text-xs text-muted-foreground mt-2">
                Webhook a configurar en Kapso (evento <code>whatsapp.message.received</code>):{" "}
                <code className="text-foreground">https://n8n-ac1b.srv1490495.hstgr.cloud/webhook/kapso-entrada</code>
              </p>
            )}

            <div className="flex gap-3 mt-4">
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button type="button" onClick={cancelForm} className="px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Lista de canales ───────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Cargando…</div>
      ) : canales.length === 0 ? (
        <div className="empty flex flex-col items-center gap-2 py-16">
          <Radio className="w-8 h-8 opacity-30" />
          Sin canales conectados. Agregá la primera línea de WhatsApp.
        </div>
      ) : (
        <div className="space-y-3">
          {canales.map((canal) => {
            const kapso = canal.plataforma === "kapso";
            return (
              <div key={canal.id} className="card">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground text-sm">{canal.nombre || "Sin nombre"}</span>
                      <span className={`badge ${kapso ? "" : "blue"}`} style={kapso ? { background: "#7c3aed1a", color: "#7c3aed" } : undefined}>
                        {kapso ? "Kapso" : "Botmaker"}
                      </span>
                      <span className="badge blue">{canal.canal_numero}</span>
                      {canal.cola && <span className="badge">Cola: {canal.cola}</span>}
                      <span className="badge">Atiende: {canal.cola_atencion || "cualquier cola"}</span>
                    </div>

                    <div className="flex items-center gap-5 flex-wrap text-xs">
                      <span className={`inline-flex items-center gap-1 font-medium ${(kapso ? canal.tiene_kapso_key : canal.tiene_token) ? "text-success" : "text-destructive"}`}>
                        <KeyRound className="w-3.5 h-3.5" />
                        {kapso
                          ? (canal.tiene_kapso_key ? "API Key cargada" : "Sin API Key")
                          : (canal.tiene_token ? "Token cargado" : "Sin token")}
                      </span>
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <span>{kapso ? "Phone ID:" : "Intent:"}</span>
                        <span className="font-mono text-foreground">
                          {(kapso ? canal.kapso_phone_number_id : canal.handoff_intent_id) || <span className="italic text-muted-foreground">sin configurar</span>}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Toggle on={canal.activo} onChange={(v) => handleToggleActivo(canal, v)} label={canal.activo ? "Activo" : "Inactivo"} />
                    <button onClick={() => openEdit(canal)} className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted transition-colors">Editar</button>
                    <button onClick={() => handleDelete(canal.id, canal.nombre ?? canal.canal_numero)} className="p-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors" title="Eliminar canal">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Asesores del round-robin (solo Kapso) */}
                {kapso && <AsesoresKapso canalId={canal.id} show={show} />}
              </div>
            );
          })}
        </div>
      )}

      {node}
    </>
  );
}

// ─── Sub-panel de asesores para el round-robin Kapso ───────────────────────────

function AsesoresKapso({ canalId, show }: { canalId: string; show: (m: string, err?: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [asesores, setAsesores] = useState<Asesor[]>([]);
  const [userId, setUserId] = useState("");
  const [nombre, setNombre] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/canales/${canalId}/asesores`, "GET");
      setAsesores(Array.isArray(d) ? (d as Asesor[]) : []);
      setLoaded(true);
    } catch (e) {
      show(e instanceof Error ? e.message : "Error", true);
    }
  }, [canalId, show]);

  useEffect(() => { if (open && !loaded) load(); }, [open, loaded, load]);

  async function agregar() {
    if (!userId.trim()) { show("Poné el user_id de Kapso del asesor", true); return; }
    try {
      await api(`/api/canales/${canalId}/asesores`, "POST", { kapso_user_id: userId.trim(), nombre: nombre.trim() });
      setUserId(""); setNombre("");
      await load();
      show("Asesor agregado");
    } catch (e) {
      show(e instanceof Error ? e.message : "Error", true);
    }
  }

  async function toggle(a: Asesor) {
    try {
      await api(`/api/asesores-kapso/${a.id}`, "PATCH", { activo: !a.activo });
      setAsesores((prev) => prev.map((x) => (x.id === a.id ? { ...x, activo: !x.activo } : x)));
    } catch (e) {
      show(e instanceof Error ? e.message : "Error", true);
    }
  }

  async function borrar(a: Asesor) {
    if (!confirm(`¿Quitar al asesor ${a.nombre || a.kapso_user_id}?`)) return;
    try {
      await api(`/api/asesores-kapso/${a.id}`, "DELETE");
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : "Error", true);
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <Users className="w-3.5 h-3.5" /> Asesores del round-robin ({asesores.length})
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {asesores.length === 0 && loaded && (
            <p className="text-xs text-muted-foreground">Sin asesores. Agregá al menos uno para que el handoff asigne automáticamente.</p>
          )}
          {asesores.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 text-sm border border-border rounded-lg px-3 py-2">
              <div className="min-w-0">
                <span className="font-medium">{a.nombre || "Sin nombre"}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground truncate">{a.kapso_user_id}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => toggle(a)} className={`text-xs px-2 py-0.5 rounded-full font-semibold ${a.activo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                  {a.activo ? "Activo" : "Inactivo"}
                </button>
                <button onClick={() => borrar(a)} className="p-1 rounded text-destructive hover:bg-destructive/10" title="Quitar">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <input className={inputCls + " flex-1"} value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="user_id de Kapso (UUID del asesor)" />
            <input className={inputCls + " w-40"} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" />
            <button onClick={agregar} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 flex-shrink-0">Agregar</button>
          </div>
          <p className="text-[11px] text-muted-foreground">El user_id se obtiene de <code>GET /platform/v1/users</code> en Kapso (o de la lista de miembros del proyecto).</p>
        </div>
      )}
    </div>
  );
}
