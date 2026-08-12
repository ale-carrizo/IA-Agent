-- ============================================================
--  Índice HNSW para RAG rápido a escala en kb_embeddings.
--  El motor busca con:  order by embedding <=> '<vec>'::vector  (distancia coseno)
--  => el índice usa vector_cosine_ops para acelerar ese ORDER BY.
--  CONCURRENTLY: no bloquea escrituras (aunque hoy la tabla es chica).
--  Idempotente: IF NOT EXISTS.
-- ============================================================
create index concurrently if not exists idx_kb_embeddings_hnsw
  on kb_embeddings using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
