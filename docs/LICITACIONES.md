# Sistema de cotización automática para licitaciones hospitalarias

> Estado de implementación del dominio descrito en `BRIEF-sistema-licitaciones.md`.
> Se construyó **al lado** del motor de agentes existente: comparte base, canales
> y panel, y no toca ninguna tabla ni workflow de los tenants en producción.

## Qué resuelve

Una droguería participa en licitaciones diarias de hospitales. Hoy 15 personas
piden precios ítem por ítem por WhatsApp, anotan a mano y arman el presupuesto
contra reloj. El sistema automatiza la recolección y el armado, y deja a las
personas como supervisoras y aprobadoras.

Restricción dura del dominio: **precisión absoluta**. Confundir "precio por
unidad" con "precio por caja x100" arruina un presupuesto. El sistema prefiere
re-preguntar o bloquear antes que adivinar — esa preferencia está codificada,
no es una intención.

## Los tres planos

```
┌────────────────────────────────────────────────────────────────────┐
│ CANALES: WhatsApp (Botmaker / Kapso / WA Cloud)                    │
└──────────────────────────┬─────────────────────────────────────────┘
                           │  n8n = SOLO TRANSPORTE
                           │  n8n/licitaciones-inbound.json   → POST /mensajes
                           │  n8n/licitaciones-tick.json      → POST /tick
                           │  n8n/licitaciones-salida.json    ← el servicio postea acá
┌──────────────────────────▼─────────────────────────────────────────┐
│ SERVICIO DE NEGOCIACIÓN  ·  negociacion/  (Python · LangGraph)     │
│  interpretar → normalizar → decidir → expresar → guardrails →      │
│  persistir  ·  checkpointer PostgresSaver  ·  supervisor sin LLM   │
└──────────────────────────┬─────────────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────────────┐
│ BLACKBOARD · PostgreSQL  ·  db/20-licitaciones.sql                 │
│  catalogo_maestro · proveedores · proveedores_items · licitaciones │
│  items_licitacion · cotizaciones · eventos (+NOTIFY) · excepciones │
│  presupuestos                                                       │
└──────────────────────────┬─────────────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────────────┐
│ PANEL · web/app/licitaciones/  (Next.js existente)                 │
│  matriz en vivo · cola de excepciones · auditoría · aprobar · export│
└────────────────────────────────────────────────────────────────────┘
```

### La frontera que no se negocia

| Componente | Responsabilidad | Prohibido |
|---|---|---|
| n8n | Transporte: webhooks ↔ HTTP al servicio; scheduler que pega a `/tick` | Cualquier lógica de dominio o decisión |
| Servicio Python | Toda la inteligencia: interpretar, normalizar, decidir, expresar. Supervisor. | Hablar con canales directamente |
| Postgres | Única fuente de verdad: estado + eventos + checkpoints | Estado en memoria del servicio |
| Panel Next.js | Visualización, excepciones, aprobación, export | Ejecutar lógica de negociación |

Si una decisión de negocio termina dentro de un nodo n8n "porque es rápido":
**se rechaza en review.**

## El principio: el LLM nunca decide, solo traduce

```
LLM interpretar → NORMALIZAR (función pura) → POLÍTICA decidir (código puro, sin LLM)
→ LLM expresar → GUARDRAILS (regex) → persistir
```

Consecuencias verificables:

- `normalizador/` no importa nada de `app/` ni de ningún framework, y se testea
  contra el golden dataset sin red ni base.
- `decidir()` es pura y tiene tabla de casos: `tests/test_politica.py` incluye
  las propiedades *"nunca acepta bajo el umbral de confianza"* y *"nunca acepta
  por encima del máximo"* probadas sobre todo el rango.
- El guardrail de salida rechaza **cualquier número** del mensaje que no haya
  salido de `decidir()` (o del pliego). Si el modelo inventa un precio, el
  mensaje se descarta y sale la plantilla determinística.

## Cómo se decide (la política)

Orden de evaluación en `app/politica.py`. No es arbitrario:

1. **Sin stock** — no hay precio que evaluar.
2. **Sin precio** — todavía no hay nada que decidir.
3. **Confianza < 0.85** → CLARIFICAR. Antes que cualquier cuenta: no se opera
   sobre un dato que no entendimos.
4. **Condiciones fuera de política** → `interrupt()` → cola humana. Un precio
   excelente con una mala condición sigue siendo una mala compra.
