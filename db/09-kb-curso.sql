-- ============================================================
--  Link opcional documento de KB -> curso.
--  Formaliza el antiguo campo de texto 'programa'. Un documento sin
--  curso (curso_id null) es KB "general" (accesible para cualquier curso).
--  El filtrado del RAG por curso (Fase 2) se hace por join kb_embeddings
--  -> documentos_kb.doc_id -> curso_id (no requiere tocar la ingesta).
-- ============================================================
alter table documentos_kb add column if not exists curso_id uuid references cursos(id) on delete set null;
create index if not exists idx_documentos_kb_curso on documentos_kb (curso_id);
