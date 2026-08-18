#!/usr/bin/env node
/**
 * Crea (o promueve) el primer usuario admin del panel.
 *
 *   DATABASE_URL=postgres://... node web/scripts/crear-admin.mjs <email> <password> [nombre]
 *
 * Si el email ya existe, le pone rol admin, lo reactiva y le cambia la clave.
 * La contraseña se pasa por argumento y queda en el historial del shell:
 * cambiala desde el panel si te importa.
 */
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const scrypt = promisify(scryptCb);

const [email, password, ...resto] = process.argv.slice(2);
const nombre = resto.join(" ");

if (!email || !password) {
  console.error("Uso: node web/scripts/crear-admin.mjs <email> <password> [nombre]");
  process.exit(1);
}
if (password.length < 10 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
  console.error("La contraseña necesita 10+ caracteres, con letras y números.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en el entorno.");
  process.exit(1);
}

const salt = randomBytes(16);
const derivada = await scrypt(password, salt, 64);
const hash = `scrypt$${salt.toString("base64")}$${derivada.toString("base64")}`;

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const { rows } = await db.query(
    `insert into usuarios (email, nombre, password_hash, rol, activo)
     values ($1, $2, $3, 'admin', true)
     on conflict (email) do update
       set password_hash = excluded.password_hash,
           rol = 'admin',
           activo = true,
           nombre = coalesce(nullif(excluded.nombre, ''), usuarios.nombre),
           actualizado_en = now()
     returning id, email, rol, activo, (xmax = 0) as creado`,
    [email.trim().toLowerCase(), nombre, hash],
  );
  const u = rows[0];
  console.log(`${u.creado ? "Creado" : "Actualizado"}: ${u.email} (rol ${u.rol})`);
} catch (e) {
  if (e.code === "42P01") {
    console.error("No existe la tabla `usuarios`. Corré primero db/22-usuarios.sql.");
    process.exit(1);
  }
  throw e;
} finally {
  await db.end();
}
