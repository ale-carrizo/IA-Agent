"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Shield, Plus, Save, Trash2 } from "lucide-react";
import { Toggle, useToast, api } from "@/lib/ui";

type Guardrail = {
  id: number;
  nombre: string;
  regla: string;
  patron_bloqueo: string | null;
  activo: boolean;
};

const inputCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

const textareaCls =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow resize-vertical min-h-[96px]";

export default function GuardrailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();

  const [items, setItems] = useState<Guardrail[]>([]);
  const [nombre, setNombre] = useState("");
  const [regla, setRegla] = useState("");
  const [patron, setPatron] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api(`/api/agentes/${id}/guardrails`, "GET"));
    } catch (e) {
      show((e as Error).message, true);
    }
  }, [id, show]);

  useEffect(() => {
    load();
  }, [load]);

  function patch(gId: number, campo: Partial<Guardrail>) {
    setItems((prev) => prev.map((g) => (g.id === gId ? { ...g, ...campo } : g)));
  }

  async function guardar(g: Guardrail) {
    try {
      await api(`/api/guardrails/${g.id}`, "PATCH", {
        nombre: g.nombre,
        regla: g.regla,
        patron_bloqueo: g.patron_bloqueo,
        activo: g.activo,
      });
      show("Guardrail guardado");
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  async function eliminar(gId: number) {
    try {
      await api(`/api/guardrails/${gId}`, "DELETE");
      show("Guardrail eliminado");
      await load();
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  async function agregar() {
    if (!nombre.trim() || !regla.trim()) {
      show("Completá nombre y regla", true);
      return;
    }
    setSaving(true);
    try {
      await api(`/api/agentes/${id}/guardrails`, "POST", {
        nombre: nombre.trim(),
        regla: regla.trim(),
        patron_bloqueo: patron.trim() || undefined,
      });
      setNombre("");
      setRegla("");
      setPatron("");
      show("Guardrail agregado");
      await load();
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Guardrails</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reglas duras de seguridad. La regla va al prompt; el patrón de bloqueo permite un chequeo
            determinístico post-respuesta (ej. bloquear precios).
          </p>
        </div>
      </div>

      {/* Nuevo guardrail */}
      <div className="bg-card rounded-xl border border-border shadow-card p-6 space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Plus className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-semibold text-base">Nuevo guardrail</h2>
        </div>

        <FieldRow label="Nombre">
          <input
            className={inputCls}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="ej: No revelar precios"
          />
        </FieldRow>

        <FieldRow label="Regla">
          <textarea
            className={textareaCls}
            value={regla}
            onChange={(e) => setRegla(e.target.value)}
            placeholder="Describí la regla que va al prompt..."
          />
        </FieldRow>

        <FieldRow
          label="Patrón de bloqueo"
          hint="regex opcional para bloqueo duro, ej: (\$|MXN|precio)"
        >
          <input
            className={inputCls}
            value={patron}
            onChange={(e) => setPatron(e.target.value)}
          />
        </FieldRow>

        <button
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          onClick={agregar}
          disabled={saving}
        >
          <Plus className="w-4 h-4" />
          {saving ? "Agregando…" : "Agregar guardrail"}
        </button>
      </div>

      {/* Lista */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-muted-foreground text-sm gap-2">
          <Shield className="w-8 h-8 opacity-30" />
          Sin guardrails todavía.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((g) => (
            <div
              key={g.id}
              className="bg-card rounded-xl border border-border shadow-card p-6 space-y-5"
            >
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    g.activo
                      ? "bg-success/10 text-success"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      g.activo ? "bg-success" : "bg-muted-foreground"
                    }`}
                  />
                  {g.activo ? "Activo" : "Inactivo"}
                </span>
                <Toggle
                  on={g.activo}
                  onChange={(v) => patch(g.id, { activo: v })}
                  label="Activo"
                />
              </div>

              <FieldRow label="Nombre">
                <input
                  className={inputCls}
                  value={g.nombre}
                  onChange={(e) => patch(g.id, { nombre: e.target.value })}
                />
              </FieldRow>

              <FieldRow label="Regla">
                <textarea
                  className={textareaCls}
                  value={g.regla}
                  onChange={(e) => patch(g.id, { regla: e.target.value })}
                />
              </FieldRow>

              <FieldRow
                label="Patrón de bloqueo"
                hint="regex opcional para bloqueo duro, ej: (\$|MXN|precio)"
              >
                <input
                  className={inputCls}
                  value={g.patron_bloqueo ?? ""}
                  onChange={(e) => patch(g.id, { patron_bloqueo: e.target.value })}
                />
              </FieldRow>

              <div className="flex items-center gap-3 pt-2">
                <button
                  className="inline-flex items-center gap-2 px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                  onClick={() => guardar(g)}
                >
                  <Save className="w-3.5 h-3.5" />
                  Guardar
                </button>
                <button
                  className="inline-flex items-center gap-2 px-4 h-9 rounded-md bg-destructive/10 text-destructive text-sm font-semibold hover:bg-destructive/20 transition-colors"
                  onClick={() => eliminar(g.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {node}
    </>
  );
}

// ─── FieldRow ────────────────────────────────────────────────────────────────

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
