-- ============================================================
--  21: SEED del dominio licitaciones (datos de prueba / demo)
--
--  Subset chico del vademécum + proveedores ficticios + quién vende
--  qué. Alcanza para correr el caso E2E de la §8 del brief sin datos
--  reales del cliente.
--
--  Los `embedding` quedan en NULL a propósito: se rellenan corriendo
--    python -m app.cli embeddings
--  desde negociacion/ (necesita OPENAI_API_KEY). Mientras estén en
--  NULL el normalizador cae al match léxico, que para este seed
--  alcanza y deja los tests corriendo sin llamar a ninguna API.
--
--  Idempotente: se puede correr varias veces.
--  Manual:  psql "$DATABASE_URL" -f db/21-licitaciones-seed.sql
-- ============================================================

-- ── Catálogo maestro ────────────────────────────────────────
insert into catalogo_maestro
  (droga, concentracion, forma, presentacion, unidades_por_presentacion, codigo_externo, laboratorio)
values
  ('Amoxicilina',            '500 mg',    'comprimido', 'caja x100',  100, 'AR-AMX-500-100', 'Richmond'),
  ('Amoxicilina',            '875 mg',    'comprimido', 'caja x14',    14, 'AR-AMX-875-14',  'Richmond'),
  ('Amoxicilina',            '250 mg/5 ml','jarabe',    'frasco 120 ml', 1, 'AR-AMX-JBE-120','Bagó'),
  ('Ceftriaxona',            '1 g',       'ampolla',    'caja x50',    50, 'AR-CFT-1G-50',   'Fabra'),
  ('Ceftriaxona',            '1 g',       'ampolla',    'ampolla x1',   1, 'AR-CFT-1G-1',    'Fabra'),
  ('Ceftriaxona',            '500 mg',    'ampolla',    'caja x50',    50, 'AR-CFT-500-50',  'Fabra'),
  -- Ibuprofeno 600 existe en DOS tamaños de caja a propósito: es el caso en el
  -- que "te lo paso por caja" (sin decir de cuántas) NO se puede inferir y hay
  -- que re-preguntar. Sin un caso así, el normalizador nunca se ejercita.
  ('Ibuprofeno',             '600 mg',    'comprimido', 'caja x100',  100, 'AR-IBU-600-100', 'Bagó'),
  ('Ibuprofeno',             '600 mg',    'comprimido', 'caja x50',    50, 'AR-IBU-600-50',  'Bagó'),
  ('Paracetamol',            '500 mg',    'comprimido', 'caja x100',  100, 'AR-PAR-500-100', 'Elea'),
  ('Dipirona',               '500 mg',    'comprimido', 'caja x100',  100, 'AR-DIP-500-100', 'Roemmers'),
  ('Omeprazol',              '20 mg',     'cápsula',    'caja x30',    30, 'AR-OME-20-30',   'Gador'),
  ('Enalapril',              '10 mg',     'comprimido', 'caja x60',    60, 'AR-ENA-10-60',   'Roemmers'),
  ('Metformina',             '850 mg',    'comprimido', 'caja x60',    60, 'AR-MET-850-60',  'Montpellier'),
  ('Heparina sódica',        '5000 UI/ml','ampolla',    'caja x50',    50, 'AR-HEP-5000-50', 'Northia'),
  ('Dexametasona',           '8 mg/2 ml', 'ampolla',    'caja x25',    25, 'AR-DEX-8-25',    'Fada'),
  ('Ranitidina',             '50 mg/2 ml','ampolla',    'caja x25',    25, 'AR-RAN-50-25',   'Fada'),
  ('Solución fisiológica',   '0,9%',      'solución',   'sachet 500 ml', 1,'AR-SF-500',      'Rivero'),
  ('Ondansetrón',            '8 mg',      'ampolla',    'caja x5',      5, 'AR-OND-8-5',     'Kampel'),
  ('Midazolam',              '5 mg/5 ml', 'ampolla',    'caja x50',    50, 'AR-MDZ-5-50',    'Northia'),
  ('Vancomicina',            '500 mg',    'ampolla',    'frasco x1',    1, 'AR-VAN-500-1',   'Fresenius'),
  ('Meropenem',              '1 g',       'ampolla',    'frasco x1',    1, 'AR-MER-1G-1',    'Fresenius')
