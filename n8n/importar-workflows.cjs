#!/usr/bin/env node
/**
 * Importa los workflows de este repo a una instancia de n8n vía API pública.
 *
 * Idempotente por NOMBRE: si ya existe un workflow con el mismo `name`, lo
 * actualiza en vez de duplicarlo. Un workflow puede además fijarse a un id
 * concreto (ver DESTINO_FIJO) para conservar una URL que el usuario ya tiene
 * abierta o marcada.
 *
 * Uso:
 *   N8N_URL=https://tu-n8n.tld N8N_API_KEY=... \
 *     node n8n/importar-workflows.cjs [grupo|archivo.json ...] [--activar] [--dry-run]
 *
 *   grupos:  motor        los 7 workflows del motor de agentes
 *            licitaciones los 3 de transporte del dominio nuevo
 *            todo         motor + licitaciones (default)
 *
 * Sustitución de valores (opcional):
 *   Los JSON usan `{{ $env.X }}` para no atarse a un entorno. Si tu n8n no
 *   expone variables de proceso a los nodos (Hostinger, n8n Cloud, o
 *   N8N_BLOCK_ENV_ACCESS_IN_NODE=true), pasá un mapa de reemplazos literales:
 *
 *   N8N_SUBST='{"{{ $env.NEGOCIACION_URL }}":"https://negociacion.up.railway.app"}'
 *
 *   Se aplica sobre los nodos serializados, justo antes de subirlos. El repo
 *   queda portable; la instancia queda con valores concretos.
 *
 * Remapeo de credenciales (OBLIGATORIO):
 *   Los JSON no traen ids de credencial reales: usan los placeholders
 *   POSTGRES_CRED_ID y OPENAI_CRED_ID. Sin el mapa, los nodos quedan en rojo
 *   hasta asignarles credencial a mano. Pasá los ids de TU instancia:
 *
 *   N8N_CRED_MAP='{"POSTGRES_CRED_ID":"idRealPostgres","OPENAI_CRED_ID":"idRealOpenAI"}'
 *
 * La API key y el mapa NUNCA se hardcodean acá: salen del entorno.
 */

const fs = require("fs");
const path = require("path");

const GRUPOS = {
  motor: [
    "motor-agente.json",
    "scheduler-followups.json",
    "scheduler-agendas.json",
    "kb-ingesta.json",
    "insights-ia.json",
    "pulido-ia.json",
    "sync-uso-tokens.json",
  ],
  licitaciones: [
    "licitaciones-inbound.json",
    "licitaciones-tick.json",
    "licitaciones-salida.json",
  ],
};
GRUPOS.todo = [...GRUPOS.motor, ...GRUPOS.licitaciones];

/**
 * Workflows que van a un id EXISTENTE en vez de crearse nuevos.
 * El motor va al workflow que el usuario ya tenía abierto ("MOTOR IA AGENT"),
 * así su URL sigue sirviendo y no le quedan dos canvas con lo mismo.
 * Se respeta el nombre que ya tiene ese workflow en la instancia.
 */
const DESTINO_FIJO = {
  "motor-agente.json": process.env.N8N_ID_MOTOR || "",
};

const BASE = (process.env.N8N_URL || "").replace(/\/+$/, "");
const KEY = process.env.N8N_API_KEY || "";
const ACTIVAR = process.argv.includes("--activar");
const DRY = process.argv.includes("--dry-run");
const CRED_MAP = JSON.parse(process.env.N8N_CRED_MAP || "{}");
const SUBST = JSON.parse(process.env.N8N_SUBST || "{}");

const pedidos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ARCHIVOS = pedidos.length
  ? pedidos.flatMap((p) => GRUPOS[p] || [p])
  : GRUPOS.todo;

if (!BASE || !KEY) {
  console.error("Faltan N8N_URL y/o N8N_API_KEY en el entorno.");
  process.exit(1);
}

async function api(ruta, opciones = {}) {
  const r = await fetch(`${BASE}/api/v1${ruta}`, {
    ...opciones,
    headers: { "X-N8N-API-KEY": KEY, "content-type": "application/json", ...(opciones.headers || {}) },
  });
  const texto = await r.text();
  let datos;
  try {
    datos = texto ? JSON.parse(texto) : {};
  } catch {
    datos = { raw: texto.slice(0, 300) };
  }
  if (!r.ok) {
    const e = new Error(datos.message || `HTTP ${r.status}`);
    e.estado = r.status;
    e.datos = datos;
    throw e;
  }
  return datos;
}

/**
 * La API pública valida `settings` contra un schema cerrado: cualquier clave
 * que no esté acá hace fallar el request entero. Las que se caen (binaryMode,
 * availableInMCP, callerPolicy…) se setean a mano en la UI del workflow.
 */
const SETTINGS_PERMITIDOS = new Set([
  "executionOrder",
  "timezone",
  "errorWorkflow",
  "executionTimeout",
  "saveExecutionProgress",
  "saveManualExecutions",
  "saveDataErrorExecution",
  "saveDataSuccessExecution",
]);

