// Clasificador del Funnel de Leads: tipificación estilo contact center.
// Todo se deriva de datos que el motor ya genera; no hay caché que invalidar.
// El único dato manual es lead_estado/lead_notas (override desde el panel).

export const TIPIFICACIONES = [
  "interesado",
  "potencial",
  "responde",
  "no_responde",
  "no_contesta",
] as const;

export type Tipificacion = (typeof TIPIFICACIONES)[number];

export type Temperatura = "caliente" | "tibio" | "frio";

export type LeadRow = {
  etapa_orden: number | null;
  transbordado: boolean;
  ultima_actividad: string | Date | null;
  ultima_respuesta: string | Date | null; // último mensaje DEL LEAD (inbound)
  turnos: number;
  turnos_lead: number; // turnos con mensaje del lead (inbound reales)
  calif_nivel: number | null; // 0 ninguna | 1 sal | 2 sql (máxima alcanzada)
  ficha: Record<string, unknown> | null;
  lead_estado: string | null; // override manual
};

export type Clasificacion = {
  score: number;
  temperatura: Temperatura;
  tipificacion: Tipificacion;
  tip_manual: boolean;
  ficha_ok: number;
  ficha_total: number;
};

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

// Score 0-100 (temperatura): progreso en etapas (40) + completitud de ficha (30)
// + recencia de actividad (20) + engagement por turnos (10).
export function clasificarLead(
  lead: LeadRow,
  maxOrden: number,
  minOrden: number,
  varsDefinidas: string[]
): Clasificacion {
  const ficha = lead.ficha ?? {};
  const fichaTotal = varsDefinidas.length;
  const fichaOk = varsDefinidas.filter((v) => {
    const val = ficha[v];
    return val !== undefined && val !== null && String(val).trim() !== "";
  }).length;
  const fichaPct = fichaTotal > 0 ? fichaOk / fichaTotal : 0;

  const orden = lead.etapa_orden ?? minOrden;
  const rango = Math.max(maxOrden - minOrden, 1);
  const pProgreso = ((orden - minOrden) / rango) * 40;
  const pFicha = fichaPct * 30;

  const ult = lead.ultima_actividad ? new Date(lead.ultima_actividad).getTime() : 0;
  const dias = ult ? (Date.now() - ult) / DIA_MS : Infinity;
  const pRecencia = dias < 1 ? 20 : dias < 3 ? 12 : dias < 7 ? 6 : 0;

  const pEngage = Math.min(lead.turnos ?? 0, 10);

  const score = Math.round(Math.min(pProgreso + pFicha + pRecencia + pEngage, 100));
  const temperatura: Temperatura = score >= 70 ? "caliente" : score >= 40 ? "tibio" : "frio";

  // tipificación: el override manual del humano siempre gana
  let tipificacion: Tipificacion;
  let tip_manual = false;
  if ((TIPIFICACIONES as readonly string[]).includes(lead.lead_estado ?? "")) {
    tipificacion = lead.lead_estado as Tipificacion;
    tip_manual = true;
  } else {
    const respondio = (lead.turnos_lead ?? 0) > 0 || !!lead.ultima_respuesta;
    const ultResp = lead.ultima_respuesta ? new Date(lead.ultima_respuesta).getTime() : 0;
    const horasSilencio = ultResp ? (Date.now() - ultResp) / HORA_MS : Infinity;

    if (lead.transbordado || (lead.calif_nivel ?? 0) >= 2) {
      tipificacion = "interesado";
    } else if ((lead.calif_nivel ?? 0) >= 1 || (orden > minOrden && fichaPct >= 0.5)) {
      tipificacion = "potencial";
    } else if (!respondio) {
      tipificacion = "no_contesta";
    } else if (horasSilencio > 24) {
      tipificacion = "no_responde";
    } else {
      tipificacion = "responde";
    }
  }

  return { score, temperatura, tipificacion, tip_manual, ficha_ok: fichaOk, ficha_total: fichaTotal };
}
