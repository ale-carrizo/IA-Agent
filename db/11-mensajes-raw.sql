-- Almacén raw: TODO lo que llega al webhook (lead, asesor post-handoff, audio, media),
-- antes de cualquier filtro del motor. Base para BI/insights.
create table if not exists mensajes_raw (
  id bigserial primary key,
  agente_id uuid,
  telefono text,
  canal text,               -- botmaker | preview
  direccion text,           -- lead | asesor | bot | sistema
  tipo text,                -- texto | audio | imagen | media | sin_texto
  mensaje text,             -- texto plano si lo hay
  queue_in text,            -- cola de Botmaker en la que estaba el chat
  msg_id text,
  payload jsonb,            -- payload crudo completo del webhook
  creado_en timestamptz default now()
);
create index if not exists idx_mraw_conv on mensajes_raw (agente_id, telefono, creado_en desc);
create index if not exists idx_mraw_tipo on mensajes_raw (tipo, creado_en desc);
