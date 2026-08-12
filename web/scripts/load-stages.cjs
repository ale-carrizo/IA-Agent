// Carga/actualiza las 7 etapas de Guadalupe con su contenido y herramientas.
// Correr desde web/:  node scripts/load-stages.cjs
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const URL = process.env.DATABASE_URL; // export DATABASE_URL antes de correr (no hardcodear credenciales)
const A = "00000000-0000-0000-0000-0000000000a6";
const dir = path.join(__dirname, "stages-data");

const stages = [
  { orden: 1, nombre: "Preguntas Frecuentes – Diploma de Máster Universitario y Diplomados", calif: "ninguna",
    objetivo: "Guía de preguntas frecuentes sobre los Diploma de Máster Universitario y diplomados (inscripción, requisitos, duración, pagos, evaluaciones, certificación, morosidad, retiro, reingreso, descuentos). Nunca menciona precios.",
    file: "01-faq.md", tools: ["consulta_cursos", "transferir", "faq_kb"] },
  { orden: 2, nombre: "Apertura y Bienvenida", calif: "ninguna",
    objetivo: "Iniciar la conversación de forma consultiva, personalizada y humana, abriendo el diagnóstico del lead sin saturarlo en el primer mensaje.",
    file: "02-apertura.md", tools: ["consulta_cursos", "faq_kb"] },
  { orden: 3, nombre: "Sondeo y Diagnóstico", calif: "sal",
    objetivo: "Comprender el contexto profesional del lead hasta tener claros el área de interés y el formato de producto (Máster o Diplomado).",
    file: "03-sondeo.md", tools: ["consulta_cursos", "envio_links", "faq_kb"] },
  { orden: 4, nombre: "Presentación de la Oferta Académica de ANAHUAC", calif: "ninguna",
    objetivo: "Presentar la oferta académica destacando la propuesta de valor: programas premium 100% en línea, 3 diplomados en 12 meses; info institucional y formas de pago.",
    file: "04-oferta.md", tools: [] },
  { orden: 5, nombre: "Masters", calif: "ninguna",
    objetivo: "Detalle de los 8 Diploma de Máster Universitario: objetivos, perfiles, diplomados incluidos y docentes internacionales; más diplomados individuales.",
    file: "05-masters.md", tools: [] },
  { orden: 6, nombre: "Presentación de Cursos", calif: "ninguna",
    objetivo: "Presentar el/los programa(s) alineados al diagnóstico, en el formato correcto, para que el lead elija con claridad y avance.",
    file: "06-presentacion.md", tools: ["consulta_cursos", "transferir", "envio_links", "agendamiento"] },
  { orden: 7, nombre: "Transbordo para Especialista", calif: "sql",
    objetivo: "Transferir al asesor humano en el momento correcto, maximizando conversión y evitando fricción. Tras activar el transbordo, el bot se retira.",
    file: "07-transbordo.md", tools: ["transferir", "faq_kb"] },
];

(async () => {
  const db = new Pool({ connectionString: URL });
  // desactivar todas las etapas actuales del agente
  await db.query("update etapas set activo=false where agente_id=$1", [A]);
  for (const s of stages) {
    const reglas = fs.readFileSync(path.join(dir, s.file), "utf8");
    const { rows } = await db.query(
      `insert into etapas (agente_id, orden, nombre, objetivo, reglas, calificacion, activo, tipo)
       values ($1,$2,$3,$4,$5,$6,true,'personalizado')
       on conflict (agente_id, orden) do update
         set nombre=excluded.nombre, objetivo=excluded.objetivo, reglas=excluded.reglas,
             calificacion=excluded.calificacion, activo=true
       returning id`,
      [A, s.orden, s.nombre, s.objetivo, reglas, s.calif]
    );
    const eid = rows[0].id;
    await db.query("delete from etapa_herramientas where etapa_id=$1", [eid]);
    for (const clave of s.tools) {
      await db.query(
        "insert into etapa_herramientas (etapa_id, herramienta_id) select $1, id from herramientas where clave=$2 on conflict do nothing",
        [eid, clave]
      );
    }
    console.log(`#${s.orden} ${s.nombre}  [${s.tools.join(", ") || "sin tools"}] (${reglas.length} chars)`);
  }
  // limpiar etapas viejas inactivas que no están en 1..7 (ej. el Transbordo viejo en orden 11) si no están referenciadas
  await db.query("update conversaciones set etapa_actual_id=null where agente_id=$1 and etapa_actual_id in (select id from etapas where agente_id=$1 and activo=false)", [A]);
  console.log("Listo.");
  await db.end();
})().catch(e => { console.error(e.message); process.exit(1); });
