-- 19: soporte del proveedor de transporte Kapso (alternativa a Botmaker).
-- El motor es multi-proveedor: canales.plataforma decide el transporte.
-- El "cerebro" (router/RAG/guardrails) es el mismo; solo cambia entrada/envío/handoff.

-- Credenciales Kapso por canal. canal_numero sigue siendo la clave visible;
-- para Kapso el lookup del webhook entrante es por kapso_phone_number_id.
alter table canales add column if not exists kapso_api_key text;
alter table canales add column if not exists kapso_phone_number_id text;
create index if not exists idx_canales_kapso_pnid on canales (kapso_phone_number_id) where kapso_phone_number_id is not null;

-- normaliza plataforma: los canales viejos ('whatsapp' o null) son botmaker.
update canales set plataforma = 'botmaker'
  where plataforma is null or plataforma not in ('botmaker','kapso');

-- Asesores humanos para el round-robin de handoff en Kapso.
-- kapso_user_id = user_id del asesor en el proyecto Kapso (GET /platform/v1/users).
create table if not exists asesores_kapso (
  id uuid primary key default gen_random_uuid(),
  canal_id uuid not null references canales(id) on delete cascade,
  kapso_user_id uuid not null,
  nombre text,
  activo boolean not null default true,
  last_assigned_at timestamptz,          -- para round-robin "menos-reciente-primero"
  creado_en timestamptz not null default now(),
  unique (canal_id, kapso_user_id)
);
create index if not exists idx_asesores_kapso_canal on asesores_kapso (canal_id, activo, last_assigned_at nulls first);

-- Estado del handoff Kapso en la conversación (para poder devolver el control al bot).
alter table conversaciones add column if not exists kapso_conversation_id text;
alter table conversaciones add column if not exists kapso_assignment_id text;
