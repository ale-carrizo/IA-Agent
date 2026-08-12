-- ============================================================
--  Quota de tokens por agente (para topar el gasto por cliente).
--  NULL = sin límite. La columna vive por agente; el dashboard la
--  agrega por tenant. El enforcement en el motor es una 2ª fase.
-- ============================================================
alter table agentes add column if not exists limite_tokens_mes bigint;
