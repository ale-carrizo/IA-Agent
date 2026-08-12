-- Se corre PRIMERO (orden alfabético) al crear el volumen de Postgres.
-- Deja listas las extensiones y el schema propio de n8n.
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists vector;        -- embeddings de la KB (pgvector)
create schema if not exists n8n;              -- n8n guarda sus workflows acá, separado del motor
