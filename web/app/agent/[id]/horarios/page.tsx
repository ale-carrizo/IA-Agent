"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Clock, Plus, Save, Trash2, CalendarOff } from "lucide-react";
import { Toggle, useToast, api } from "@/lib/ui";

type Horario = { dia: number; hora_inicio: string; hora_fin: string; cerrado: boolean };
type Feriado = { id: number; fecha: string; descripcion: string };

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function diaDefault(dia: number): Horario {
  return { dia, hora_inicio: "09:00", hora_fin: "18:00", cerrado: true };
}

const inputCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

const timeCls =
  "flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow w-32 disabled:opacity-40 disabled:cursor-not-allowed";

export default function HorariosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();

  const [horarios, setHorarios] = useState<Horario[]>(DIAS.map((_, i) => diaDefault(i)));
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fecha, setFecha] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [addingFeriado, setAddingFeriado] = useState(false);

  const loadHorarios = useCallback(async () => {
    const data: Horario[] = await api(`/api/agentes/${id}/horarios`, "GET");
    const merged = DIAS.map((_, i) => {
      const h = data.find((d) => d.dia === i);
      if (!h) return diaDefault(i);
      // El backend guarda hora_inicio/hora_fin en null cuando el día está cerrado;
      // mantenemos los defaults para que los inputs sigan controlados al reabrir el día.
      return {
        dia: i,
        hora_inicio: h.hora_inicio || "09:00",
        hora_fin: h.hora_fin || "18:00",
        cerrado: !!h.cerrado,
      };
    });
    setHorarios(merged);
  }, [id]);

  const loadFeriados = useCallback(async () => {
    setFeriados(await api(`/api/agentes/${id}/feriados`, "GET"));
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadHorarios(), loadFeriados()]);
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }, [loadHorarios, loadFeriados, show]);

  useEffect(() => {
    load();
  }, [load]);

  function setDia(dia: number, patch: Partial<Horario>) {
    setHorarios((prev) => prev.map((h) => (h.dia === dia ? { ...h, ...patch } : h)));
  }

  async function guardarHorario() {
    setSaving(true);
    try {
      await api(`/api/agentes/${id}/horarios`, "PUT", { horarios });
      show("Horario guardado");
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }

  async function agregarFeriado() {
    if (!fecha) {
      show("Elegí una fecha", true);
      return;
    }
    setAddingFeriado(true);
    try {
      await api(`/api/agentes/${id}/feriados`, "POST", {
        fecha,
        descripcion: descripcion.trim() || undefined,
      });
      setFecha("");
      setDescripcion("");
      show("Feriado agregado");
      await loadFeriados();
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setAddingFeriado(false);
    }
  }

  async function borrarFeriado(fId: number) {
    if (!confirm("¿Borrar este feriado?")) return;
    try {
      await api(`/api/feriados/${fId}`, "DELETE");
      show("Feriado eliminado");
      await loadFeriados();
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        Cargando…
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Clock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Horario de Atención</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define cuándo el agente atiende. Fuera de horario, finde o feriado, el agente ofrece agendar.
          </p>
        </div>
      </div>

      {/* Horario semanal */}
      <div className="bg-card rounded-xl border border-border shadow-card p-6">
        <div className="flex items-center gap-3 pb-4 border-b border-border mb-2">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-semibold text-base">Horario semanal</h2>
        </div>

        <div className="space-y-0">
          {horarios.map((h) => (
            <div
              key={h.dia}
              className="flex items-center gap-4 py-3 border-b border-border last:border-0"
            >
              <span className="w-24 text-sm font-semibold text-foreground flex-shrink-0">
                {DIAS[h.dia]}
              </span>
              <Toggle
                on={h.cerrado}
                onChange={(v) => setDia(h.dia, { cerrado: v })}
                label="Cerrado"
              />
              <div className="flex items-center gap-2 ml-auto">
                <input
                  type="time"
                  className={timeCls}
                  value={h.hora_inicio}
                  disabled={h.cerrado}
                  onChange={(e) => setDia(h.dia, { hora_inicio: e.target.value })}
                />
                <span className="text-xs text-muted-foreground">a</span>
                <input
                  type="time"
                  className={timeCls}
                  value={h.hora_fin}
                  disabled={h.cerrado}
                  onChange={(e) => setDia(h.dia, { hora_fin: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="pt-4">
          <button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
            onClick={guardarHorario}
            disabled={saving}
          >
            <Save className="w-4 h-4" />
            {saving ? "Guardando…" : "Guardar horario"}
          </button>
        </div>
      </div>

      {/* Feriados */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <CalendarOff className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-semibold text-base">Feriados</h2>
        </div>

        {feriados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm gap-2">
            <CalendarOff className="w-8 h-8 opacity-30" />
            Sin feriados cargados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">
                    Fecha
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">
                    Descripción
                  </th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {feriados.map((f) => (
                  <tr
                    key={f.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{f.fecha?.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{f.descripcion || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => borrarFeriado(f.id)}
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

        <div className="p-6 border-t border-border space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Fecha</label>
              <input
                type="date"
                className={inputCls}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Descripción</label>
              <input
                className={inputCls}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="ej: Día del Trabajador"
              />
            </div>
          </div>
          <button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
            onClick={agregarFeriado}
            disabled={addingFeriado}
          >
            <Plus className="w-4 h-4" />
            {addingFeriado ? "Agregando…" : "Agregar feriado"}
          </button>
        </div>
      </div>

      {node}
    </>
  );
}
