"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, DollarSign, Activity, Cpu, RefreshCw, AlertTriangle } from "lucide-react";
import { useToast, api } from "@/lib/ui";

type Tenant = {
  tenant: string;
  tokens_total: number;
  tokens_mes: number;
  tokens_7d: number;
  tokens_hoy: number;
  costo_total: number;
  costo_mes: number;
  llamadas: number;
  limite_tokens_mes: number | null;
  pct_quota: number | null;
};
type Modelo = { modelo: string; tokens: number; costo: number; llamadas: number };
type Serie = { dia: string; tokens: number; costo: number };
type Data = {
  totales: { costo_total: number; costo_mes: number; tokens_hoy: number; tokens_7d: number; llamadas: number };
  tenants: Tenant[];
  modelos: Modelo[];
  serie: Serie[];
  tarifas: Record<string, { in: number; out: number }>;
};

const usd = (n: number) => "US$" + (n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n: number) => (n ?? 0).toLocaleString("es-AR");

export default function MonitoreoPage() {
  const { show, node } = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setD(await api("/api/monitoreo", "GET"));
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    load();
  }, [load]);

  const maxSerie = Math.max(1, ...(d?.serie || []).map((s) => s.costo));

  return (
    <div className="min-h-screen bg-background">
      {node}
      <div className="max-w-5xl mx-auto py-8 px-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2">
              <ArrowLeft className="w-4 h-4" /> Volver al Dashboard
            </Link>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" /> Monitoreo de consumo
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Gasto de OpenAI por cliente, modelos y quota. Datos de uso_tokens.</p>
          </div>
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-secondary hover:bg-secondary/80 text-foreground">
            <RefreshCw className={"w-4 h-4 " + (loading ? "animate-spin" : "")} /> Actualizar
          </button>
        </div>

        {!d ? (
          <div className="text-muted-foreground text-sm">{loading ? "Cargando…" : "Sin datos."}</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Card icon={<DollarSign className="w-4 h-4" />} label="Costo del mes" value={usd(d.totales.costo_mes)} sub={`histórico ${usd(d.totales.costo_total)}`} />
              <Card icon={<Cpu className="w-4 h-4" />} label="Tokens hoy" value={num(d.totales.tokens_hoy)} sub={`7d ${num(d.totales.tokens_7d)}`} />
              <Card icon={<Activity className="w-4 h-4" />} label="Llamadas al LLM" value={num(d.totales.llamadas)} sub="histórico" />
              <Card icon={<DollarSign className="w-4 h-4" />} label="Clientes activos" value={String(d.tenants.length)} sub="con consumo" />
            </div>

            {/* Por tenant */}
            <Section title="Consumo por cliente (mes actual)">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-4 font-medium">Cliente</th>
                      <th className="py-2 px-2 font-medium text-right">Tokens (mes)</th>
                      <th className="py-2 px-2 font-medium">Quota</th>
                      <th className="py-2 px-2 font-medium text-right">Costo mes</th>
                      <th className="py-2 px-2 font-medium text-right">Costo hist.</th>
                      <th className="py-2 pl-2 font-medium text-right">Llamadas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.tenants.map((t) => (
                      <tr key={t.tenant} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-medium text-foreground">{t.tenant}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-foreground">{num(t.tokens_mes)}</td>
                        <td className="py-2 px-2 w-40">{quotaBar(t)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-foreground">{usd(t.costo_mes)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{usd(t.costo_total)}</td>
                        <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">{num(t.llamadas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">El límite de tokens/mes se configura por agente (columna limite_tokens_mes). Sin límite = sin barra.</p>
            </Section>

            {/* Serie diaria */}
            <Section title="Costo por día (14 días)">
              <div className="flex items-end gap-1 h-32">
                {d.serie.map((s) => (
                  <div key={s.dia} className="flex-1 flex flex-col items-center justify-end group relative">
                    <div className="w-full bg-primary/70 rounded-t hover:bg-primary transition-colors" style={{ height: `${Math.max(2, (s.costo / maxSerie) * 100)}%` }} />
                    <span className="absolute -top-5 text-[10px] text-foreground opacity-0 group-hover:opacity-100 whitespace-nowrap">{usd(s.costo)}</span>
                    <span className="text-[9px] text-muted-foreground mt-1">{s.dia.slice(5)}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Modelos */}
            <Section title="Por modelo">
              <div className="space-y-2">
                {d.modelos.map((m) => (
                  <div key={m.modelo} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{m.modelo}</span>
                    <span className="text-muted-foreground tabular-nums">{num(m.tokens)} tok · {num(m.llamadas)} llam · <span className="text-foreground">{usd(m.costo)}</span></span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Tarifas */}
            <div className="mt-6 flex items-start gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
              <div>
                Costos <b>estimados</b> con tarifas asumidas (USD por millón de tokens, in/out):{" "}
                {Object.entries(d.tarifas).filter(([k]) => k !== "default").map(([k, v]) => `${k} ${v.in}/${v.out}`).join(" · ")}.
                Ajustá los valores reales en <code>web/app/api/monitoreo/route.ts</code> (constante PRECIOS).
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Card({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">{icon}{label}</div>
      <div className="text-xl font-semibold text-foreground mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">{title}</h2>
      {children}
    </div>
  );
}

function quotaBar(t: Tenant) {
  if (!t.limite_tokens_mes || t.pct_quota == null) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.min(100, t.pct_quota);
  const color = t.pct_quota >= 90 ? "bg-red-500" : t.pct_quota >= 70 ? "bg-amber-500" : "bg-primary";
  return (
    <div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={"h-full rounded-full " + color} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{t.pct_quota}% de {num(t.limite_tokens_mes)}</span>
    </div>
  );
}
