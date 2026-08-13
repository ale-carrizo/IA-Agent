"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Phone,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import {
  ESTADO_CLASE,
  ESTADO_LABEL,
  cuentaRegresiva,
  formatearPrecio,
  type EstadoCotizacion,
} from "@/lib/licitaciones";
import { api, useToast } from "@/lib/ui";

// ─── Types ───────────────────────────────────────────────────────────────────

type Item = {
  id: number;
  descripcion_original: string;
  producto: string;
  cantidad: number;
  presentacion_requerida: string;
  precio_objetivo: string | null;
  precio_max_aceptable: string | null;
  mejor_precio: number | null;
  mejor_proveedor_id: number | null;
  precio_con_margen: number | null;
  confirmadas: number;
};

type Proveedor = { id: number; nombre: string; telefono_e164: string; contacto: string | null };

type Celda = {
  id: number;
  item_id: number;
  proveedor_id: number;
  estado: EstadoCotizacion;
  precio_unitario: string | null;
  presentacion_ofrecida: string | null;
  confianza: string | null;
  raw_respuesta: string | null;
  condiciones: Record<string, unknown>;
  thread_id: string | null;
  a_llamar: boolean;
};

type Matriz = {
  licitacion: {
    id: number;
    hospital: string;
    estado: string;
    margen_pct: string;
    cierre_recoleccion: string;
    cierre_presentacion: string;
  };
  items: Item[];
  proveedores: Proveedor[];
  celdas: Celda[];
};

type Excepcion = {
  id: number;
  thread_id: string;
  cotizacion_id: number | null;
  tipo: string;
  motivo: string;
  contexto: { texto_proveedor?: string; movida?: Record<string, unknown> };
  proveedor: string | null;
  descripcion_original: string | null;
  presentacion_requerida: string | null;
  precio_unitario: string | null;
  precio_objetivo: string | null;
  precio_max_aceptable: string | null;
  raw_respuesta: string | null;
  creado: string;
};

type Auditoria = {
  aprobable: boolean;
  items: number;
  items_cubiertos: number;
  bloqueos: { check: string; item?: string; motivo: string }[];
  advertencias: { check: string; item?: string; motivo: string }[];
};

type Pestana = "matriz" | "excepciones" | "auditoria";

// ─── Página ──────────────────────────────────────────────────────────────────

