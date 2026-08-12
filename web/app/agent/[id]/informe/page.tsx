"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Printer, ArrowLeft, TrendingDown, Gauge, MessageSquare } from "lucide-react";
import { useToast, api } from "@/lib/ui";

type Embudo = { orden: number; nombre: string; calificacion: string | null; alcanzaron: number };
type Informe = {
  agente: { nombre: string; tenant: string };
  mes: string;
  leads: number;
  kpis: { mensajes: number; bloqueados: number; transbordados: number };
  embudo: Embudo[];
  embudoBase: number;
  calidad: { n: number; promedio: number | null; m: number; et: number; na: number; ve: number; co: number };
  demanda: Record<string, { valor: string; n: number }[]>;
  analisis: {
    resumen: string;
    temas: { tema: string; frecuencia: string; ejemplo: string }[];
    objeciones: { objecion: string; ejemplo: string; sugerencia: string }[];
    recomendaciones: string[];
    generado_en: string;
  } | null;
  error?: string;
};

const DIM_LABELS: Record<string, string> = {
  area_interes: "Área de interés", carrera_interes: "Carrera", formato_producto: "Formato",
  sede: "Sede", programa_interes: "Programa",
};

function mesesRecientes(n: number): { val: string; label: string }[] {
  const out: { val: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ val, label: d.toLocaleDateString("es-AR", { month: "long", year: "numeric" }) });
  }
  return out;
}

export default function InformePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();
  const meses = mesesRecientes(12);
  const [mes, setMes] = useState(meses[0].val);
  const [inf, setInf] = useState<Informe | null>(null);
  const [cargando, setCargando] = useState(false);

  const load = useCallback(async () => {
    setCargando(true);
    try {
      const d = await api(`/api/agentes/${id}/informe?mes=${mes}`, "GET");
      if (d.error) throw new Error(d.error);
      setInf(d);
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setCargando(false);
    }
  }, [id, mes, show]);

  useEffect(() => { load(); }, [load]);

  const base = inf?.embudoBase || 0;
  const mesLabel = meses.find((m) => m.val === mes)?.label || mes;

  return (
    <>
      <style jsx global>{`
        @media print {
          aside, header, .no-print { display: none !important; }
          main { padding: 0 !important; }
          .informe-page { box-shadow: none !important; border: none !important; }
          body { background: white !important; }
        }
      `}</style>

      {/* Barra de control (no se imprime) */}
      <div className="no-print flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/agent/${id}/insights`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Volver a Insights
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="px-3 py-2 rounded-md border border-border bg-background text-sm capitalize"
          >
            {meses.map((m) => <option key={m.val} value={m.val}>{m.label}</option>)}
          </select>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
          >
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </button>
        </div>
      </div>

      {cargando && <div className="text-sm text-muted-foreground animate-pulse py-10 text-center">Compilando informe…</div>}

      {inf && !cargando && (
        <div className="informe-page bg-card rounded-xl border border-border p-8 shadow-card space-y-8 mt-4">
          {/* Encabezado */}
          <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Informe mensual · {inf.agente.nombre}</h1>
                <p className="text-sm text-muted-foreground capitalize">{mesLabel} · {inf.agente.tenant}</p>
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div className="font-semibold text-foreground">Sales AI · Grupo Nods</div>
              <div>Generado {new Date().toLocaleDateString("es-AR")}</div>
            </div>
          </div>

          {/* Resumen ejecutivo (del análisis IA) */}
          {inf.analisis?.resumen && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 text-sm">
              <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Resumen ejecutivo</div>
              {inf.analisis.resumen}
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiBox label="Leads del mes" value={inf.leads} />
            <KpiBox label="Mensajes" value={inf.kpis?.mensajes ?? 0} icon={<MessageSquare className="w-3.5 h-3.5" />} />
            <KpiBox label="Derivados a asesor" value={inf.kpis?.transbordados ?? 0} />
            <KpiBox label="Calidad promedio" value={inf.calidad?.promedio != null ? `${inf.calidad.promedio}/50` : "—"} icon={<Gauge className="w-3.5 h-3.5" />} />
          </div>

          {/* Embudo */}
          <Section title="Embudo de conversión" hint="De los leads del mes, cuántos alcanzaron cada etapa.">
            <div className="space-y-2.5">
              {inf.embudo.map((f, i) => {
                const pct = base > 0 ? Math.round((f.alcanzaron / base) * 100) : 0;
                const prev = i > 0 ? inf.embudo[i - 1].alcanzaron : f.alcanzaron;
                const caida = prev > 0 ? Math.round(((prev - f.alcanzaron) / prev) * 100) : 0;
                return (
                  <div key={f.orden}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>{f.orden}. {f.nombre}{f.calificacion ? ` (${f.calificacion.toUpperCase()})` : ""}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {i > 0 && caida > 0 && <span className="text-destructive mr-2 inline-flex items-center gap-0.5"><TrendingDown className="w-3 h-3" />{caida}%</span>}
                        <b className="text-foreground">{f.alcanzaron}</b> ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, pct)}%` }} />
                    </div>
                  </div>
                );
              })}
              {inf.embudo.length === 0 && <p className="text-sm text-muted-foreground">Sin datos.</p>}
            </div>
          </Section>

          {/* Demanda */}
          {Object.keys(inf.demanda).length > 0 && (
            <Section title="Demanda real" hint="Qué pidieron los leads, contado de sus fichas.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.entries(inf.demanda).map(([clave, items]) => (
                  <div key={clave}>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">{DIM_LABELS[clave] || clave}</h4>
                    <div className="space-y-1">
                      {items.slice(0, 6).map((it) => (
                        <div key={it.valor} className="flex items-center justify-between text-sm">
                          <span className="truncate">{it.valor}</span>
                          <span className="tabular-nums text-muted-foreground font-medium">{it.n}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Objeciones */}
          {inf.analisis?.objeciones && inf.analisis.objeciones.length > 0 && (
            <Section title="Por qué dicen que no" hint="Objeciones detectadas, con cita textual y sugerencia.">
              <div className="space-y-2">
                {inf.analisis.objeciones.map((o, i) => (
                  <div key={i} className="border border-border rounded-lg p-3">
                    <span className="font-medium text-sm">{o.objecion}</span>
                    <p className="text-xs text-muted-foreground mt-1 italic">“{o.ejemplo}”</p>
                    <p className="text-xs mt-1"><span className="font-semibold text-primary">Sugerencia:</span> {o.sugerencia}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Recomendaciones */}
          {inf.analisis?.recomendaciones && inf.analisis.recomendaciones.length > 0 && (
            <Section title="Recomendaciones">
              <ol className="space-y-1.5">
                {inf.analisis.recomendaciones.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-primary font-bold">{i + 1}.</span><span>{r}</span>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {inf.calidad?.n === 0 && !inf.analisis && (
            <p className="text-sm text-muted-foreground">Sin auditorías ni análisis IA en este período. Corré el Juez QA y el Análisis IA desde Insights.</p>
          )}
        </div>
      )}

      {node}
    </>
  );
}

function KpiBox({ label, value, icon }: { label: string; value: number | string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">{icon}{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-semibold text-base">{title}</h2>
      {hint && <p className="text-xs text-muted-foreground mb-3">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </div>
  );
}
