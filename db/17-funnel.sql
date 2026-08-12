-- ============================================================
--  Funnel de Leads (sección "Funnel de Leads" del panel).
--
--  Tipificación estilo contact center, calculada EN LECTURA a partir
--  de datos que el motor ya genera:
--    - interesado    -> transbordado a humano o llegó a etapa SQL
--    - potencial     -> llegó a etapa SAL, o avanzó de etapa con
--                       buena parte de la ficha completa
--    - responde      -> respondió por WhatsApp hace menos de 24 h
--    - no_responde   -> respondió alguna vez pero está en silencio
--    - no_contesta   -> nunca respondió (ej: HSM enviado sin respuesta)
--
--  Fuentes: etapa_actual_id + etapas.orden/calificacion, ficha
--  (variables_recolectadas vs agente_variables), ultimo_mensaje_lead,
--  mensajes_log (turnos del lead), transbordado, conversacion_eventos.
--
--  Estas columnas son SOLO el override manual del humano desde el
--  panel (pisar la tipificación y dejar notas). Si lead_estado es
--  null, la tipificación se deriva automáticamente. Sin check rígido:
--  la validación de valores vive en la API (evita migrar por cada
--  cambio de tipificaciones).
-- ============================================================

alter table conversaciones add column if not exists lead_estado text;
alter table conversaciones add column if not exists lead_notas text;

-- si una versión anterior de esta migración dejó un check sobre
-- lead_estado (ganado/perdido/descartado), sacarlo
do $$
declare cname text;
begin
  select conname into cname from pg_constraint
   where conrelid = 'conversaciones'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%lead_estado%';
  if cname is not null then
    execute format('alter table conversaciones drop constraint %I', cname);
  end if;
end $$;

-- el funnel lista por agente ordenado por actividad
create index if not exists idx_conv_agente_actividad
  on conversaciones (agente_id, ultima_actividad desc);
