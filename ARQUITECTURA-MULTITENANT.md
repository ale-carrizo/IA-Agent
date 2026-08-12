# Arquitectura Multi-Tenant — "AgentFlow Create" (agentes IA para universidades)

> Razonamiento de diseño para escalar el sistema a plantilla multi-cliente con alcance grande.
> Contexto: todos los clientes son **universidades** que venden programas (diplomados / másters / carreras)
> por WhatsApp, con el mismo *shape* de embudo (apertura → sondeo → presentación → FAQ → cierre/transbordo).

---

## 1. Estado actual: ya es multi-tenant (base sólida)

**Un solo motor n8n sirve a TODOS los agentes.** Rutea por `canal (whatsappNumber) → agente_id` y carga en runtime la config de ESE agente. Crear un cliente nuevo = insertar filas, no tocar el motor.

Todo lo relevante está aislado por `agente_id` (o por `conversacion_id`, que pertenece a un agente):

| Recurso | Aislamiento |
|---|---|
| Identidad, tono, modelo-config | `agentes` (col `tenant`) |
| Etapas / prompts | `etapas.agente_id` |
| Variables a extraer | `agente_variables.agente_id` |
| Guardrails | `guardrails.agente_id` |
| Cursos / turmas | `cursos.agente_id` |
| Horarios / feriados | `agente_id` |
| Canales (líneas WhatsApp + token + intent) | `canales.agente_id` |
| **RAG / KB** | `bases_conocimiento.agente_id` → `documentos_kb.base_id` → `kb_embeddings.base_id` |
| Conversaciones / mensajes / eventos / agendas / follow-ups | `agente_id` / `conversacion_id` |

**El RAG YA está separado por tenant:** cada agente tiene su(s) `base(s)_conocimiento`; la búsqueda vectorial filtra `where base_id in (select id from bases_conocimiento where agente_id = :aid)`. Un cliente NUNCA ve los PDF de otro.

**Conclusión:** no hay que rehacer nada para ser multi-tenant. Hay que agregar 3 capas: (a) **plantillas** para crear clientes rápido, (b) **ficha de estado dinámica** (por-tenant, no hardcodeada), (c) **escala física** cuando el volumen lo pida.

---

## 2. "AgentFlow Create": crear un cliente nuevo desde plantilla

Hoy crear un agente = filas en blanco (hay que cargar etapas a mano). Para escalar a muchas universidades:

### 2.1 Concepto de plantilla
Una **plantilla "Universidad"** = un conjunto reutilizable de:
- 7 etapas base (FAQ, Apertura, Sondeo, Presentación, Másters, Presentación Cursos, Transbordo) con sus reglas *genéricas* (placeholders para el nombre de la institución, programas, etc.).
- Variables base (`nombre_lead`, `area_interes`, `formato_producto`, `momento_profesional`) + herramientas por etapa.
- Guardrails base (nunca precios, nombre correcto del producto).
- Horario de atención default.

### 2.2 Flujo de alta (desde el frontend)
1. **Crear agente** → nombre, tenant, institución, zona horaria, idioma.
2. **Aplicar plantilla** → copia etapas/variables/guardrails/tools de la plantilla al nuevo `agente_id` (un endpoint `POST /api/agentes/:id/aplicar-plantilla`).
3. **Personalizar**: subir PDFs (KB propia), cargar cursos reales, ajustar reglas (RVOE/validez del país), conectar canal (token + intent Botmaker).
4. **Publicar** → activo. El motor ya lo atiende (rutea por canal).

### 2.3 Implementación recomendada
- Tabla `plantillas` (o un agente marcado `es_plantilla=true`) del cual clonar.
- Endpoint de clonado que hace `insert ... select` re-mapeando `agente_id` y respetando placeholders.
- Los placeholders en reglas (`{{institucion}}`, `{{programas}}`) se resuelven con datos del agente (el compilador ya limpia `{{}}`; extenderlo para sustituir por config del tenant).

---

## 3. Ficha de estado dinámica (multi-tenant + múltiples casos de uso)

**Problema actual:** la ficha "ESTADO DEL LEAD" hardcodea 4 campos de Guadalupe. Para plantilla, tiene que ser **agnóstica**.

### 3.1 Estructura de 3 capas (la clave del diseño)
```
FICHA DEL LEAD =
  [A] Núcleo universal   (igual para todo tenant)
  [B] Campos del tenant  (definidos en agente_variables → dinámico)
  [C] Estado derivado    (calculado de la DB, determinístico)
```

**[A] Núcleo universal** (siempre): etapa actual + calificación (SAL/SQL), situación (activo / derivado / pausado), canal, idioma.

**[B] Campos del tenant** (dinámico desde `agente_variables`): cada universidad define QUÉ trackear. Ej: una trackea `area_interes/formato`; otra `carrera/sede/turno/beca_interes`. La ficha se **renderiza recorriendo las variables del agente** y sus valores en `variables_recolectadas`. → un solo código sirve a todos.

**[C] Estado derivado** (de la DB, sin que el LLM lo mantenga → no alucina): agenda pendiente, transbordado, follow-ups enviados, materiales/PDF ya enviados, nº de turnos, primera/última interacción.

