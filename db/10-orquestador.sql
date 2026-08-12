-- Orquestador editable: estrategia del router + comportamiento global del responder, por agente.
-- Se editan desde el frontend (sección "Orquestador"); el motor los lee en runtime (fallback a default en código).
alter table agentes add column if not exists orquestador_prompt   text;  -- estrategia interna del router (el lead NO la ve)
alter table agentes add column if not exists comportamiento_global text;  -- empatía/tono con el que el agente le habla al lead (todas las etapas)
