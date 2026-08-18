-- ============================================================
--  Usuarios del panel (login propio + ABM)
--
--  Reemplaza la allowlist por variables de entorno: quien puede
--  entrar es quien tiene fila acá con activo = true. El rol define
--  si además puede administrar usuarios.
--
--  password_hash null = la cuenta solo entra por Google (SSO).
--  El formato del hash es scrypt$<salt_b64>$<derivada_b64>; lo
--  genera web/lib/password.ts, no se guarda nada en claro.
-- ============================================================
create table if not exists usuarios (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,          -- siempre en minúsculas
  nombre          text not null default '',
  password_hash   text,
  rol             text not null default 'usuario',
  activo          boolean not null default true,
  ultimo_ingreso  timestamptz,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

alter table usuarios drop constraint if exists usuarios_rol_check;
alter table usuarios add constraint usuarios_rol_check check (rol in ('admin', 'usuario'));

-- El login busca por email en minúsculas; este índice cubre esa consulta.
create index if not exists idx_usuarios_activos on usuarios (email) where activo;

-- Sin seed de usuarios: el primer admin se crea con
--   node web/scripts/crear-admin.mjs <email> <password> [nombre]
-- para no dejar credenciales conocidas en el repo.
