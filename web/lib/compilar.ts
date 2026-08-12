// Espejo en TS del compilador de n8n (n8n/compilador-prompt.js).
// Si cambiás uno, cambiá el otro. Idealmente, a futuro, el front consume
// este resultado y lo guarda en etapas.prompt_compilado para tener una sola fuente.

type Agente = {
  nombre: string; rol?: string; persona: string; tono: string;
  idioma: string; zona_horaria: string; long_max_mensaje: number; usar_emojis: boolean;
  usar_abreviaturas?: boolean; velocidad_respuesta?: string;
};
type Herr = { clave: string; nombre: string; descripcion?: string };
type Var = { nombre: string };
type Etapa = {
  nombre: string; objetivo?: string; tipo?: string; reglas?: string;
  tono_override?: string | null; herramientas?: Herr[]; variables?: Var[];
};

export function compilarPrompt(
  agente: Agente,
  etapa: Etapa,
  recolectadas: Record<string, unknown> = {}
): string {
  const tono = etapa.tono_override || agente.tono;

  const identidad = [
    `Eres ${agente.nombre}.`,
    agente.rol || "",
    `Persona: ${agente.persona}. Tono: ${tono}.`,
    `Idioma: ${agente.idioma}. Zona horaria: ${agente.zona_horaria}.`,
    `Longitud máxima por mensaje: ${agente.long_max_mensaje} caracteres.`,
    agente.usar_emojis ? "Podés usar emojis con moderación." : "No uses emojis.",
    agente.usar_abreviaturas
      ? "Podés usar abreviaturas informales de chat (tb, tmb, xq, porq, etc.)."
      : "No uses abreviaturas; escribí las palabras completas y correctas.",
    agente.velocidad_respuesta === "rápido" || agente.velocidad_respuesta === "rapido"
      ? "Respondé de forma breve, directa y al grano."
      : agente.velocidad_respuesta === "detallado" || agente.velocidad_respuesta === "lento"
      ? "Podés dar respuestas más detalladas y explicativas cuando aporte valor."
      : "",
    "Nunca escribas placeholders de plantilla como {{nombre}}. Si no conocés el nombre del lead, no uses ningún nombre.",
    "Si el lead pregunta por un programa, carrera o formato que NO está en la oferta, aclará amablemente que no forma parte de nuestra oferta y ofrecé los programas reales. Nunca inventes programas, precios ni datos que no tengas.",
    "Basate en el HISTORIAL de la conversación: no repitas preguntas ya respondidas ni te contradigas, y usá los datos que el lead ya te dio. Respondé SOLO con datos de las reglas/base de conocimiento/historial; si no tenés el dato, decí que lo confirma un asesor (no inventes).",
  ].filter(Boolean).join("\n");

  const variables = (etapa.variables || [])
    .map((v) => `- ${v.nombre}: ${recolectadas[v.nombre] ?? "(sin dato)"}`)
    .join("\n");

  const herramientas = (etapa.herramientas || [])
    .map((h) => `- ${h.clave}: ${h.descripcion || h.nombre}`)
    .join("\n");

  // reglas: limpia placeholders {{...}} igual que el motor (_fill) para un preview fiel
  const reglasLimpias = String(etapa.reglas || "")
    .replace(/\{\{\s*nombre\s*\}\}/gi, "")
    .replace(/\{\{[^}]*\}\}/g, "");

  // Secciones que el MOTOR inyecta en runtime (por mensaje) y el preview no puede replicar acá.
  const clavesHerr = (etapa.herramientas || []).map((h) => h.clave);
  const runtime: string[] = [];
  if (clavesHerr.some((c) => ["consulta_cursos", "precios", "turmas", "envio_links", "checkout"].includes(c)))
    runtime.push("- Catálogo real de programas (tabla cursos)");
  if (clavesHerr.includes("faq_kb"))
    runtime.push("- Base de conocimiento (búsqueda vectorial de los PDF embebidos, según el mensaje del lead)");
  if (clavesHerr.some((c) => ["envio_links", "checkout"].includes(c)) || true)
    runtime.push("- Materiales/PDF adjuntables (folletos por programa)");
  runtime.push("- Disponibilidad horaria (si está fuera de horario, ofrece agendar el próximo slot)");
  runtime.push("- ESTADO DEL LEAD (ficha): nombre, área, formato, momento profesional, etapa, si ya fue derivado a asesor y agenda pendiente — se inyecta arriba del prompt en cada mensaje para no re-preguntar ni re-ofrecer");
  const notaRuntime = runtime.length
    ? `\n\n### (Inyectado por el motor en tiempo real — no editable acá)\n${runtime.join("\n")}`
    : "";

  return `${identidad}

## Etapa: ${etapa.nombre}

### Identidad
**Objetivo:** ${etapa.objetivo || ""}
**Tipo:** ${etapa.tipo || "personalizado"}

### Reglas
${reglasLimpias}

### Variables disponibles en esta etapa
${variables || "(ninguna)"}

### Herramientas habilitadas en esta etapa
${herramientas || "(ninguna)"}
Usá EXCLUSIVAMENTE las herramientas listadas arriba. No invoques ninguna otra.${notaRuntime}`;
}
