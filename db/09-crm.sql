-- Integración CRM (herramienta crm_push): envío de datos de la ficha a un CRM externo
-- cuando la conversación entra a una etapa que tiene la herramienta activada.
-- La configuración (endpoint, formato, plantilla de campos) vive en crm_integraciones
-- y se edita desde el panel (sección "Integración CRM"), con presets como Neotel.

-- 1) Herramienta en el catálogo global (aparece en el toggle de herramientas de cada etapa)
insert into herramientas (id, clave, nombre, descripcion, tipo)
select gen_random_uuid(), 'crm_push', 'Enviar datos a CRM',
       'Al entrar a una etapa con esta herramienta, envía los datos de la ficha al CRM configurado en la sección Integración CRM (ej: Neotel).',
       'accion'
where not exists (select 1 from herramientas where clave = 'crm_push');

-- 2) Integraciones por agente (config jsonb: url, formato, plantilla con placeholders {{ficha.x}})
create table if not exists crm_integraciones (
  id             uuid primary key default gen_random_uuid(),
  agente_id      uuid not null references agentes(id) on delete cascade,
  nombre         text not null,
  preset         text,                          -- neotel | generico_json | generico_form
  config         jsonb not null default '{}',
  activo         boolean not null default true,
  creado_en      timestamptz default now(),
  actualizado_en timestamptz default now()
);
create index if not exists idx_crm_integ_agente on crm_integraciones (agente_id, activo);

-- 3) Log de envíos (auditoría + dedupe: un envío exitoso por integración+conversación)
create table if not exists crm_envios (
  id             uuid primary key default gen_random_uuid(),
  integracion_id uuid not null references crm_integraciones(id) on delete cascade,
  agente_id      uuid not null,
  conversacion_id uuid,
  telefono       text,
  etapa          text,
  payload        text,                          -- body enviado (para auditoría/replay)
  status_http    int,
  respuesta      text,
  exito          boolean not null default false,
  es_test        boolean not null default false,
  creado_en      timestamptz default now()
);
create unique index if not exists uq_crm_envio_ok
  on crm_envios (integracion_id, conversacion_id) where exito and not es_test;
create index if not exists idx_crm_envios_agente on crm_envios (agente_id, creado_en desc);
