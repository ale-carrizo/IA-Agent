-- ============================================================
--  20: DOMINIO LICITACIONES (droguería · cotización automática)
--
--  Este es el BLACKBOARD del sistema nuevo. Vive al lado del motor
--  de agentes existente, en la MISMA base, sin tocar ninguna de sus
--  tablas: el motor conversacional y sus tenants en producción no se
--  modifican. Lo único que se comparte es el Postgres, los canales y
--  el panel.
--
--  Reglas del dominio que el esquema hace cumplir:
--   · `descripcion_original` y `raw_respuesta` NUNCA se pisan: son el
--     audit trail y la materia prima del golden dataset.
--   · `eventos` es append-only → permite replay completo de cualquier
--     licitación (por eso no hace falta Kafka/Rabbit).
--   · Una cotización = un (ítem × proveedor). UNIQUE lo garantiza.
--   · El precio que entra al presupuesto sale de `decidir()` (código
--     puro en el servicio Python), nunca de un LLM.
--
--  Idempotente: se puede correr sobre una base ya migrada.
--  Manual:  psql "$DATABASE_URL" -f db/20-licitaciones.sql
-- ============================================================

create extension if not exists vector;    -- ya está en 00-init, por si se corre suelto

-- ------------------------------------------------------------
--  CATÁLOGO MAESTRO
--  Vademécum normalizado. Es contra esta tabla que el normalizador
--  matchea el texto crudo del proveedor ("la amoxi de 500").
--  `embedding` = mismo modelo/dimensión que kb_embeddings (1536),
--  para reusar la infraestructura de RAG que ya existe.
-- ------------------------------------------------------------
create table if not exists catalogo_maestro (
  id                        bigserial primary key,
  droga                     text not null,          -- principio activo
  concentracion             text not null,          -- '500 mg'
  forma                     text not null,          -- comprimido | ampolla | jarabe | ...
  presentacion              text not null,          -- 'caja x100'
  unidades_por_presentacion int  not null check (unidades_por_presentacion > 0),
  codigo_externo            text,                   -- ANMAT / Alfabeta / troquel
  laboratorio               text,
  activo                    boolean not null default true,
  embedding                 vector(1536),
  creado                    timestamptz not null default now()
);

-- El normalizador busca por similitud coseno:  order by embedding <=> $1::vector
create index if not exists idx_catalogo_hnsw
  on catalogo_maestro using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Fallback léxico cuando no hay embedding disponible (o para desempatar).
create index if not exists idx_catalogo_droga on catalogo_maestro (lower(droga));
create unique index if not exists idx_catalogo_codigo
  on catalogo_maestro (codigo_externo) where codigo_externo is not null;

-- ------------------------------------------------------------
--  PROVEEDORES
--  `telefono_e164` sin '+', mismo formato que usa el motor existente
--  (contactId de Botmaker / preseed_mapa) para poder resolver el
--  proveedor a partir del webhook entrante.
-- ------------------------------------------------------------
create table if not exists proveedores (
  id               bigserial primary key,
  nombre           text not null,
  telefono_e164    text unique not null,
  contacto         text,
  canal_preferido  text not null default 'whatsapp',   -- whatsapp | voz | manual
  activo           boolean not null default true,
  notas            text,
  creado           timestamptz not null default now()
);

-- ------------------------------------------------------------
--  VADEMÉCUM POR PROVEEDOR: quién vende qué, y a cuánto la última vez.
--  `ultimo_precio` es la base del check de outlier de la auditoría
--  (±30%) y del cálculo sugerido de precio_max_aceptable.
-- ------------------------------------------------------------
create table if not exists proveedores_items (
  proveedor_id  bigint not null references proveedores(id) on delete cascade,
  producto_id   bigint not null references catalogo_maestro(id) on delete cascade,
  ultimo_precio numeric(14,2),          -- precio UNITARIO histórico
  ultima_fecha  date,
  primary key (proveedor_id, producto_id)
);
create index if not exists idx_prov_items_producto on proveedores_items (producto_id);

