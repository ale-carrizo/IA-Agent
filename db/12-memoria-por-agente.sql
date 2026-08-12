-- ============================================================
--  Memoria del LLM aislada por agente (fix cross-tenant)
--  Antes: n8n_chat_histories.session_id = '<telefono>' → dos agentes
--  hablando con el mismo teléfono COMPARTÍAN historial.
--  Ahora: session_id = '<agente_id>:<telefono>' (el motor ya escribe así;
--  el bot UIC usa 'uic:<contactId>').
--  Esta migración renombra las sesiones existentes usando la conversación
--  más reciente de cada teléfono. Idempotente: saltea las ya prefijadas.
-- ============================================================
update n8n_chat_histories h
set session_id = c.agente_id || ':' || h.session_id
from (
  select distinct on (telefono) telefono, agente_id
  from conversaciones
  order by telefono, ultima_actividad desc nulls last
) c
where h.session_id = c.telefono
  and position(':' in h.session_id) = 0;
