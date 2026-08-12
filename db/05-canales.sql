-- ============================================================
--  Canales (multi-tenant): cada línea de WhatsApp = 1 fila con
--  su agente, su token de Botmaker y su intentId de derivación.
--  El motor rutea por canal_numero (whatsappNumber entrante).
-- ============================================================
create table if not exists canales (
  id                uuid primary key default gen_random_uuid(),
  agente_id         uuid not null references agentes(id) on delete cascade,
  canal_numero      text not null unique,     -- whatsappNumber (la línea)
  nombre            text,                      -- ej "Grupo Nods"
  plataforma        text default 'whatsapp',
  botmaker_token    text,                      -- access-token de esa cuenta/línea
  handoff_intent_id text,                      -- intentId de asignación a cola de ESA línea
  cola              text default 'asesores',
  activo            bool default true,
  creado_en         timestamptz default now()
);
create index if not exists idx_canales_numero on canales (canal_numero) where activo;

-- seed: canal Grupo Nods -> Guadalupe (token nodslabsas; intentId pendiente)
insert into canales (agente_id, canal_numero, nombre, botmaker_token, handoff_intent_id, cola, activo)
values (
  '00000000-0000-0000-0000-0000000000a6',
  '5492914852219',
  'Grupo Nods',
  'REEMPLAZAR_BOTMAKER_TOKEN',  -- cargar el access-token real desde el panel (Canal de Conexión) o env, NO commitear tokens
  null,
  'asesores',
  true
)
on conflict (canal_numero) do nothing;
