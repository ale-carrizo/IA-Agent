// Integración CRM (herramienta crm_push): presets, resolución de plantillas y envío.
// La config de cada integración es un jsonb editable desde el panel; los valores de la
// plantilla admiten placeholders que se resuelven contra la conversación:
//   {{telefono}} {{nombre_completo}} {{conversacion_id}} {{etapa}} {{agente}} {{ficha.<campo>}}
// Con default si el dato falta: {{ficha.email|No definido}}

export type CrmConfig = {
  url: string;
  metodo?: string;                        // por ahora siempre POST
  formato: "form" | "json";               // form -> x-www-form-urlencoded, json -> application/json
  headers?: Record<string, string>;       // headers extra (auth, api keys)
  campos_fijos?: Record<string, string>;  // campos literales del form (ej: idTask=42)
  campo_json?: string;                    // si está: la plantilla va serializada JSON dentro de este campo del form
  json_como_array?: boolean;              // envolver la plantilla en [ {...} ] (Neotel lo exige)
  plantilla: Record<string, string>;      // campos con placeholders
};

export type CrmContexto = {
  telefono: string;
  conversacion_id?: string;
  etapa?: string;
  agente?: string;
  ficha: Record<string, unknown>;
};

// ─── Presets ─────────────────────────────────────────────────────────────────

export const CRM_PRESETS: Record<string, { nombre: string; descripcion: string; config: CrmConfig }> = {
  neotel: {
    nombre: "Neotel",
    descripcion: "ExecuteTask01 vía POST form-urlencoded con param1 como JSON (formato UIC). Los nombres de campo con typos son intencionales: Neotel los espera así.",
    config: {
      url: "http://190.221.0.104/neoapi/webservice.asmx/ExecuteTask01",
      metodo: "POST",
      formato: "form",
      campos_fijos: { idTask: "42" },
      campo_json: "param1",
      json_como_array: true,
      plantilla: {
        IDLOTE: "1",
        USUARIO_PREASIGNADO: "****",
        TXTNOMBREAPELLIDO: "{{nombre_completo}}",
        TXTAPELLIDO: "{{ficha.apellido}}",
        EMLMAIL: "{{ficha.email}}",
        TELTELEFONO: "{{telefono}}",
        TELWHATSAPP: "{{telefono}}",
        TXTCARRETAINTERES: "{{ficha.carrera_interes|No definido}}",
        TXTMEDIUM: "CLICKTOWHATSAAP",
        TXTUTMSOURCE: "{{ficha.referral_source_type}}",
        TXTUTERM: "{{ficha.referral_ctwa_clid}}",
        TXTUTMCONTENT: "{{ficha.referral_source_id}}",
        TXTUTMORIGEN: "ClickToWhatsApp",
      },
    },
  },
  generico_json: {
    nombre: "Genérico JSON",
    descripcion: "POST application/json con el cuerpo armado desde la plantilla. Sirve para la mayoría de los CRMs modernos (HubSpot, webhooks, etc.).",
    config: {
      url: "https://",
      metodo: "POST",
      formato: "json",
      headers: {},
      plantilla: {
        nombre: "{{nombre_completo}}",
        email: "{{ficha.email}}",
        telefono: "{{telefono}}",
        interes: "{{ficha.carrera_interes}}",
        origen: "whatsapp-bot",
      },
    },
  },
  generico_form: {
    nombre: "Genérico Form",
    descripcion: "POST x-www-form-urlencoded con los campos de la plantilla directo en el body.",
    config: {
      url: "https://",
      metodo: "POST",
      formato: "form",
      campos_fijos: {},
      plantilla: {
        nombre: "{{nombre_completo}}",
        email: "{{ficha.email}}",
        telefono: "{{telefono}}",
      },
    },
  },
};

// ─── Resolución de plantilla ─────────────────────────────────────────────────

function valorDe(path: string, ctx: CrmContexto & { nombre_completo: string }): string {
  const partes = path.split(".");
  let cur: unknown = ctx;
  for (const p of partes) {
    cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[p] : undefined;
  }
  return cur == null ? "" : String(cur);
}

export function resolverPlantilla(plantilla: Record<string, string>, ctx: CrmContexto): Record<string, string> {
  const ficha = ctx.ficha || {};
  const nombre_completo =
    `${String(ficha.nombre ?? "")} ${String(ficha.apellido ?? "")}`.trim() ||
    String(ficha.nombre_perfil_wa ?? "").trim() ||
    "Nombre no definido"; // mismo fallback que usaba la acción de Botmaker
  const full = { ...ctx, nombre_completo };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(plantilla || {})) {
    out[k] = String(v).replace(/\{\{\s*([\w.]+)(?:\|([^}]*))?\s*\}\}/g, (_, p, def) => valorDe(p, full) || def || "");
  }
  return out;
}

// ─── Armado del request ──────────────────────────────────────────────────────

export function armarEnvio(config: CrmConfig, ctx: CrmContexto) {
  const plantilla = resolverPlantilla(config.plantilla, ctx);
  const json = JSON.stringify(config.json_como_array ? [plantilla] : plantilla);

  let body: string;
  let contentType: string;
  if (config.formato === "json") {
    body = json;
    contentType = "application/json";
  } else {
    const campos: Record<string, string> = { ...(config.campos_fijos || {}) };
    if (config.campo_json) campos[config.campo_json] = json;
    else Object.assign(campos, plantilla);
    body = new URLSearchParams(campos).toString();
    contentType = "application/x-www-form-urlencoded";
  }

  return {
    url: config.url,
    body,
    headers: { "Content-Type": contentType, ...(config.headers || {}) },
  };
}

// ─── Envío ───────────────────────────────────────────────────────────────────

export async function enviarCrm(config: CrmConfig, ctx: CrmContexto, timeoutMs = 15000) {
  const { url, body, headers } = armarEnvio(config, ctx);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: "POST", headers, body, signal: ac.signal });
    const respuesta = (await r.text()).slice(0, 2000);
    return { status: r.status, respuesta, exito: r.ok, payload: body };
  } catch (e) {
    return { status: 0, respuesta: (e as Error).message, exito: false, payload: body };
  } finally {
    clearTimeout(timer);
  }
}