export default function LicitacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [pestana, setPestana] = useState<Pestana>("matriz");
  const [matriz, setMatriz] = useState<Matriz | null>(null);
  const [excepciones, setExcepciones] = useState<Excepcion[]>([]);
  const [auditoria, setAuditoria] = useState<Auditoria | null>(null);
  const [detalle, setDetalle] = useState<Celda | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const { show, node } = useToast();

  const cargar = useCallback(async () => {
    try {
      const [m, e] = await Promise.all([
        fetch(`/api/licitaciones/${id}/matriz`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/excepciones?licitacion_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (m.error) throw new Error(m.error);
      setMatriz(m);
      setExcepciones(e.excepciones ?? []);
    } catch (err) {
      show(err instanceof Error ? err.message : "no se pudo cargar", true);
    }
  }, [id, show]);

  const cargarAuditoria = useCallback(async () => {
    try {
      const a = await fetch(`/api/licitaciones/${id}/auditoria`, { cache: "no-store" }).then((r) => r.json());
      setAuditoria(a.error ? null : a);
      if (a.error) show(a.error, true);
    } catch {
      setAuditoria(null);
    }
  }, [id, show]);

  // V1: polling cada 5 s (§7 del brief). El canal NOTIFY ya está publicado en
  // db/20 para cuando esto pase a SSE.
  useEffect(() => {
    void cargar();
    const t = setInterval(() => void cargar(), 5_000);
    return () => clearInterval(t);
  }, [cargar]);

  useEffect(() => {
    if (pestana === "auditoria") void cargarAuditoria();
  }, [pestana, cargarAuditoria]);

  const celdaDe = useMemo(() => {
    const mapa = new Map<string, Celda>();
    for (const c of matriz?.celdas ?? []) mapa.set(`${c.item_id}:${c.proveedor_id}`, c);
    return mapa;
  }, [matriz]);

  async function resolver(ex: Excepcion, accion: string, motivo: string) {
    setOcupado(true);
    try {
      await api("/api/excepciones", "POST", {
        excepcion_id: ex.id,
        thread_id: ex.thread_id,
        cotizacion_id: ex.cotizacion_id,
        accion,
        motivo,
      });
      show("Excepción resuelta");
      await cargar();
      if (pestana === "auditoria") await cargarAuditoria();
    } catch (e) {
      show(e instanceof Error ? e.message : "no se pudo resolver", true);
    } finally {
      setOcupado(false);
    }
  }

  async function aprobar() {
    setOcupado(true);
    try {
      const r = await api(`/api/licitaciones/${id}/aprobar`, "POST", {});
      show(`Presupuesto aprobado — total ${formatearPrecio((r as { total: string }).total)}`);
      await cargar();
      await cargarAuditoria();
    } catch (e) {
      show(e instanceof Error ? e.message : "la auditoría bloquea la aprobación", true);
      await cargarAuditoria();
    } finally {
      setOcupado(false);
    }
  }

  if (!matriz) return <div className="content empty">Cargando…</div>;

  const lic = matriz.licitacion;
  const abierta = ["abierta", "recolectando"].includes(lic.estado);

  return (
    <div className="content" style={{ maxWidth: 1400 }}>
      {node}

      <Link
        href="/licitaciones"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Todas las licitaciones
      </Link>

      {/* Header con el countdown: la información que gobierna todo el día */}
      <div className="row">
        <div>
          <h1>{lic.hospital}</h1>
          <p className="sub">
            {matriz.items.length} ítems · {matriz.proveedores.length} proveedores · margen{" "}
            {lic.margen_pct}% · <span className="badge">{lic.estado}</span>
          </p>
        </div>
        <div className="text-right">
          <div className="muted text-[11px] uppercase tracking-wide">
            {abierta ? "Cierra la recolección en" : "Recolección cerrada"}
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            <Clock className="w-5 h-5 inline mr-1.5 opacity-40" />
            {abierta ? cuentaRegresiva(lic.cierre_recoleccion) : "—"}
          </div>
          <div className="muted text-[11px]">
            Presentación: {new Date(lic.cierre_presentacion).toLocaleString("es-AR")}
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={"tab" + (pestana === "matriz" ? " active" : "")} onClick={() => setPestana("matriz")}>
          Matriz en vivo
        </button>
        <button
          className={"tab" + (pestana === "excepciones" ? " active" : "")}
          onClick={() => setPestana("excepciones")}
        >
          Excepciones {excepciones.length > 0 && <span className="badge amber ml-1">{excepciones.length}</span>}
        </button>
        <button
          className={"tab" + (pestana === "auditoria" ? " active" : "")}
          onClick={() => setPestana("auditoria")}
        >
          Auditoría y aprobación
        </button>
        <button className="tab ml-auto" onClick={() => void cargar()} title="Actualizar">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ─── Matriz ─────────────────────────────────────────────────── */}
      {pestana === "matriz" && (
        <>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Ítem</th>
                  <th style={{ width: 70 }}>Cant.</th>
                  {matriz.proveedores.map((p) => (
                    <th key={p.id} style={{ minWidth: 130 }} title={p.telefono_e164}>
                      {p.nombre}
                    </th>
                  ))}
                  <th style={{ minWidth: 130 }}>Oferta final</th>
                </tr>
              </thead>
              <tbody>
                {matriz.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="font-semibold">{item.producto}</div>
                      <div className="muted text-[11px]">{item.presentacion_requerida}</div>
                      {item.precio_max_aceptable && (
                        <div className="muted text-[11px]">
                          objetivo {formatearPrecio(item.precio_objetivo)} · máx{" "}
                          {formatearPrecio(item.precio_max_aceptable)}
                        </div>
                      )}
                    </td>
                    <td className="tabular-nums">{item.cantidad}</td>

                    {matriz.proveedores.map((p) => {
                      const c = celdaDe.get(`${item.id}:${p.id}`);
                      if (!c) return <td key={p.id} className="text-center muted">·</td>;
                      const mejor = item.mejor_proveedor_id === p.id;
                      return (
                        <td key={p.id}>
                          <button
                            onClick={() => setDetalle(c)}
                            className={`w-full text-left rounded-md border px-2 py-1.5 text-[12px] transition ${
                              ESTADO_CLASE[c.estado]
                            } ${mejor ? "ring-2 ring-emerald-400" : ""}`}
                            title={c.raw_respuesta ?? ESTADO_LABEL[c.estado]}
                          >
                            <div className="font-semibold tabular-nums">
                              {c.precio_unitario ? formatearPrecio(c.precio_unitario) : ESTADO_LABEL[c.estado]}
                            </div>
                            {c.presentacion_ofrecida && (
                              <div className="opacity-70 text-[10px]">{c.presentacion_ofrecida}</div>
                            )}
                            {c.a_llamar && ["solicitada", "esperando", "aclarando"].includes(c.estado) && (
                              <div className="text-[10px] font-semibold flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3" /> llamalo
                              </div>
                            )}
                          </button>
                        </td>
                      );
                    })}

                    <td>
                      {item.precio_con_margen !== null ? (
                        <>
                          <div className="font-semibold tabular-nums">
                            {formatearPrecio(item.precio_con_margen)}
                          </div>
                          <div className="muted text-[11px]">
                            costo {formatearPrecio(item.mejor_precio)}
                            {item.confirmadas === 1 && " · sin comparación"}
                          </div>
                        </>
                      ) : (
                        <span className="badge amber">sin precio</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Leyenda />

          {detalle && <DetalleCelda celda={detalle} onCerrar={() => setDetalle(null)} />}
        </>
      )}

      {/* ─── Excepciones ────────────────────────────────────────────── */}
      {pestana === "excepciones" && (
        <div>
          {excepciones.length === 0 ? (
            <div className="empty">
              <CheckCircle2 className="w-6 h-6 inline mb-2 opacity-40" />
              <br />
              No hay nada esperando una decisión.
            </div>
          ) : (
            excepciones.map((ex) => (
              <div className="card" key={ex.id}>
                <div className="row">
                  <div>
                    <div className="font-semibold">
                      {ex.descripcion_original ?? "Ítem sin identificar"}
                      {ex.proveedor && <span className="muted"> · {ex.proveedor}</span>}
                    </div>
                    <div className="text-[13px] mt-1" style={{ color: "hsl(var(--destructive))" }}>
                      <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                      {ex.motivo}
                    </div>
                  </div>
                  <span className="badge">{new Date(ex.creado).toLocaleString("es-AR")}</span>
                </div>

                {/* El mensaje crudo, sin interpretar: es lo que el operador
                    necesita para decidir en 5 segundos. */}
                {(ex.raw_respuesta || ex.contexto?.texto_proveedor) && (
                  <div className="mono mt-2 p-2 rounded-md" style={{ background: "hsl(var(--muted))" }}>
                    {ex.raw_respuesta ?? ex.contexto?.texto_proveedor}
                  </div>
                )}

                <div className="muted text-[12px] mt-2">
                  {ex.precio_unitario && <>Precio leído: {formatearPrecio(ex.precio_unitario)} · </>}
                  {ex.precio_objetivo && <>objetivo {formatearPrecio(ex.precio_objetivo)} · </>}
                  {ex.precio_max_aceptable && <>máximo {formatearPrecio(ex.precio_max_aceptable)}</>}
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    className="btn green sm"
                    disabled={ocupado}
                    onClick={() => void resolver(ex, "aceptar", "aprobado por excepción desde el panel")}
                  >
                    Aceptar igual
                  </button>
                  <button
                    className="btn ghost sm"
                    disabled={ocupado}
                    onClick={() => void resolver(ex, "clarificar", "pedir aclaración al proveedor")}
                  >
                    Re-preguntar
                  </button>
                  <button
                    className="btn danger sm"
                    disabled={ocupado}
                    onClick={() => void resolver(ex, "descartar", "rechazado por condiciones")}
                  >
                    Descartar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── Auditoría ──────────────────────────────────────────────── */}
      {pestana === "auditoria" && (
        <div>
          {!auditoria ? (
            <div className="empty">Cargando la auditoría…</div>
          ) : (
            <>
              <div className="card">
                <div className="row">
                  <div>
                    <div className="font-semibold text-[15px]">
                      {auditoria.aprobable ? (
                        <>
                          <ShieldCheck className="w-4 h-4 inline mr-1.5" style={{ color: "hsl(var(--success))" }} />
                          Los checks pasan: se puede aprobar
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 inline mr-1.5" style={{ color: "hsl(var(--destructive))" }} />
                          {auditoria.bloqueos.length} bloqueo(s) impiden aprobar
                        </>
                      )}
                    </div>
                    <div className="muted text-[12px] mt-1">
                      {auditoria.items_cubiertos}/{auditoria.items} ítems con al menos un precio confirmado
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a className="btn ghost sm" href={`/api/licitaciones/${id}/export`}>
                      <Download className="w-3.5 h-3.5 inline mr-1" /> Exportar
                    </a>
                    <button
                      className="btn green"
                      disabled={!auditoria.aprobable || ocupado || lic.estado === "aprobada"}
                      onClick={() => void aprobar()}
                    >
                      {lic.estado === "aprobada" ? "Ya aprobada" : "Aprobar presupuesto"}
                    </button>
                  </div>
                </div>
              </div>

              <ListaChecks titulo="Bloqueos" items={auditoria.bloqueos} tono="destructive" />
              <ListaChecks titulo="Advertencias" items={auditoria.advertencias} tono="warning" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Leyenda() {
  const estados: EstadoCotizacion[] = [
    "confirmada",
    "esperando",
    "aclarando",
    "excepcion_humana",
    "sin_stock",
    "vencida",
  ];
  return (
    <div className="flex gap-3 flex-wrap mt-3 text-[11px]">
      {estados.map((e) => (
        <span key={e} className={`px-2 py-0.5 rounded border ${ESTADO_CLASE[e]}`}>
          {ESTADO_LABEL[e]}
        </span>
      ))}
    </div>
  );
}

function ListaChecks({
  titulo,
  items,
  tono,
}: {
  titulo: string;
  items: { check: string; item?: string; motivo: string }[];
  tono: "destructive" | "warning";
}) {
  if (items.length === 0) return null;
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{titulo}</h3>
      <ul className="space-y-1.5">
        {items.map((b, i) => (
          <li key={i} className="text-[13px]">
            <span className="badge" style={{ marginRight: 6 }}>
              {b.check}
            </span>
            {b.item && <strong>{b.item}: </strong>}
            <span style={{ color: `hsl(var(--${tono}))` }}>{b.motivo}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetalleCelda({ celda, onCerrar }: { celda: Celda; onCerrar: () => void }) {
  return (
    <div className="card mt-3">
      <div className="row">
        <h3 style={{ margin: 0 }}>Detalle de la cotización</h3>
        <button className="btn ghost sm" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
      <div className="grid2 mt-2 text-[13px]">
        <div>
          <div>
            <strong>Estado:</strong> {ESTADO_LABEL[celda.estado]}
          </div>
          <div>
            <strong>Precio unitario:</strong> {formatearPrecio(celda.precio_unitario)}
          </div>
          <div>
            <strong>Presentación ofrecida:</strong> {celda.presentacion_ofrecida ?? "—"}
          </div>
        </div>
        <div>
          <div>
            <strong>Confianza:</strong>{" "}
            {celda.confianza ? Number(celda.confianza).toFixed(2) : "—"}
          </div>
          <div>
            <strong>Condiciones:</strong>{" "}
            {Object.keys(celda.condiciones ?? {}).length
              ? JSON.stringify(celda.condiciones)
              : "estándar"}
          </div>
        </div>
      </div>
      {/* El texto crudo se guarda siempre: es el audit trail y la materia
          prima del golden dataset. */}
      {celda.raw_respuesta && (
        <>
          <h3>Mensaje original del proveedor</h3>
          <div className="mono p-2 rounded-md" style={{ background: "hsl(var(--muted))" }}>
            {celda.raw_respuesta}
          </div>
        </>
      )}
    </div>
  );
}
