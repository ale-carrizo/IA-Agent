"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Clock, Plus, RefreshCw } from "lucide-react";

import { cuentaRegresiva } from "@/lib/licitaciones";
import { useToast } from "@/lib/ui";

type Licitacion = {
  id: number;
  hospital: string;
  expediente: string | null;
  estado: string;
  margen_pct: string;
  cierre_presentacion: string;
  cierre_recoleccion: string;
  items: number;
  cotizaciones: number;
  confirmadas: number;
  excepciones: number;
  items_cubiertos: number;
};

const ESTADO_BADGE: Record<string, string> = {
  abierta: "badge blue",
  recolectando: "badge blue",
  auditando: "badge amber",
  aprobada: "badge green",
  presentada: "badge green",
  ganada: "badge green",
  perdida: "badge",
};

export default function LicitacionesPage() {
  const [datos, setDatos] = useState<Licitacion[]>([]);
  const [migrado, setMigrado] = useState(true);
  const [cargando, setCargando] = useState(true);
  const { show, node } = useToast();

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/licitaciones", { cache: "no-store" });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setDatos(j.licitaciones ?? []);
      setMigrado(j.migrado !== false);
    } catch (e) {
      show(e instanceof Error ? e.message : "no se pudo cargar", true);
    } finally {
      setCargando(false);
    }
  }, [show]);

  useEffect(() => {
    void cargar();
    const t = setInterval(() => void cargar(), 15_000);
    return () => clearInterval(t);
  }, [cargar]);

  return (
    <div className="content" style={{ maxWidth: 1100 }}>
      {node}

      <Link href="/" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="w-3.5 h-3.5" /> Volver al dashboard
      </Link>

      <div className="row">
        <div>
          <h1>Licitaciones</h1>
          <p className="sub">
            Recolección de precios por WhatsApp. Los agentes juntan y comparan; la aprobación
            es siempre de una persona.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn ghost sm" onClick={() => void cargar()}>
            <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Actualizar
          </button>
          <Link className="btn primary sm" href="/licitaciones/nueva">
            <Plus className="w-3.5 h-3.5 inline mr-1" /> Cargar pliego
          </Link>
        </div>
      </div>

      {!migrado && (
        <div className="card" style={{ borderColor: "hsl(var(--warning))" }}>
          <strong>Falta la migración.</strong>{" "}
          <span className="muted">
            Corré <code className="mono">db/20-licitaciones.sql</code> (y{" "}
            <code className="mono">db/21-licitaciones-seed.sql</code> si querés datos de prueba)
            contra la base del motor.
          </span>
        </div>
      )}

      {cargando ? (
        <div className="empty">Cargando…</div>
      ) : datos.length === 0 ? (
        <div className="empty">
          Todavía no hay licitaciones cargadas.
          <br />
          <Link className="btn primary sm mt-3 inline-block" href="/licitaciones/nueva">
            Cargar la primera
          </Link>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Hospital</th>
                <th>Estado</th>
                <th>Cobertura</th>
                <th>Precios</th>
                <th>Excepciones</th>
                <th>Cierre recolección</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {datos.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link href={`/licitaciones/${l.id}`} className="font-semibold">
                      {l.hospital}
                    </Link>
                    {l.expediente && <div className="muted text-[11px]">Exp. {l.expediente}</div>}
                  </td>
                  <td>
                    <span className={ESTADO_BADGE[l.estado] ?? "badge"}>{l.estado}</span>
                  </td>
                  <td className="tabular-nums">
                    {l.items_cubiertos}/{l.items} ítems
                  </td>
                  <td className="tabular-nums">
                    {l.confirmadas}/{l.cotizaciones}
                  </td>
                  <td>
                    {l.excepciones > 0 ? (
                      <span className="badge amber">
                        <AlertTriangle className="w-3 h-3 inline mr-1" />
                        {l.excepciones}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <Clock className="w-3.5 h-3.5 inline mr-1 opacity-50" />
                    {["abierta", "recolectando"].includes(l.estado)
                      ? cuentaRegresiva(l.cierre_recoleccion)
                      : new Date(l.cierre_recoleccion).toLocaleString("es-AR")}
                  </td>
                  <td>
                    <Link className="btn ghost sm" href={`/licitaciones/${l.id}`}>
                      Ver matriz
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