5. **Sin `precio_max_aceptable`** → humano. Sin el sobre no hay política que aplicar.
6. **Escalera de precio**:
   - `≤ objetivo` → ACEPTAR
   - `≤ máximo` → ACEPTAR, o COUNTER si faltan más de 2 h para el cierre
   - `> máximo` → COUNTER una sola vez → DESCARTAR

La contraoferta es siempre `precio_objetivo` (sale del sobre), nunca un
porcentaje calculado sobre lo que ofreció el proveedor.

## Cómo se lee un mensaje (el normalizador)

La confianza arranca en la similitud del match y **sólo puede bajar**. Cada
caída deja un motivo legible, que es lo que el operador ve en el panel.

Decisiones de diseño que vale la pena conocer:

- **La ausencia de un dato no penaliza por sí sola.** Que el proveedor no repita
  la concentración es normal: está contestando una pregunta que ya la traía.
  Penaliza fuerte sólo cuando esa omisión deja *dos lecturas posibles*.
- **"La caja" sin cantidad** se completa desde el catálogo únicamente si hay una
  sola lectura. Amoxicilina 500 mg viene sólo en caja x100 → se infiere.
  Ibuprofeno 600 viene en caja x50 **y** x100 → se re-pregunta.
- **Otra presentación ⇒ se confirma** (techo 0.80, bajo el umbral) aunque el
  unitario sea convertible exacto: el hospital no compra unidades sueltas. Es
  la constante `CAP_PRESENTACION_DISTINTA`, el único número a mover si el
  cliente confirma que le sirve cualquier formato.
- **"38.900 lucas" no se interpreta.** 38.900 y 38.900.000 difieren en 1000×:
  se re-pregunta.

## El golden dataset (prioridad #1)

`negociacion/tests/golden/` — ver su `README.md`.

El riesgo del proyecto no está en la orquestación: está en `interpretar` +
`normalizar`. El dataset actual es **sintético** y fija el comportamiento; hay
que reemplazarlo por 100–200 respuestas reales, que ya existen en los WhatsApp
de las 15 personas que hoy piden precios.

A partir del primer día de uso el dataset se alimenta solo: `cotizaciones`
guarda `raw_respuesta` de todo lo que entra, y
`python -m app.cli exportar-golden` arma el jsonl con los casos que un humano
tuvo que corregir — que son, por definición, en los que el sistema se equivocó.

## La auditoría (lo que bloquea una aprobación)

1. Toda cotización usada tiene confianza ≥ 0.85 y presentación compatible con la
   pedida (conversión de unidades exacta).
2. Precio elegido dentro de ±30% del histórico, o **advertencia** "verificar outlier".
3. Cobertura: cada ítem con ≥1 confirmada. Con una sola → **advertencia** "sin comparación".
4. Ningún `interrupt` pendiente sin resolver.

Los bloqueos impiden aprobar; las advertencias se muestran y se aprueba igual.

## Puesta en marcha

```bash
# 1. Migración + datos de prueba
psql "$DATABASE_URL" -f db/20-licitaciones.sql
psql "$DATABASE_URL" -f db/21-licitaciones-seed.sql

# 2. Servicio (ver negociacion/README.md)
cd negociacion && cp .env.example .env
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --port 8080

# 3. n8n: importar los 3 workflows
#    n8n/licitaciones-inbound.json · licitaciones-tick.json · licitaciones-salida.json
#    Variables de entorno de n8n: NEGOCIACION_URL, NEGOCIACION_TOKEN,
#    LICITACIONES_AGENTE_ID. Asignar la credencial Postgres al nodo "Buscar canal".

# 4. Panel: agregar a web/.env
#    NEGOCIACION_URL=http://localhost:8080
#    NEGOCIACION_TOKEN=<el mismo N8N_TOKEN del servicio>
```

Verificación de que anda: `/licitaciones` → "Cargar pliego" → se crean las
cotizaciones y salen los mensajes. El test E2E hace exactamente ese recorrido
completo contra una base real (`negociacion/tests/test_e2e.py`).

## Lo que falta para V2

- **Voz** (Vapi/Retell → el mismo servicio). El evento `escalacion.voz` ya se
  emite; en V1 el panel lo muestra como tarea manual "llamalo". No arrancar por
  voz hasta que el pipeline de texto esté validado con licitaciones reales.
- **SSE sobre LISTEN/NOTIFY** en la matriz. El canal `eventos_licitacion` ya
  está publicado por el trigger de `db/20`; hoy el panel hace polling cada 5 s.
- **Techo duro de tokens por tenant** con auto-pausa (extender `uso_tokens`).
- **Golden dataset real** — lo más importante de esta lista.
