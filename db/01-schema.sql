-- ============================================================
--  Sistema de agentes conversacionales por etapas
--  PostgreSQL puro (sin Supabase)
--  Se corre automáticamente al crear el volumen (docker-compose).
--  Manual:  psql -d agentes -f 01-schema.sql
-- ============================================================

-- ------------------------------------------------------------
--  AGENTE  (pestaña "Identidad y Comportamiento" del agente)
-- ------------------------------------------------------------
create table agentes (
  id                 uuid primary key default gen_random_uuid(),
  tenant             text not null,
  ambiente           text not null,
  nombre             text not null,
  rol                text,
  idioma             text default 'es',
  zona_horaria       text default 'America/Mexico_City',
  formato_hora       text default 'AM/PM',
  persona            text default 'consultor',     -- consultor | agresivo | soporte
  tono               text default 'amigable',      -- directo | empatico | formal | amigable
  velocidad_respuesta text default 'rapido',
  long_max_mensaje   int  default 200,
  mensajes_historial int  default 20,              -- ventana de memoria del LLM
  usar_emojis        bool default true,
  usar_abreviaturas  bool default false,
  publicado          bool default false,           -- gate de publicación (draft vs live)
  creado_en          timestamptz default now(),
  actualizado_en     timestamptz default now()
);

-- ------------------------------------------------------------
--  VARIABLES DEL AGENTE  (pestaña "Variables del Agente")
-- ------------------------------------------------------------
create table agente_variables (
  id          uuid primary key default gen_random_uuid(),
  agente_id   uuid not null references agentes(id) on delete cascade,
  nombre      text not null,
  tipo        text not null default 'texto',       -- texto | numero | bool | fecha
  unique (agente_id, nombre)
);

-- ------------------------------------------------------------
--  GUARDRAILS  (sección "Guardrails")
-- ------------------------------------------------------------
create table guardrails (
  id          uuid primary key default gen_random_uuid(),
  agente_id   uuid not null references agentes(id) on delete cascade,
  nombre      text not null,
  regla       text not null,
  patron_bloqueo text,                             -- regex p/ el chequeo DURO post-respuesta (ej: precios)
  activo      bool default true
);

-- ------------------------------------------------------------
--  CATALOGO DE HERRAMIENTAS  (global / por tenant)
-- ------------------------------------------------------------
create table herramientas (
  id          uuid primary key default gen_random_uuid(),
  tenant      text,                                -- null = global
  clave       text not null,                       -- consulta_cursos, turmas, consulta_precios, etc.
  nombre      text not null,
  descripcion text,
  tipo        text not null,                       -- workflow_tool | vector_store | http | handoff
  unique (tenant, clave)
);

-- ------------------------------------------------------------
--  ETAPAS  (pestaña "Identidad" de la etapa)
-- ------------------------------------------------------------
create table etapas (
  id              uuid primary key default gen_random_uuid(),
  agente_id       uuid not null references agentes(id) on delete cascade,
  orden           int  not null,                   -- drag-handle de la lista
  nombre          text not null,
  objetivo        text,                            -- "Descripción del Objetivo"
  tipo            text default 'personalizado',
  calificacion    text default 'ninguna'
                  check (calificacion in ('ninguna','sal','sql')),
  tono_override   text,                            -- null = usa tono global del agente
  reglas          text,                            -- el markdown grande
  prompt_compilado text,                           -- cache de la pestaña "Prompt"
  activo          bool default true,               -- el toggle verde
  unique (agente_id, orden)
);

-- relación etapa <-> herramientas habilitadas  (pestaña "Herramientas")
create table etapa_herramientas (
  etapa_id        uuid not null references etapas(id) on delete cascade,
  herramienta_id  uuid not null references herramientas(id) on delete cascade,
  primary key (etapa_id, herramienta_id)
);

-- relación etapa <-> variables vinculadas  (pestaña "Variables")
create table etapa_variables (
  etapa_id    uuid not null references etapas(id) on delete cascade,
  variable_id uuid not null references agente_variables(id) on delete cascade,
  primary key (etapa_id, variable_id)
);

-- horarios por etapa  (pestaña "Horarios"; sin filas = 24/7)
create table etapa_horarios (
  id          uuid primary key default gen_random_uuid(),
  etapa_id    uuid not null references etapas(id) on delete cascade,
  dia         int not null,                        -- 0=domingo .. 6=sabado
  hora_inicio time,
  hora_fin    time,
  cerrado     bool default false
);

-- ------------------------------------------------------------
--  BASE DE CONOCIMIENTO  (sección "Bases de Conocimiento")
-- ------------------------------------------------------------
create table bases_conocimiento (
  id          uuid primary key default gen_random_uuid(),
  agente_id   uuid not null references agentes(id) on delete cascade,
  nombre      text not null,
  coleccion_vector text not null                   -- namespace por tenant/agente
);

create table documentos_kb (
  id          uuid primary key default gen_random_uuid(),
  base_id     uuid not null references bases_conocimiento(id) on delete cascade,
  programa    text,                                -- ej: "Máster - Salud 4.0"
  nombre      text not null,
  pdf_url     text,                                -- archivo real para "Envio de Links"
  doc_id      text not null,                       -- id de versión usado en metadata de los chunks
  version     int default 1,
  estado      text default 'procesando',           -- procesando | listo | error
  creado_en   timestamptz default now()
);

-- tabla de vectores para pgvector (la usa el pipeline de ingesta y el retrieval)
-- dimensión 1536 = text-embedding-3-small de OpenAI. Cambiá si usás otro modelo.
create table kb_embeddings (
  id          uuid primary key default gen_random_uuid(),
  base_id     uuid references bases_conocimiento(id) on delete cascade,
  doc_id      text not null,                       -- = documentos_kb.doc_id (para borrar versión vieja)
  contenido   text,
  metadata    jsonb,                               -- tenant, programa, tipo_doc, etc.
  embedding   vector(1536)
);
create index idx_kb_embeddings_doc on kb_embeddings (doc_id);

-- ------------------------------------------------------------
--  ESTADO DE CONVERSACION  (runtime)
--  OJO: esto es ESTADO (etapa + variables), NO el historial.
--  El historial de chat del LLM lo maneja n8n en su propia tabla.
-- ------------------------------------------------------------
create table conversaciones (
  id                     uuid primary key default gen_random_uuid(),
  agente_id              uuid not null references agentes(id),
  telefono               text not null,
  etapa_actual_id        uuid references etapas(id),
  variables_recolectadas jsonb default '{}'::jsonb,
  transbordado           bool default false,        -- bot apagado para este lead
  lock_hasta             timestamptz,               -- lock simple por lead (concurrencia)
  ultima_actividad       timestamptz default now(),
  unique (agente_id, telefono)
);

create index idx_conv_telefono on conversaciones (telefono);

-- ------------------------------------------------------------
--  OBSERVABILIDAD
-- ------------------------------------------------------------
create table uso_tokens (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid references conversaciones(id) on delete cascade,
  etapa_id        uuid references etapas(id),
  modelo          text,
  prompt_tokens   int,
  completion_tokens int,
  creado_en       timestamptz default now()
);

create table conversacion_eventos (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid references conversaciones(id) on delete cascade,
  tipo            text not null,                    -- transicion | calificacion | transbordo
  etapa_desde_id  uuid references etapas(id),
  etapa_hasta_id  uuid references etapas(id),
  calificacion    text,                             -- sal | sql
  detalle         jsonb,
  creado_en       timestamptz default now()
);

create table mensajes_vistos (
  message_id  text primary key,
  visto_en    timestamptz default now()
);