### 3.2 Casos de uso que habilita una ficha amplia
Pensando en alcance grande, la ficha puede crecer a:
- **Calificación/scoring**: `nivel_interes` (frío/tibio/caliente), señales de compra, presupuesto.
- **Objeciones**: lista de objeciones planteadas (precio, tiempo, validez) → el agente no las repite y las rebate mejor.
- **Journey**: `materiales_enviados[]`, `programas_consultados[]`, `precio_ya_deflectado`, `asesor_ya_ofrecido`.
- **Agenda/CRM**: próxima cita, estado de inscripción, forma de pago preferida.
- **Multi-idioma / multi-país**: idioma detectado, país, reglas de validez locales (RVOE MX vs SENESCYT EC vs SEP…).
- **Sentimiento**: tono del lead (frustrado, entusiasta) → adapta el estilo.

Regla de oro (best practice "state, not chat history"): **lo que se pueda derivar de la DB, derivarlo** (confiable); solo lo genuinamente conversacional (objeciones, sentimiento) lo extrae el LLM y se persiste como estado.

---

## 4. RAG separado por tenant — ahora y a escala

### 4.1 Hoy (correcto para docenas de tenants)
- `kb_embeddings` única, particionada *lógicamente* por `base_id`. Búsqueda: embed del mensaje → `embedding <=> query ::vector` filtrando por las bases del agente. Aislamiento garantizado.

### 4.2 A escala (cientos de tenants / millones de vectores)
- **Índice**: índice vectorial (ivfflat/hnsw) en `kb_embeddings` + índice en `base_id` (filtro barato antes del ANN).
- **Partición**: particionar `kb_embeddings` por `base_id` (o por tenant) si crece mucho.
- **Namespaces**: si se migra a un vector store dedicado (Qdrant/Pinecone/Weaviate — n8n los soporta nativo), usar **un namespace/colección por tenant** (aislamiento físico + performance).
- **Multi-base por agente**: un tenant puede tener varias bases (ej. "programas", "administrativo/FAQ", "becas") y habilitar cuáles por etapa → RAG más preciso.

### 4.3 Retrieval más preciso (multi-tenant)
- Top-K configurable por agente; re-ranking; umbral de similitud (si nada supera el umbral → "lo confirma un asesor", no alucina).
- Metadata por chunk (programa, tipo) para filtrar el retrieval por contexto de la etapa.

---

## 5. Escalabilidad por capa

| Capa | Hoy | A escala |
|---|---|---|
| **Frontend** | Next.js en Railway (stateless) | Escala horizontal (réplicas); CDN de estáticos |
| **Motor n8n** | main mode (1 proceso) | **queue mode** (Redis/BullMQ + N workers, concurrencia 5-10) → también arregla la carrera del debounce |
| **DB Postgres** | 1 instancia (proxy) | **PgBouncer** (pool), réplicas de lectura, índices por `agente_id`/`base_id`/`telefono`, partición de `mensajes_log` y `kb_embeddings` |
| **RAG** | pgvector 1 tabla | índice hnsw + partición o vector store dedicado con namespaces |
| **Memoria** | `n8n_chat_histories` por teléfono | TTL/archivado de sesiones viejas; resumen periódico (state freezing) |
| **Aislamiento** | por `agente_id` en queries | rate-limit por tenant, quotas de tokens/mensajes, alertas por tenant |
| **Observabilidad** | tabla `uso_tokens` (pendiente escribir) | métricas por tenant (tokens, latencia, conversión, escalaciones) |

**Latencia**: hoy ~15s (aceptado, "humaniza"). El motor en la VPS + DB en Railway agrega ~700ms/op por el proxy; co-locar (n8n en Railway, red interna) o queue mode reduce esto cuando importe.

---

## 6. Casos de uso / alcance del sistema

**Núcleo (hoy):** universidad vende programas por WhatsApp → responde FAQ con RAG, califica (SAL→SQL), maneja precio sin alucinar, manda brochures, agenda, deriva a asesor. Multi-línea/multi-cuenta Botmaker.

**Alcance grande (mismo motor, distinta config):**
1. **Cualquier universidad** (MX, EC, CO, PE…): cambia KB, cursos, reglas de validez local, idioma. Plantilla + config.
2. **Multi-programa dentro de un cliente**: diferentes embudos por facultad/área (etapas/variables por vertical).
3. **Multi-canal**: WhatsApp + webchat + Instagram (Botmaker ya es multi-canal; el motor es canal-agnóstico vía `canales`).
4. **Educación no universitaria** (mismo shape): cursos, bootcamps, certificaciones, colegios.
5. **Extensible a otros high-ticket sales** (inmobiliaria, salud, seguros): el engine es genérico (etapas + RAG + calificación + handoff + agenda). La "universidad" es solo la plantilla #1.
6. **Casos por ficha**: reactivación de leads fríos (follow-ups), recuperación de agendas perdidas, upsell (otro programa), nurturing por sentimiento/objeción.

**Qué hace el alcance "gigante":** el motor es **data-driven** — todo (etapas, prompts, variables, RAG, herramientas, guardrails, ficha) es config por tenant en Postgres. Sumar un cliente o un caso de uso = datos, no código. Ese es el multiplicador.

---

## 7. Roadmap priorizado (de acá a "plataforma")
1. **Ficha dinámica** (render desde `agente_variables` + universal + derivado) — desacopla de Guadalupe. *(implementar ya)*
2. **Plantilla + endpoint de clonado** ("crear universidad en 1 click").
3. **Queue mode** (escala + arregla debounce).
4. **RAG**: índice hnsw + umbral de similitud + multi-base por etapa.
5. **Observabilidad por tenant** (tokens/latencia/conversión; escribir `uso_tokens`).
6. **Quotas/rate-limit por tenant** + PgBouncer.
