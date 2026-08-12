-- ============================================================
--  Log por turno de conversación (para el visor "Conversaciones")
--  Cada fila = 1 mensaje del lead + respuesta del bot, con la
--  etapa activa y el razonamiento del orquestador.
-- ============================================================
create table if not exists mensajes_log (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid references conversaciones(id) on delete cascade,
  agente_id       uuid references agentes(id) on delete cascade,
  telefono        text,
  mensaje_lead    text,
  respuesta_bot   text,
  etapa_id        uuid references etapas(id),
  etapa_nombre    text,                  -- denormalizado para el divisor de etapa
  razon           text,                  -- razonamiento del orquestador (tooltip)
  bloqueado       bool default false,    -- si el guardrail bloqueó la respuesta
  creado_en       timestamptz default now()
);
create index if not exists idx_mensajes_log_conv on mensajes_log (conversacion_id, creado_en);
create index if not exists idx_mensajes_log_agente on mensajes_log (agente_id, creado_en);
