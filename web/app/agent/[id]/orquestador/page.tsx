"use client";

import { use, useEffect, useState } from "react";
import { Brain, Save, Info } from "lucide-react";
import { useToast, api } from "@/lib/ui";

const taCls =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-vertical";

export default function OrquestadorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();
  const [estrategia, setEstrategia] = useState("");
  const [comportamiento, setComportamiento] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const a = (await api(`/api/agentes/${id}`, "GET")) as {
          orquestador_prompt?: string; comportamiento_global?: string;
        };
        setEstrategia(a.orquestador_prompt || "");
        setComportamiento(a.comportamiento_global || "");
      } catch (e) {
        show((e as Error).message, true);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function guardar() {
    setSaving(true);
    try {
      await api(`/api/agentes/${id}`, "PATCH", {
        orquestador_prompt: estrategia,
        comportamiento_global: comportamiento,
      });
      show("Guardado. Impacta en el próximo mensaje.");
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Orquestador</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              El cerebro que decide, en cada mensaje, a qué etapa ir (avanzar, volver o transbordar). Editá su
              estrategia y el comportamiento global del agente. Impacta en tiempo real, sin redeploy.
            </p>
          </div>
        </div>
        <button
          onClick={guardar}
          disabled={saving || loading}
          className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? "Guardando..." : "Guardar Cambios"}
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          <b>Estrategia del orquestador</b>: lógica interna para elegir etapa y cuándo transbordar (el lead NO la ve).
          {" "}<b>Comportamiento global</b>: cómo se expresa el agente con el lead en todas las etapas (empatía, tono, tacto).
          Las reglas específicas de cada etapa se editan en <b>Etapas de Conversación</b>.
        </span>
      </div>

      {loading ? (
        <div className="bg-card rounded-xl border border-border p-10 text-center text-sm text-muted-foreground shadow-card">Cargando...</div>
      ) : (
        <>
          <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-2">
            <div className="text-sm font-semibold text-foreground">Estrategia del orquestador (router)</div>
            <p className="text-xs text-muted-foreground">
              Define la misión, la libertad para moverse entre etapas y cuándo derivar al asesor. Es interno: el lead nunca lo lee.
            </p>
            <textarea className={taCls} style={{ minHeight: 300 }} value={estrategia} onChange={(e) => setEstrategia(e.target.value)} />
          </div>

          <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-2">
            <div className="text-sm font-semibold text-foreground">Comportamiento global del agente (cómo le habla al lead)</div>
            <p className="text-xs text-muted-foreground">
              Empatía, tacto, calidez, cómo valida y orienta. Aplica a todas las etapas (se combina con persona/tono de Identidad y las reglas de cada etapa).
            </p>
            <textarea className={taCls} style={{ minHeight: 180 }} value={comportamiento} onChange={(e) => setComportamiento(e.target.value)} />
          </div>
        </>
      )}

      {node}
    </>
  );
}
