-- 18: persistencia de inteligencia de negocio.
-- insights_runs: cada corrida del análisis IA (workflow insights-ia) queda guardada
-- para tener historial/evolución y alimentar el informe mensual.
-- qa_evaluaciones: scores del Juez QA por conversación (5 dimensiones del bench).

create table if not exists insights_runs (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references agentes(id) on delete cascade,
  origen text not null default 'manual', -- manual | schedule
  dialogos_analizados int not null default 0,
  resumen text,
  temas jsonb not null default '[]'::jsonb,
  objeciones jsonb not null default '[]'::jsonb,
  huecos_kb jsonb not null default '[]'::jsonb,
  recomendaciones jsonb not null default '[]'::jsonb,
  generado_en timestamptz not null default now()
);
create index if not exists idx_insights_runs_agente on insights_runs (agente_id, generado_en desc);

create table if not exists qa_evaluaciones (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references agentes(id) on delete cascade,
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  telefono text not null,
  turnos_evaluados int not null default 0,
  memoria int, etapas int, naturalidad int, ventas int, correccion int,
  total int not null default 0,          -- suma /50
  veredicto text,
  fallas jsonb not null default '[]'::jsonb,
  modelo text,
  evaluado_hasta timestamptz,            -- ultima_actividad de la conv al evaluar (para re-evaluar si siguió)
  creado_en timestamptz not null default now()
);
create index if not exists idx_qa_eval_agente on qa_evaluaciones (agente_id, creado_en desc);
create index if not exists idx_qa_eval_conv on qa_evaluaciones (conversacion_id, creado_en desc);
