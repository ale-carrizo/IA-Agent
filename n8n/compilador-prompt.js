// ============================================================
//  n8n Code node — Compilador de prompt de etapa
//  Modo: "Run Once for All Items"
//
//  Espera que los nodos previos (Postgres) hayan dejado:
//   - $('Cargar agente').first().json       -> fila de agentes
//   - $('Cargar etapa activa').first().json  -> fila de etapas (+ joins agregados)
//   - $('Cargar estado').first().json        -> fila de conversaciones
// ============================================================

const agente = $('Cargar agente').first().json;
const etapa  = $('Cargar etapa activa').first().json;
const estado = $('Cargar estado').first().json;

const recolectadas = estado?.variables_recolectadas ?? {};
const tono = etapa.tono_override || agente.tono;

// --- Identidad global del agente ---
const identidad = [
  `Eres ${agente.nombre}.`,
  agente.rol ? agente.rol : '',
  `Persona: ${agente.persona}. Tono: ${tono}.`,
  `Idioma: ${agente.idioma}. Zona horaria: ${agente.zona_horaria}.`,
  `Longitud máxima por mensaje: ${agente.long_max_mensaje} caracteres.`,
  agente.usar_emojis ? 'Podés usar emojis con moderación.' : 'No uses emojis.',
].filter(Boolean).join('\n');

// --- Variables vinculadas a la etapa, con su valor recolectado ---
const variables = (etapa.variables || [])
  .map(v => `- ${v.nombre}: ${recolectadas[v.nombre] ?? '(sin dato)'}`)
  .join('\n');

// --- Herramientas habilitadas SOLO en esta etapa ---
const herramientas = (etapa.herramientas || [])
  .map(h => `- ${h.clave}: ${h.descripcion || h.nombre}`)
  .join('\n');

// --- Composición final (espejo de la pestaña "Prompt") ---
const systemPrompt = `${identidad}

## Etapa: ${etapa.nombre}

### Identidad
**Objetivo:** ${etapa.objetivo || ''}
**Tipo:** ${etapa.tipo || 'personalizado'}

### Reglas
${etapa.reglas || ''}

### Variables disponibles en esta etapa
${variables || '(ninguna)'}

### Herramientas habilitadas en esta etapa
${herramientas || '(ninguna)'}
Usá EXCLUSIVAMENTE las herramientas listadas arriba. No invoques ninguna otra.`;

return [{
  json: {
    system_prompt: systemPrompt,
    etapa_id: etapa.id,
    calificacion: etapa.calificacion,
    herramientas_permitidas: (etapa.herramientas || []).map(h => h.clave),
  }
}];