-- el índice único de codigo_externo es parcial (where not null) → hay que repetir
-- el predicado para que Postgres pueda inferirlo en el ON CONFLICT.
on conflict (codigo_externo) where codigo_externo is not null do nothing;

-- ── Proveedores de prueba ───────────────────────────────────
insert into proveedores (nombre, telefono_e164, contacto, canal_preferido)
values
  ('Laboratorio Andes',      '5491133330001', 'Marina (ventas)',  'whatsapp'),
  ('Distribuidora del Plata','5491133330002', 'Jorge',            'whatsapp'),
  ('Farma Sur',              '5491133330003', 'Vale',             'whatsapp'),
  ('Droguería Central SRL',  '5491133330004', 'Mesa de precios',  'whatsapp'),
  ('Insumos Pampa',          '5491133330005', 'Nico',             'whatsapp')
on conflict (telefono_e164) do nothing;

-- ── Vademécum por proveedor ─────────────────────────────────
-- Se arma por producto para no hardcodear ids: cada proveedor vende un
-- subconjunto, con solapamiento (necesario para que la auditoría pueda
-- exigir ≥2 precios comparables en la mayoría de los ítems).
insert into proveedores_items (proveedor_id, producto_id, ultimo_precio, ultima_fecha)
select p.id, c.id, v.precio, current_date - 30
from (values
  ('5491133330001', 'AR-AMX-500-100',  380.00),
  ('5491133330001', 'AR-CFT-1G-50',   1850.00),
  ('5491133330001', 'AR-IBU-600-100',  145.00),
  ('5491133330001', 'AR-PAR-500-100',   95.00),
  ('5491133330001', 'AR-OME-20-30',    210.00),
  ('5491133330001', 'AR-HEP-5000-50', 2400.00),

  ('5491133330002', 'AR-AMX-500-100',  395.00),
  ('5491133330002', 'AR-CFT-1G-50',   1790.00),
  ('5491133330002', 'AR-DIP-500-100',  130.00),
  ('5491133330002', 'AR-ENA-10-60',    118.00),
  ('5491133330002', 'AR-MET-850-60',   140.00),
  ('5491133330002', 'AR-DEX-8-25',     620.00),

  ('5491133330003', 'AR-AMX-500-100',  372.00),
  ('5491133330003', 'AR-IBU-600-100',  152.00),
  ('5491133330003', 'AR-PAR-500-100',   99.00),
  ('5491133330003', 'AR-RAN-50-25',    340.00),
  ('5491133330003', 'AR-OND-8-5',     1180.00),
  ('5491133330003', 'AR-SF-500',       410.00),

  ('5491133330004', 'AR-CFT-1G-50',   1880.00),
  ('5491133330004', 'AR-CFT-500-50',  1290.00),
  ('5491133330004', 'AR-MDZ-5-50',     980.00),
  ('5491133330004', 'AR-VAN-500-1',   3200.00),
  ('5491133330004', 'AR-MER-1G-1',    5400.00),
  ('5491133330004', 'AR-DEX-8-25',     640.00),

  ('5491133330005', 'AR-SF-500',       395.00),
  ('5491133330005', 'AR-HEP-5000-50', 2350.00),
  ('5491133330005', 'AR-OME-20-30',    205.00),
  ('5491133330005', 'AR-MET-850-60',   136.00),
  ('5491133330005', 'AR-ENA-10-60',    122.00),
  ('5491133330005', 'AR-OND-8-5',     1230.00)
) as v(tel, cod, precio)
join proveedores p       on p.telefono_e164 = v.tel
join catalogo_maestro c  on c.codigo_externo = v.cod
on conflict (proveedor_id, producto_id) do nothing;
