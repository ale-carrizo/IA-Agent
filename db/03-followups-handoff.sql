-- ============================================================
--  Follow-ups + Hand-off + Horarios de atención + Agenda
--  (migración: correr sobre la base existente)
-- ============================================================

-- ventana oficial de WhatsApp: trackear el ÚLTIMO mensaje del LEAD (inbound)
alter table conversaciones add column if not exists ultimo_mensaje_lead timestamptz;

-- ------------------------------------------------------------
--  FOLLOW-UPS: secuencia de pasos por agente.
--  Todos DENTRO de la ventana de 24h (delay_minutos < 1440).
-- ------------------------------------------------------------
create table if not exists follow_ups (
  id            uuid primary key default gen_random_uuid(),
  agente_id     uuid not null references agentes(id) on delete cascade,
  orden         int  not null,
  delay_minutos int  not null,                 -- desde el último mensaje del lead
  mensaje       text not null,
  activo        bool default true,
  unique (agente_id, orden)
);

-- tracking de envíos (para no repetir un paso). Se RESETEA cuando el lead vuelve a escribir.
create table if not exists follow_up_envios (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  follow_up_id    uuid not null references follow_ups(id) on delete cascade,
  enviado_en      timestamptz default now(),
  unique (conversacion_id, follow_up_id)
);

-- ------------------------------------------------------------
--  HORARIO DE ATENCIÓN a nivel AGENTE (sección "Horario de Atención")
--  sin filas para un día = ese día se interpreta cerrado.
-- ------------------------------------------------------------
create table if not exists horarios_atencion (
  id          uuid primary key default gen_random_uuid(),
  agente_id   uuid not null references agentes(id) on delete cascade,
  dia         int not null,                    -- 0=domingo .. 6=sabado
  hora_inicio time,
  hora_fin    time,
  cerrado     bool default false,
  unique (agente_id, dia)
);

-- feriados / fechas bloqueadas
create table if not exists feriados (
  id          uuid primary key default gen_random_uuid(),
  agente_id   uuid not null references agentes(id) on delete cascade,
  fecha       date not null,
  descripcion text,
  unique (agente_id, fecha)
);

-- ------------------------------------------------------------
--  AGENDAMIENTOS generados por el agente (cuando ofrece agendar)
-- ------------------------------------------------------------
create table if not exists agendamientos (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid references conversaciones(id) on delete cascade,
  agente_id       uuid references agentes(id) on delete cascade,
  fecha_hora      timestamptz not null,
  estado          text default 'propuesto',    -- propuesto | confirmado | cancelado
  detalle         text,
  creado_en       timestamptz default now()
);

-- seed: horario de atención default Lun-Vie 9-18 para Guadalupe (si no existe)
insert into horarios_atencion (agente_id, dia, hora_inicio, hora_fin, cerrado)
select '00000000-0000-0000-0000-0000000000a6', d,
       case when d between 1 and 5 then time '09:00' end,
       case when d between 1 and 5 then time '18:00' end,
       case when d between 1 and 5 then false else true end
from generate_series(0,6) d
on conflict (agente_id, dia) do nothing;

-- seed: 2 pasos de follow-up de ejemplo para Guadalupe
insert into follow_ups (agente_id, orden, delay_minutos, mensaje, activo) values
  ('00000000-0000-0000-0000-0000000000a6', 1, 120,  '¡Hola! Te quedó alguna duda sobre los programas? Estoy para ayudarte 😊', true),
  ('00000000-0000-0000-0000-0000000000a6', 2, 1200, 'Te escribo de nuevo por si querés que avancemos con tu inscripción. ¿Coordinamos?', true)
on conflict (agente_id, orden) do nothing;
