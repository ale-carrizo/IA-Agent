-- ============================================================
--  Cobro por crédito (ej. MIU): algunas universidades no cotizan
--  el programa completo sino por crédito académico (costo x crédito,
--  créditos base + créditos de especialización). Columnas opcionales
--  y nulas por default: no afectan a los cursos existentes de otras
--  universidades, que siguen usando 'precio' como texto libre.
-- ============================================================
alter table cursos add column if not exists cobro_por_credito bool default false;
alter table cursos add column if not exists costo_credito numeric;
alter table cursos add column if not exists creditos_totales int;
alter table cursos add column if not exists creditos_base int;
alter table cursos add column if not exists creditos_especializacion int;
alter table cursos add column if not exists moneda text default 'USD';
