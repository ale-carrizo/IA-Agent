// Helpers del dominio de licitaciones para el panel.
//
// Frontera (§4 del brief): el panel VISUALIZA, resuelve excepciones, aprueba y
// exporta. No ejecuta lógica de negociación. Por eso lee la matriz directo de
// Postgres (que es la fuente de verdad) pero delega en el servicio Python todo
// lo que decide algo: crear una licitación, reanudar un interrupt, aprobar.

export const NEGOCIACION_URL = process.env.NEGOCIACION_URL ?? "";
const NEGOCIACION_TOKEN = process.env.NEGOCIACION_TOKEN ?? "";

export class ServicioNoConfigurado extends Error {
  constructor() {
    super("NEGOCIACION_URL no está configurada en el panel");
  }
}

/** Llama al servicio de negociación. Lanza si no está configurado. */
export async function servicio(
  ruta: string,
  init?: { method?: string; body?: unknown; timeoutMs?: number }
): Promise<unknown> {
  if (!NEGOCIACION_URL) throw new ServicioNoConfigurado();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 120_000);
  try {
    const r = await fetch(`${NEGOCIACION_URL.replace(/\/$/, "")}${ruta}`, {
      method: init?.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(NEGOCIACION_TOKEN ? { "x-token": NEGOCIACION_TOKEN } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
    const texto = await r.text();
    const datos = texto ? JSON.parse(texto) : {};
    if (!r.ok) {
      const err = new Error(
        (datos?.detail?.motivo as string) || (datos?.detail as string) || `HTTP ${r.status}`
      );
      (err as Error & { estado?: number; datos?: unknown }).estado = r.status;
      (err as Error & { estado?: number; datos?: unknown }).datos = datos;
      throw err;
    }
    return datos;
  } finally {
    clearTimeout(t);
  }
}

// ─── Estados de celda de la matriz ────────────────────────────────────────────
// Los colores del brief (§7): verde precio confirmado / ámbar esperando /
// azul llamando / gris reintento / rojo revisar unidad.

export type EstadoCotizacion =
  | "pendiente"
  | "solicitada"
  | "esperando"
  | "aclarando"
  | "confirmada"
  | "sin_stock"
  | "vencida"
  | "descartada"
  | "excepcion_humana";

export const ESTADO_LABEL: Record<EstadoCotizacion, string> = {
  pendiente: "Sin pedir",
  solicitada: "Pedido",
  esperando: "Esperando",
  aclarando: "Revisar unidad",
  confirmada: "Confirmado",
  sin_stock: "Sin stock",
  vencida: "Sin respuesta",
  descartada: "Descartado",
  excepcion_humana: "Revisar",
};

/** Clases Tailwind de la celda. Una sola fuente para matriz y leyenda. */
export const ESTADO_CLASE: Record<EstadoCotizacion, string> = {
  confirmada: "bg-emerald-50 text-emerald-800 border-emerald-200",
  esperando: "bg-amber-50 text-amber-800 border-amber-200",
  solicitada: "bg-amber-50/60 text-amber-700 border-amber-200",
  aclarando: "bg-rose-50 text-rose-800 border-rose-200",
  excepcion_humana: "bg-violet-50 text-violet-800 border-violet-200",
  sin_stock: "bg-slate-100 text-slate-500 border-slate-200",
  vencida: "bg-slate-100 text-slate-400 border-slate-200",
  descartada: "bg-slate-100 text-slate-400 border-slate-200 line-through",
  pendiente: "bg-white text-slate-400 border-slate-200",
};

export function formatearPrecio(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Cuenta atrás legible para el header de la matriz. */
export function cuentaRegresiva(hasta: string | Date, ahora: Date = new Date()): string {
  const ms = new Date(hasta).getTime() - ahora.getTime();
  if (Number.isNaN(ms)) return "—";
  if (ms <= 0) return "cerrada";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
