-- Dedup del sync de tokens: cada ejecución del motor se loguea una sola vez.
-- (unique normal: Postgres trata los NULL como distintos, así que no molesta al path viejo)
alter table uso_tokens add column if not exists execution_id text;
create unique index if not exists uq_uso_tokens_execution on uso_tokens (execution_id);
