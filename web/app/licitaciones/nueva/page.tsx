"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

import { api, useToast } from "@/lib/ui";

// Carga de un pliego. El panel sólo junta los datos: crear la licitación,
// armar las cotizaciones y disparar los primeros mensajes lo hace el servicio
// de negociación (§4 — el panel no ejecuta lógica de negociación).

type Linea = { descripcion: string; cantidad: string; presentacion: string };

const VACIA: Linea = { descripcion: "", cantidad: "", presentacion: "" };

export default function NuevaLicitacionPage() {
  const router = useRouter();
  const { show, node } = useToast();
  const [hospital, setHospital] = useState("");
  const [expediente, setExpediente] = useState("");
  const [cierrePresentacion, setCierrePresentacion] = useState("");
  const [cierreRecoleccion, setCierreRecoleccion] = useState("");
  const [margen, setMargen] = useState("18");
  const [lineas, setLineas] = useState<Linea[]>([{ ...VACIA }]);
  const [ocupado, setOcupado] = useState(false);

  function actualizar(i: number, campo: keyof Linea, valor: string) {
    setLineas((prev) => prev.map((l, j) => (i === j ? { ...l, [campo]: valor } : l)));
  }

  /** Pegar desde Excel: una línea por ítem, columnas separadas por tab. */
  function pegarDesdePlanilla(texto: string) {
    const filas = texto
      .split(/\r?\n/)
      .map((f) => f.split("\t").map((c) => c.trim()))
      .filter((c) => c.some(Boolean));
    if (filas.length < 2) return false;
    setLineas(
      filas.map(([descripcion, cantidad, presentacion]) => ({
        descripcion: descripcion ?? "",
        cantidad: (cantidad ?? "").replace(/\D/g, ""),
        presentacion: presentacion ?? "",
      }))
    );
    show(`${filas.length} ítems pegados`);
    return true;
  }

  async function guardar() {
    const items = lineas
      .filter((l) => l.descripcion.trim() && Number(l.cantidad) > 0)
      .map((l) => ({
        descripcion: l.descripcion.trim(),
        cantidad: Number(l.cantidad),
        presentacion: l.presentacion.trim(),
      }));

    if (!hospital.trim()) return show("Falta el hospital", true);
    if (!cierrePresentacion) return show("Falta la hora de cierre de presentación", true);
    if (items.length === 0) return show("Cargá al menos un ítem con cantidad", true);

    setOcupado(true);
    try {
      const r = (await api("/api/licitaciones", "POST", {
        hospital: hospital.trim(),
        expediente: expediente.trim() || null,
        cierre_presentacion: new Date(cierrePresentacion).toISOString(),
        cierre_recoleccion: cierreRecoleccion ? new Date(cierreRecoleccion).toISOString() : null,
        margen_pct: Number(margen) || 0,
        items,
      })) as { licitacion_id: number; cotizaciones: number; items_sin_match: unknown[] };

      const sinMatch = r.items_sin_match?.length ?? 0;
      show(
        `Licitación creada: ${r.cotizaciones} pedidos de precio` +
          (sinMatch ? ` · ${sinMatch} ítem(s) sin match, revisá excepciones` : "")
      );
      router.push(`/licitaciones/${r.licitacion_id}`);
    } catch (e) {
      show(e instanceof Error ? e.message : "no se pudo crear", true);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="content" style={{ maxWidth: 1000 }}>
      {node}

      <Link
        href="/licitaciones"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Licitaciones
      </Link>

      <h1>Cargar pliego</h1>
      <p className="sub">
        Al guardar, el sistema matchea cada ítem contra el catálogo, arma un pedido por proveedor
        y sale a pedir precios. Los ítems que no matcheen quedan como excepción y no se piden.
      </p>

      <div className="card">
        <div className="grid2">
          <div className="field">
            <label>Hospital</label>
            <input className="input" value={hospital} onChange={(e) => setHospital(e.target.value)} />
          </div>
          <div className="field">
            <label>Expediente</label>
            <input className="input" value={expediente} onChange={(e) => setExpediente(e.target.value)} />
          </div>
          <div className="field">
            <label>Cierre de presentación</label>
            <div className="hint">La hora real del hospital.</div>
            <input
              className="input"
              type="datetime-local"
              value={cierrePresentacion}
              onChange={(e) => setCierrePresentacion(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Cierre de recolección</label>
            <div className="hint">
              Deadline interno: a esa hora se corta y se audita. Si lo dejás vacío, 2 h antes.
            </div>
            <input
              className="input"
              type="datetime-local"
              value={cierreRecoleccion}
              onChange={(e) => setCierreRecoleccion(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Margen (%)</label>
            <input className="input" value={margen} onChange={(e) => setMargen(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <h3 style={{ margin: 0 }}>Ítems del pliego</h3>
          <span className="muted text-[12px]">
            Tip: copiá las filas del Excel del hospital y pegalas en la primera descripción.
          </span>
        </div>

        <table className="tbl">
          <thead>
            <tr>
              <th>Descripción (texto del pliego)</th>
              <th style={{ width: 110 }}>Cantidad</th>
              <th style={{ width: 180 }}>Presentación</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="input"
                    value={l.descripcion}
                    placeholder="Amoxicilina 500 mg comprimido"
                    onChange={(e) => actualizar(i, "descripcion", e.target.value)}
                    onPaste={(e) => {
                      const texto = e.clipboardData.getData("text/plain");
                      if (texto.includes("\t") && pegarDesdePlanilla(texto)) e.preventDefault();
                    }}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    inputMode="numeric"
                    value={l.cantidad}
                    onChange={(e) => actualizar(i, "cantidad", e.target.value.replace(/\D/g, ""))}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    value={l.presentacion}
                    placeholder="caja x100"
                    onChange={(e) => actualizar(i, "presentacion", e.target.value)}
                  />
                </td>
                <td>
                  <button
                    className="btn danger sm"
                    onClick={() => setLineas((p) => (p.length === 1 ? [{ ...VACIA }] : p.filter((_, j) => j !== i)))}
                    title="Quitar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button className="btn ghost sm mt-2" onClick={() => setLineas((p) => [...p, { ...VACIA }])}>
          <Plus className="w-3.5 h-3.5 inline mr-1" /> Agregar ítem
        </button>
      </div>

      <div className="savebar">
        <button className="btn primary" disabled={ocupado} onClick={() => void guardar()}>
          {ocupado ? "Creando y pidiendo precios…" : "Crear y salir a pedir precios"}
        </button>
      </div>
    </div>
  );
}
