import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// scrypt de node: sin dependencias nuevas y sin binarios nativos que compilar
// en el build de Railway (bcrypt trae ambas cosas).
const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const LARGO_CLAVE = 64;
const LARGO_SALT = 16;

/** Devuelve `scrypt$<salt_b64>$<derivada_b64>`. Nunca guardes el texto plano. */
export async function hashearPassword(plano: string): Promise<string> {
  const salt = randomBytes(LARGO_SALT);
  const derivada = await scrypt(plano, salt, LARGO_CLAVE);
  return `scrypt$${salt.toString("base64")}$${derivada.toString("base64")}`;
}

/**
 * Compara en tiempo constante. Devuelve false ante cualquier formato raro o
 * hash nulo (cuenta solo-Google) en vez de tirar: el login no debe distinguir
 * "no existe" de "clave incorrecta".
 */
export async function verificarPassword(plano: string, guardado: string | null): Promise<boolean> {
  if (!guardado) return false;
  const partes = guardado.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;

  let salt: Buffer;
  let esperada: Buffer;
  try {
    salt = Buffer.from(partes[1], "base64");
    esperada = Buffer.from(partes[2], "base64");
  } catch {
    return false;
  }
  if (esperada.length !== LARGO_CLAVE) return false;

  const derivada = await scrypt(plano, salt, LARGO_CLAVE);
  return timingSafeEqual(derivada, esperada);
}

/** Reglas mínimas para no aceptar claves triviales desde el ABM. */
export function validarPassword(plano: string): string | null {
  if (plano.length < 10) return "La contraseña necesita al menos 10 caracteres.";
  if (!/[a-zA-Z]/.test(plano)) return "La contraseña necesita al menos una letra.";
  if (!/[0-9]/.test(plano)) return "La contraseña necesita al menos un número.";
  return null;
}
