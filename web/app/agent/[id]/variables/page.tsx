"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Variable, Plus, Trash2 } from "lucide-react";
import { useToast, api } from "@/lib/ui";

type VarItem = { id: number; nombre: string; tipo: string };
type Tipo = "texto" | "numero" | "bool" | "fecha";

const inputCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

const TIPO_COLORS: Record<string, string> = {
  texto: "bg-primary/10 text-primary",
  numero: "bg-accent text-accent-foreground",
  bool: "bg-success/10 text-success",
  fecha: "bg-warning/15 text-warning",
};

export default function VariablesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();

  const [vars, setVars] = useState<VarItem[]>([]);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<Tipo>("texto");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setVars(await api(`/api/agentes/${id}/variables`, "GET"));
    } catch (e) {
      show((e as Error).message, true);
    }
  }, [id, show]);

  useEffect(() => {
    load();
  }, [load]);

  async function agregar() {
    if (!nombre.trim()) {
      show("Poné un nombre", true);
      return;
    }
    setSaving(true);
    try {
      await api(`/api/agentes/${id}/variables`, "POST", { nombre: nombre.trim(), tipo });
      setNombre("");
      setTipo("texto");
      show("Variable agregada");
      await load();
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }

  async function borrar(varId: number) {
    try {
      await api(`/api/variables/${varId}`, "DELETE");
      show("Variable eliminada");
      await load();
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Variable className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Variables del Agente</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Datos que el agente recolecta durante la conversación (nombre del lead, área de interés, etc.).
          </p>
        </div>
      </div>

      {/* Lista de variables */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h2 className="font-semibold text-sm text-foreground">
            Variables configuradas{" "}
            <span className="text-muted-foreground font-normal">({vars.length})</span>
          </h2>
        </div>

        {vars.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-muted-foreground text-sm gap-2">
            <Variable className="w-8 h-8 opacity-30" />
            Sin variables todavía.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Nombre</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Tipo</th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {vars.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{v.nombre}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${TIPO_COLORS[v.tipo] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {v.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => borrar(v.id)}
                        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Nueva variable */}
      <div className="bg-card rounded-xl border border-border shadow-card p-6 space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Plus className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-semibold text-base">Nueva variable</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">Nombre</label>
            <input
              className={inputCls}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="ej: area_de_interes"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">Tipo</label>
            <select
              className={selectCls}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as Tipo)}
            >
              <option value="texto">texto</option>
              <option value="numero">numero</option>
              <option value="bool">bool</option>
              <option value="fecha">fecha</option>
            </select>
          </div>
        </div>

        <button
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          onClick={agregar}
          disabled={saving}
        >
          <Plus className="w-4 h-4" />
          {saving ? "Agregando…" : "Agregar variable"}
        </button>
      </div>

      {node}
    </>
  );
}