-- ------------------------------------------------------------
--  LICITACIONES
--  `cierre_recoleccion` es el deadline INTERNO (antes del real): a esa
--  hora el supervisor corta la recolección y dispara la auditoría.
-- ------------------------------------------------------------
create table if not exists licitaciones (
  id                  bigserial primary key,
  hospital            text not null,
  expediente          text,                     -- nro de expediente/pliego del hospital
  cierre_presentacion timestamptz not null,
  cierre_recoleccion  timestamptz not null,
  margen_pct          numeric(5,2) not null,
  estado              text not null default 'abierta',
  -- abierta | recolectando | auditando | aprobada | presentada | perdida | ganada
  creado              timestamptz not null default now(),
  actualizado         timestamptz not null default now(),
  constraint ck_licitaciones_estado check (estado in
    ('abierta','recolectando','auditando','aprobada','presentada','perdida','ganada')),
  constraint ck_licitaciones_cierres check (cierre_recoleccion <= cierre_presentacion)
);
create index if not exists idx_licitaciones_estado on licitaciones (estado, cierre_recoleccion);

-- ------------------------------------------------------------
--  ÍTEMS DE LA LICITACIÓN
--  `producto_id` NULL = el pliego no matcheó contra el catálogo al
--  cargar → excepción humana antes de pedir precios (no se adivina).
--  `precio_max_aceptable` es EL SOBRE de la política: por arriba de
--  eso `decidir()` no acepta. Se calcula del histórico × factor y el
--  humano puede pisarlo desde el panel.
-- ------------------------------------------------------------
create table if not exists items_licitacion (
  id                     bigserial primary key,
  licitacion_id          bigint not null references licitaciones(id) on delete cascade,
  producto_id            bigint references catalogo_maestro(id),
  descripcion_original   text not null,          -- texto crudo del pliego, SIEMPRE
  cantidad               int  not null check (cantidad > 0),
  presentacion_requerida text not null,
  precio_max_aceptable   numeric(14,2),
  precio_objetivo        numeric(14,2),
  orden                  int,                    -- posición en el pliego
  creado                 timestamptz not null default now()
);
create index if not exists idx_items_licitacion on items_licitacion (licitacion_id, orden);
create index if not exists idx_items_producto on items_licitacion (producto_id);

-- ------------------------------------------------------------
--  COTIZACIONES  (una por ítem × proveedor)
--
--  `thread_id` es el thread de LangGraph. OJO: es el mismo para todas
--  las cotizaciones de un (proveedor × licitación), porque la
--  conversación de WhatsApp es una sola y cubre todos sus ítems.
--
--  Los contadores (`counters_hechos`, `recordatorios_enviados`) están
--  acá y no en el checkpoint porque la POLÍTICA los lee: `decidir()`
--  es una función pura y necesita recibirlos como dato de entrada.
-- ------------------------------------------------------------
create table if not exists cotizaciones (
  id                      bigserial primary key,
  item_id                 bigint not null references items_licitacion(id) on delete cascade,
  proveedor_id            bigint not null references proveedores(id),
  estado                  text not null default 'pendiente',
  -- pendiente | solicitada | esperando | aclarando | confirmada
  -- | sin_stock | vencida | descartada | excepcion_humana
  precio_unitario         numeric(14,2),
  precio_por_presentacion numeric(14,2),
  presentacion_ofrecida   text,
  unidades_ofrecidas      int,                   -- unidades por presentación ofrecida
  condiciones             jsonb not null default '{}'::jsonb,  -- pago, vencimiento, entrega
  confianza               numeric(3,2),          -- score del normalizador (0..1)
  canal                   text,                  -- whatsapp | voz | manual
  raw_respuesta           text,                  -- texto crudo del proveedor, SIEMPRE
  thread_id               uuid,                  -- thread LangGraph de esa conversación
  counters_hechos         int  not null default 0,
  recordatorios_enviados  int  not null default 0,
  solicitada_en           timestamptz,
  respondida_en           timestamptz,
  actualizado             timestamptz not null default now(),
  unique (item_id, proveedor_id),
  constraint ck_cotizaciones_estado check (estado in
    ('pendiente','solicitada','esperando','aclarando','confirmada',
     'sin_stock','vencida','descartada','excepcion_humana'))
);
create index if not exists idx_cotizaciones_item on cotizaciones (item_id);
create index if not exists idx_cotizaciones_prov on cotizaciones (proveedor_id, estado);
create index if not exists idx_cotizaciones_thread on cotizaciones (thread_id);

