-- ============================================================
--  Cursos/productos + turmas (fuente de datos para las tools)
--  + pausa del bot por cola.
-- ============================================================

-- catálogo de cursos/productos del agente (consulta_cursos, consulta_precios, presentación, checkout)
create table if not exists cursos (
  id           uuid primary key default gen_random_uuid(),
  agente_id    uuid not null references agentes(id) on delete cascade,
  nombre       text not null,
  tipo         text,                 -- master | diplomado
  area         text,
  modalidad    text,                 -- online | presencial | hibrido
  nivel        text,
  duracion     text,
  precio       text,                 -- texto libre (ej "USD 1200" o "consultar")
  condiciones  text,                 -- formas de pago / parcelamiento
  descripcion  text,
  pdf_url      text,                 -- material oficial (envio_links)
  checkout_url text,                 -- link de checkout (checkout_link)
  activo       bool default true,
  creado_en    timestamptz default now()
);
create index if not exists idx_cursos_agente on cursos (agente_id) where activo;

-- próximas fechas de inicio (turmas)
create table if not exists turmas (
  id           uuid primary key default gen_random_uuid(),
  curso_id     uuid references cursos(id) on delete cascade,
  agente_id    uuid references agentes(id) on delete cascade,
  fecha_inicio date not null,
  cupos        int,
  activo       bool default true
);

-- pausa del bot por cola (hand-off): si el lead está en una cola humana, el bot no responde
alter table conversaciones add column if not exists cola_actual text;
alter table conversaciones add column if not exists pausado bool default false;

-- seed: 2 cursos de ejemplo para Guadalupe (para que las tools tengan datos)
insert into cursos (agente_id, nombre, tipo, area, modalidad, duracion, precio, condiciones, descripcion, activo)
values
 ('00000000-0000-0000-0000-0000000000a6', 'Diploma de Máster Universitario en Salud 4.0', 'master', 'salud', 'online', '12 meses', 'consultar con asesor', 'pago mensual o único', 'Integra 3 diplomados con docentes internacionales.', true),
 ('00000000-0000-0000-0000-0000000000a6', 'Diplomado en Neuroética e Inteligencia Emocional', 'diplomado', 'liderazgo', 'online', '4 meses', 'consultar con asesor', 'pago mensual o único', 'Decisiones estratégicas integrando neurociencia, ética y emociones.', true)
on conflict do nothing;
