-- ============================================================
--  Cola de atención del bot (por canal).
--  Si está seteada, el bot SOLO responde a mensajes cuya cola de
--  origen (messages[].queue de Botmaker) coincida con este valor.
--  Si está vacía/null, el bot atiende en cualquier cola.
-- ============================================================
alter table canales add column if not exists cola_atencion text;
