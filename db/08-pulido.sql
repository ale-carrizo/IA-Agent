-- Pulido IA: memoria larga de casos de calidad (feedback -> diagnóstico -> fix propuesto -> estado)
-- Habilita detección de patrones recurrentes y cola de pendientes (human-in-the-loop).
create table if not exists pulido_casos (
  id              uuid primary key default gen_random_uuid(),
  agente_id       uuid not null references agentes(id) on delete cascade,
  telefono        text,
  feedback        text not null,
  diagnostico     text,
  causa           text,              -- muy_agresivo | no_responde | poco_consultivo | salto_de_etapa | alucinacion | tono | otro
  etapa_id        uuid,
  etapa_nombre    text,
  campo           text,              -- reglas | objetivo | persona | tono | guardrail_nuevo | config
  accion          text,              -- append | replace | insert
  texto_actual    text,
  texto_propuesto text,
  justificacion   text,
  riesgo          text,              -- bajo | medio | alto
  es_patron       boolean default false,
  frecuencia      int default 1,     -- cuántas veces se vio algo similar (según la IA)
  estado          text not null default 'pendiente',  -- pendiente | aplicado | descartado
  creado_en       timestamptz default now(),
  aplicado_en     timestamptz,
  aplicado_por    text,              -- email del usuario que aprobó el cambio
  texto_antes     text,              -- snapshot del campo antes de aplicar el fix
  descartado_en   timestamptz,
  descartado_por  text               -- email del usuario que descartó el caso
);
create index if not exists idx_pulido_agente_estado on pulido_casos (agente_id, estado, creado_en desc);
create index if not exists idx_pulido_causa on pulido_casos (agente_id, causa);