function filtrarSettings(settings, descartadas) {
  const salida = {};
  for (const [k, v] of Object.entries(settings || {})) {
    if (SETTINGS_PERMITIDOS.has(k)) salida[k] = v;
    else descartadas.add(k);
  }
  if (!salida.executionOrder) salida.executionOrder = "v1";
  return salida;
}

/** Reescribe los ids de credencial según N8N_CRED_MAP. Devuelve los que quedaron sin mapear. */
/** Reemplazos literales sobre los nodos. Devuelve cuántos aplicó cada uno. */
function sustituir(nodes, aplicados) {
  const entradas = Object.entries(SUBST);
  if (!entradas.length) return nodes;
  let texto = JSON.stringify(nodes);
  for (const [de, a] of entradas) {
    const partes = texto.split(de);
    if (partes.length > 1) {
      aplicados.set(de, (aplicados.get(de) || 0) + partes.length - 1);
      texto = partes.join(a);
    }
  }
  return JSON.parse(texto);
}

function remapearCredenciales(nodes) {
  const pendientes = new Map();
  for (const n of nodes) {
    for (const [tipo, ref] of Object.entries(n.credentials || {})) {
      const nuevo = CRED_MAP[ref.id];
      if (nuevo) {
        ref.id = nuevo;
      } else {
        pendientes.set(`${tipo}:${ref.name}`, (pendientes.get(`${tipo}:${ref.name}`) || 0) + 1);
      }
    }
  }
  return pendientes;
}

async function main() {
  const { data: existentes } = await api("/workflows?limit=250");
  const porNombre = new Map(existentes.map((w) => [w.name, w]));
  const porId = new Map(existentes.map((w) => [w.id, w]));

  const faltantes = new Map();
  const settingsDescartados = new Set();
  const sustituidos = new Map();
  let creados = 0;
  let actualizados = 0;

  for (const archivo of ARCHIVOS) {
    const ruta = path.join(__dirname, archivo);
    if (!fs.existsSync(ruta)) {
      console.warn(`⚠  no existe ${archivo}, se saltea`);
      continue;
    }
    const wf = JSON.parse(fs.readFileSync(ruta, "utf8"));
    wf.nodes = sustituir(wf.nodes, sustituidos);

    for (const [k, v] of remapearCredenciales(wf.nodes)) {
      faltantes.set(k, (faltantes.get(k) || 0) + v);
    }

    // Destino: id fijo > mismo nombre > nuevo.
    const idFijo = DESTINO_FIJO[archivo];
    const destino = (idFijo && porId.get(idFijo)) || porNombre.get(wf.name) || null;

    const cuerpo = {
      // Si vamos a un workflow existente, respetamos SU nombre: es el que el
      // usuario eligió y tiene abierto.
      name: destino ? destino.name : wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: filtrarSettings(wf.settings, settingsDescartados),
    };

    if (DRY) {
      console.log(
        `[dry-run] ${destino ? "actualizaría" : "crearía"}  ${cuerpo.name}  (${wf.nodes.length} nodos)` +
          (destino ? `  id ${destino.id}` : "")
      );
      continue;
    }

    let guardado;
    if (destino) {
      guardado = await api(`/workflows/${destino.id}`, { method: "PUT", body: JSON.stringify(cuerpo) });
      actualizados++;
      console.log(`↻ ${cuerpo.name.padEnd(38)} ${wf.nodes.length.toString().padStart(3)} nodos  id ${guardado.id}`);
    } else {
      guardado = await api("/workflows", { method: "POST", body: JSON.stringify(cuerpo) });
      creados++;
      console.log(`+ ${cuerpo.name.padEnd(38)} ${wf.nodes.length.toString().padStart(3)} nodos  id ${guardado.id}`);
    }

    if (ACTIVAR) {
      try {
        await api(`/workflows/${guardado.id}/activate`, { method: "POST" });
        console.log("    → activado");
      } catch (e) {
        console.warn(`    ⚠ no se pudo activar: ${e.message}`);
      }
    }
  }

  if (DRY) return;

  console.log(`\n${creados} creados, ${actualizados} actualizados.`);

  if (sustituidos.size) {
    console.log("\nSustituciones aplicadas:");
    for (const [de, n] of sustituidos) console.log(`  · ${de}  → ${n} vez/veces`);
  }

  if (settingsDescartados.size) {
    console.log(
      `\nSettings que la API no acepta y hay que poner a mano en la UI: ${[...settingsDescartados].join(", ")}`
    );
  }

  if (faltantes.size) {
    console.log("\nCredenciales sin resolver (los nodos quedan marcados hasta asignarlas):");
    for (const [k, n] of [...faltantes].sort()) {
      const [tipo, nombre] = k.split(/:(.*)/);
      console.log(`  · ${tipo.padEnd(16)} "${nombre}"  — ${n} nodo(s)`);
    }
    console.log("  Creá la credencial en n8n y volvé a correr con N8N_CRED_MAP para reescribir los ids.");
  }
  if (!ACTIVAR) console.log("\nQuedaron INACTIVOS. Activalos cuando las credenciales estén cargadas.");
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  if (e.datos) console.error(JSON.stringify(e.datos).slice(0, 400));
  process.exit(1);
});
