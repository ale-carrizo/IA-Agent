# IA-AGENT — motor de agentes por etapas

Un **motor genérico data-driven** donde
las etapas, herramientas, variables y horarios viven en **Postgres**, y
**n8n** las lee en runtime. Agregar una etapa = insertar una fila, sin
tocar el workflow.

```
┌──────────┐     escribe config      ┌────────────┐     lee config (runtime)   ┌──────────┐
│ Frontend │ ──────────────────────▶ │ PostgreSQL │ ◀───────────────────────── │   n8n    │
│ Next.js  │   (route handlers / pg) │  (agentes) │                            │ (motor)  │
└──────────┘                         └────────────┘                            └──────────┘
        El frontend NUNCA le habla a n8n. Postgres es el contrato entre los dos.
```

## Estructura

```
sales-ai-engine/
├─ docker-compose.yml      # Postgres (pgvector) + n8n
├─ .env.example            # -> copiá a .env
├─ db/
│  ├─ 00-init.sql          # extensiones + schema n8n  (corre 1ro, automático)
│  ├─ 01-schema.sql        # tablas del motor          (corre 2do, automático)
│  ├─ 02-seed.sql          # agente Guadalupe + etapas (corre 3ro, automático)
│  └─ 20-21               # dominio licitaciones (ver docs/LICITACIONES.md)
├─ n8n/
│  ├─ motor-agente.json    # workflow importable (compilador YA inyectado)
│  └─ compilador-prompt.js # referencia del Code node
├─ negociacion/            # servicio Python (licitaciones) — LangGraph + FastAPI
└─ web/                    # Next.js (frontend + API)
```

> **Segundo dominio: licitaciones hospitalarias.** Al lado del motor de agentes
> vive un sistema de cotización automática para una droguería (recolección de
> precios por WhatsApp + presupuesto con aprobación humana). Comparte base,
> canales y panel; **no toca el motor ni sus tenants en producción**.
> Arquitectura y puesta en marcha: [`docs/LICITACIONES.md`](docs/LICITACIONES.md).

## Arranque (orden exacto)

### 1. Levantar infra
```bash
cd sales-ai-engine
cp .env.example .env          # y cambiá POSTGRES_PASSWORD
docker compose up -d
```
Los `.sql` de `db/` se corren **solos** la primera vez (schema + seed). Quedan:
- Postgres en `localhost:5432` (db `agentes`, user `iaagent`)
- n8n en `http://localhost:5678`

> Si cambiás los `.sql` después, no se vuelven a correr (el volumen ya existe).
> Para re-seedear: `docker compose down -v && docker compose up -d` (¡borra datos!).

### 2. Credencial Postgres en n8n
En n8n → **Credentials → New → Postgres**:
- Host: `postgres`  ·  Database: `agentes`  ·  User: `iaagent`  ·  Password: la tuya  ·  Port: `5432`

(Host es `postgres`, el nombre del servicio en docker, no `localhost`.)

### 3. Importar el motor
n8n → **Workflows → Import from File** → `n8n/motor-agente.json`.
Después, en cada nodo que diga `REEMPLAZAR`:
- Los 4 nodos **Postgres** → asignales la credencial del paso 2.
- **Chat Model** → tu credencial OpenAI (o cambialo por el chat model que uses).
- **Tool KB** → apuntalo a tu sub-workflow de KB (o borralo por ahora para probar sin tools).

> El compilador ya viene pegado en el nodo **Compilar prompt**, no copies nada.
> Si algún nodo LangChain se queja de `typeVersion` al importar: borralo, agregalo de
> nuevo desde la UI y reconectá (mismas conexiones del JSON).

### 4. Probar el motor (sin frontend)
Activá el workflow (o usá "Test workflow") y mandá:
```bash
curl -X POST http://localhost:5678/webhook-test/agente-entrada \
  -H "content-type: application/json" \
  -d '{"agente_id":"00000000-0000-0000-0000-0000000000a6","telefono":"5491100000000","mensaje":"hola"}'
```
Si responde con el tono/objetivo de la etapa #1 de Guadalupe → **el motor anda**.
(Sin `etapa_actual_id`, agarra la primera etapa activa por `orden`.)

### 5. Frontend
```bash
cd web
cp .env.example .env          # ajustá DATABASE_URL y N8N_PREVIEW_URL
npm install
npm run dev                    # http://localhost:3000
```
- `/`                       → lista de agentes (dashboard)
- `/agent/{id}/stages`      → lista de etapas (tu segunda captura)
- API: `GET/POST /api/etapas`, `PATCH/DELETE /api/etapas/:id`,
  `GET /api/etapas/:id/prompt` (pestaña Prompt), `POST /api/preview` (botón ▶)

## Lo que falta para producción (en orden de prioridad)
1. **Router / clasificador de etapa** (AI Text Classifier) + transiciones → escribir `etapa_actual_id`.
2. **Gate de herramientas duro**: cada tool como sub-workflow que valida `etapa_herramientas` antes de correr.
3. **Pipeline de ingesta de KB**: PDF → chunk → embed → upsert en `kb_embeddings` con `doc_id` + borrado de versión vieja.
4. **Post-procesado de respuesta**: split por `long_max_mensaje` + cadencia "escribiendo...".
5. **Debounce de entrada** (juntar mensajes ~6s) y **dedupe** por `message_id` (`mensajes_vistos`).
6. **Guardrails duros** post-respuesta (regex `patron_bloqueo`, ej. precios).
7. **Lock por teléfono** (`conversaciones.lock_hasta`) para concurrencia.
8. **Transbordo**: handoff a cola humana + flag `transbordado`.
9. **Observabilidad**: log de `uso_tokens` y `conversacion_eventos` (funnel SAL/SQL → CRM).
```
