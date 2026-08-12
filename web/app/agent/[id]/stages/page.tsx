"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Layers, Plus, Pencil, Trash2, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { Field, Toggle, useToast, api } from "@/lib/ui";

type Etapa = {
  id: string;
  orden: number;
  nombre: string;
  objetivo: string | null;
  calificacion: "ninguna" | "sal" | "sql";
  activo: boolean;
};

const inputCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

const textareaCls =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow resize-vertical min-h-[80px]";

export default function StagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();

  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [objetivo, setObjetivo] = useState("");

  async function cargar() {
    try {
      const data: Etapa[] = await api(`/api/etapas?agente_id=${id}`, "GET");
      data.sort((a, b) => a.orden - b.orden);
      setEtapas(data);
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function crear() {
    if (!nombre.trim()) {
      show("Poné un nombre", true);
      return;
    }
    try {
      const etapa: Etapa = await api("/api/etapas", "POST", {
        agente_id: id,
        nombre: nombre.trim(),
        objetivo: objetivo.trim() || undefined,
      });
      show("Etapa creada");
      window.location.href = `/agent/${id}/stages/${etapa.id}`;
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  async function eliminar(eid: string) {
    if (!confirm("¿Eliminar esta etapa?")) return;
    try {
      await api(`/api/etapas/${eid}`, "DELETE");
      show("Etapa eliminada");
      cargar();
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  // Activar/Desactivar: al desactivar, el orquestador NO la ofrece (no se usa).
  async function toggleActivo(e: Etapa) {
    setEtapas((prev) => prev.map((x) => (x.id === e.id ? { ...x, activo: !e.activo } : x)));
    try {
      await api(`/api/etapas/${e.id}`, "PATCH", { activo: !e.activo });
    } catch (err) {
      setEtapas((prev) => prev.map((x) => (x.id === e.id ? { ...x, activo: e.activo } : x)));
      show((err as Error).message, true);
    }
  }

  // Persiste el orden nuevo de forma atómica (reindexa 1..N en el server).
  async function persistirOrden(lista: Etapa[]) {
    try {
      await api("/api/etapas/reorder", "POST", { agente_id: id, ids: lista.map((e) => e.id) });
    } catch (e) {
      show((e as Error).message, true);
      cargar(); // revertir a lo que hay en DB si falló
    }
  }

  // Reordenar con botones (subir/bajar).
  function mover(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= etapas.length) return;
    const next = [...etapas];
    [next[idx], next[j]] = [next[j], next[idx]];
    setEtapas(next);
    persistirOrden(next);
  }

  // Drag & drop con el mouse.
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  function onDrop(destino: number) {
    if (dragIdx === null || dragIdx === destino) { setDragIdx(null); return; }
    const next = [...etapas];
    const [movida] = next.splice(dragIdx, 1);
    next.splice(destino, 0, movida);
    setDragIdx(null);
    setEtapas(next);
    persistirOrden(next);
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Etapas de Conversación</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Estrategia conversacional dividida en etapas especializadas. Cada etapa habilita sus
              propias herramientas, variables y horarios.
            </p>
          </div>
        </div>
        {!creando && (
          <button
            onClick={() => setCreando(true)}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva Etapa
          </button>
        )}
      </div>

      {/* Formulario nueva etapa */}
      {creando && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-4">
          <h2 className="font-semibold text-base">Nueva Etapa</h2>
          <Field label="Nombre">
            <input
              className={inputCls}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Calificación inicial"
            />
          </Field>
          <Field label="Objetivo">
            <textarea
              className={textareaCls}
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
              placeholder="¿Qué busca lograr esta etapa?"
            />
          </Field>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              className="inline-flex items-center px-4 py-2 rounded-md border border-border bg-background text-sm font-medium text-foreground hover:bg-muted transition-colors"
              onClick={() => {
                setCreando(false);
                setNombre("");
                setObjetivo("");
              }}
            >
              Cancelar
            </button>
            <button
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              onClick={crear}
            >
              Crear
            </button>
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {etapas.length === 0 && !creando && (
        <div className="bg-card rounded-xl border border-border p-10 shadow-card flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Layers className="w-6 h-6 text-muted-foreground opacity-50" />
          </div>
          <p className="text-sm text-muted-foreground">Este agente no tiene etapas todavía.</p>
          <button
            onClick={() => setCreando(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Crear primera etapa
          </button>
        </div>
      )}

      {/* Lista de etapas */}
      {etapas.length > 0 && (
        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          {etapas.map((e, idx) => (
            <div
              key={e.id}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={() => onDrop(idx)}
              className={[
                "flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/30",
                idx !== etapas.length - 1 ? "border-b border-border" : "",
                !e.activo ? "opacity-55" : "",
                dragIdx === idx ? "bg-primary/5 ring-1 ring-primary/30" : "",
              ].join(" ")}
            >
              {/* Handle de arrastre */}
              <GripVertical className="w-4 h-4 text-muted-foreground/60 cursor-grab active:cursor-grabbing flex-shrink-0" />

              {/* Reordenar (botones, alternativa al drag) */}
              <div className="flex flex-col flex-shrink-0">
                <button
                  onClick={() => mover(idx, -1)}
                  disabled={idx === 0}
                  title="Subir"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => mover(idx, 1)}
                  disabled={idx === etapas.length - 1}
                  title="Bajar"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* Orden badge (posición en el embudo) */}
              <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                {idx + 1}
              </span>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-foreground">{e.nombre}</span>
                  {e.calificacion === "sal" && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning">
                      SAL
                    </span>
                  )}
                  {e.calificacion === "sql" && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-accent text-accent-foreground">
                      SQL
                    </span>
                  )}
                  {!e.activo && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                      inactiva
                    </span>
                  )}
                </div>
                {e.objetivo && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{e.objetivo}</p>
                )}
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="flex items-center gap-1.5" title={e.activo ? "Activa (el agente la usa)" : "Inactiva (el agente NO la usa)"}>
                  <Toggle on={e.activo} onChange={() => toggleActivo(e)} />
                  <span className="text-xs text-muted-foreground w-14">{e.activo ? "Activa" : "Inactiva"}</span>
                </div>
                <Link
                  href={`/agent/${id}/stages/${e.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-xs font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar
                </Link>
                <button
                  onClick={() => eliminar(e.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-destructive/30 bg-destructive/5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
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
