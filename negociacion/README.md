# Servicio de negociación — licitaciones hospitalarias

Toda la inteligencia del dominio de licitaciones vive acá. n8n es transporte,
Postgres es la verdad, el panel visualiza y aprueba.

```
LLM interpretar → NORMALIZAR (función pura) → POLÍTICA decidir (código puro)
→ LLM expresar → GUARDRAILS (regex) → persistir
```

**El LLM nunca decide. Solo traduce.** El precio que entra a un presupuesto es
matemática auditada, no salida de un modelo.

## Mapa del código

| Archivo | Qué es | LLM |
|---|---|---|
| `normalizador/` | **Librería pura**, sólo stdlib. Números argentinos, unidades, presentaciones, match contra catálogo, confianza. | no |
| `app/politica.py` | `decidir()`: la política de negociación. Función pura con tabla de tests. | no |
| `app/grafo.py` | El grafo LangGraph (6 nodos) + el único `interrupt()` de conversación. | 2 nodos |
| `app/supervisor.py` | Crear licitación, `/tick`, recordatorios, escalaciones, cierre. | no |
| `app/auditoria.py` | Los 4 checks que bloquean una aprobación. | no |
| `app/presupuesto.py` | `mejor precio × (1 + margen)` + snapshot con trazabilidad. | no |
| `app/llm.py` | Los DOS puntos donde interviene un modelo: `interpretar` y `expresar`. | sí |
| `app/guardrails.py` | Regex + "ningún número que no venga de `decidir()`". | no |

`normalizador/` no importa nada de `app/`. Esa dirección de dependencia es
intencional: es la pieza más testeada y no puede quedar atada a un framework.

## API (contrato con n8n y el panel)

```
POST /mensajes        { telefono_e164, texto, canal, message_id }
POST /tick            supervisor (scheduler de n8n cada 5 min)
POST /licitaciones    { hospital, cierre_presentacion, margen_pct, items:[...] }
POST /resume          { thread_id, decision }   reanuda un interrupt
POST /licitaciones/{id}/aprobar    el gate humano
GET  /licitaciones/{id}/auditoria
GET  /excepciones
GET  /health
```

Todos los `POST` piden el header `x-token` (= `N8N_TOKEN`).

## Correr local

```bash
cd negociacion
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
cp .env.example .env          # editá DATABASE_URL

# la base tiene que tener las migraciones del dominio:
psql "$DATABASE_URL" -f ../db/20-licitaciones.sql
psql "$DATABASE_URL" -f ../db/21-licitaciones-seed.sql   # datos de prueba

.venv/bin/uvicorn app.main:app --reload --port 8080
```

Con `LLM_MODO=determinista` corre sin API key: `interpretar` usa heurísticas y
`expresar` usa plantillas. Es lo que se usa en CI y en los tests E2E.

## Tests

```bash
# Unitarios + golden dataset (sin base, sin red)
.venv/bin/python -m pytest tests/ -q

# Incluye el E2E del caso completo (§8 del brief)
DATABASE_URL=postgres://... .venv/bin/python -m pytest tests/ -q
```

El E2E se saltea solo si no hay `DATABASE_URL`. Todo lo demás corre siempre:
**una regresión de precisión en el golden dataset tiene que romper la build.**

## Embeddings del catálogo

El match del normalizador funciona sin embeddings (cae a léxico). Para activar
la búsqueda vectorial:

```bash
python -m app.cli embeddings     # rellena catalogo_maestro.embedding
```

Se embebe `droga + concentración + forma + presentación`; si cambiás esa
plantilla hay que recalcular **todo** el catálogo, no sólo lo nuevo.

## Lo que este servicio NO hace

- No habla con WhatsApp: postea a `N8N_SALIDA_URL` y n8n resuelve el canal.
- No guarda estado en memoria: si se reinicia, retoma de Postgres.
- No manda nada al hospital: eso pasa sólo después del gate humano.
- No deja que un LLM produzca, modifique ni redondee un precio.