-- ------------------------------------------------------------
--  EVENTOS  (append-only · replay + auditoría)
--  Sin FK duras a propósito: el evento sobrevive al borrado de la fila
--  que lo originó. Es el log, no un índice.
-- ------------------------------------------------------------
create table if not exists eventos (
  id            bigserial primary key,
  licitacion_id bigint,
  cotizacion_id bigint,
  tipo          text not null,
  -- licitacion.creada | cotizacion.solicitada | respuesta.recibida
  -- | cotizacion.confirmada | cotizacion.ambigua | cotizacion.excepcion
  -- | escalacion.voz | recoleccion.cerrada | auditoria.ok | auditoria.bloqueada
  -- | presupuesto.aprobado
  payload       jsonb not null default '{}'::jsonb,
  creado        timestamptz not null default now()
);
create index if not exists idx_eventos_licitacion on eventos (licitacion_id, id desc);
create index if not exists idx_eventos_cotizacion on eventos (cotizacion_id, id desc);
create index if not exists idx_eventos_tipo on eventos (tipo, creado desc);

-- NOTIFY para el panel en vivo. V1 el panel hace polling cada 5 s; el
-- canal ya queda publicado para que V2 (SSE sobre LISTEN/NOTIFY) sea
-- sólo trabajo de frontend.
create or replace function notificar_evento_licitacion() returns trigger as $$
begin
  perform pg_notify(
    'eventos_licitacion',
    json_build_object(
      'id', new.id,
      'licitacion_id', new.licitacion_id,
      'cotizacion_id', new.cotizacion_id,
      'tipo', new.tipo
    )::text
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_eventos_notify on eventos;
create trigger trg_eventos_notify after insert on eventos
  for each row execute function notificar_evento_licitacion();

-- ------------------------------------------------------------
--  EXCEPCIONES  (proyección consultable de los interrupt() de LangGraph)
--
--  La fuente de verdad del "pausa/reanuda" es el checkpoint de
--  LangGraph. Esta tabla NO lo reemplaza: es la proyección que el
--  panel necesita para listar y ordenar la cola sin tener que leer
--  checkpoints. Se crea al interrumpir y se cierra al hacer /resume.
-- ------------------------------------------------------------
create table if not exists excepciones (
  id             bigserial primary key,
  licitacion_id  bigint not null references licitaciones(id) on delete cascade,
  cotizacion_id  bigint references cotizaciones(id) on delete cascade,
  thread_id      uuid   not null,
  tipo           text   not null,       -- condicion_fuera_de_politica | item_sin_match | aprobacion_final
  motivo         text   not null,       -- qué disparó la excepción, legible por el operador
  contexto       jsonb  not null default '{}'::jsonb,  -- raw + qué pidió la política
  estado         text   not null default 'pendiente',  -- pendiente | resuelta | descartada
  decision       jsonb,                 -- lo que el humano eligió (payload del resume)
  resuelta_por   text,
  creado         timestamptz not null default now(),
  resuelta_en    timestamptz,
  constraint ck_excepciones_estado check (estado in ('pendiente','resuelta','descartada'))
);
create index if not exists idx_excepciones_pendientes
  on excepciones (licitacion_id, estado, creado) where estado = 'pendiente';
create index if not exists idx_excepciones_thread on excepciones (thread_id);

-- ------------------------------------------------------------
--  PRESUPUESTOS  (resultado del gate humano)
--  Se guarda el snapshot completo: qué cotización se eligió por ítem,
--  con qué precio y de qué mensaje crudo salió. Un presupuesto
--  aprobado tiene que poder auditarse aunque después cambien precios.
-- ------------------------------------------------------------
create table if not exists presupuestos (
  id            bigserial primary key,
  licitacion_id bigint not null references licitaciones(id) on delete cascade,
  margen_pct    numeric(5,2) not null,
  total         numeric(16,2) not null,
  lineas        jsonb not null,         -- [{item_id, producto, cantidad, proveedor, precio_unitario, precio_final, raw, hora, canal}]
  aprobado_por  text,
  creado        timestamptz not null default now()
);
create index if not exists idx_presupuestos_licitacion on presupuestos (licitacion_id, creado desc);

-- ------------------------------------------------------------
--  actualizado: se mantiene solo (evita depender de que la app lo setee)
-- ------------------------------------------------------------
create or replace function tocar_actualizado() returns trigger as $$
begin
  new.actualizado := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_cotizaciones_touch on cotizaciones;
create trigger trg_cotizaciones_touch before update on cotizaciones
  for each row execute function tocar_actualizado();

drop trigger if exists trg_licitaciones_touch on licitaciones;
create trigger trg_licitaciones_touch before update on licitaciones
  for each row execute function tocar_actualizado();
