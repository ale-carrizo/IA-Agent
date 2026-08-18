import { db } from "@/lib/db";
import { hashearPassword } from "@/lib/password";

export type Rol = "admin" | "usuario";

export type Usuario = {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  ultimo_ingreso: string | null;
  creado_en: string;
  tiene_password: boolean;
};

const CAMPOS = `id, email, nombre, rol, activo, ultimo_ingreso, creado_en,
                (password_hash is not null) as tiene_password`;

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const { rows } = await db.query(
    `select ${CAMPOS} from usuarios order by (rol = 'admin') desc, email`,
  );
  return rows;
}

export async function obtenerUsuario(id: string): Promise<Usuario | null> {
  const { rows } = await db.query(`select ${CAMPOS} from usuarios where id = $1`, [id]);
  return rows[0] ?? null;
}

/** Fila completa (incluye el hash). Solo para el login. */
export async function buscarParaLogin(email: string) {
  const { rows } = await db.query(
    `select id, email, nombre, rol, activo, password_hash
       from usuarios where email = $1`,
    [normalizarEmail(email)],
  );
  return rows[0] ?? null;
}

export async function registrarIngreso(id: string): Promise<void> {
  await db.query("update usuarios set ultimo_ingreso = now() where id = $1", [id]);
}

export async function crearUsuario(datos: {
  email: string;
  nombre?: string;
  password?: string;
  rol?: Rol;
}): Promise<Usuario> {
  const hash = datos.password ? await hashearPassword(datos.password) : null;
  const { rows } = await db.query(
    `insert into usuarios (email, nombre, password_hash, rol)
     values ($1, $2, $3, $4) returning ${CAMPOS}`,
    [normalizarEmail(datos.email), datos.nombre?.trim() ?? "", hash, datos.rol ?? "usuario"],
  );
  return rows[0];
}

export async function actualizarUsuario(
  id: string,
  datos: { nombre?: string; rol?: Rol; activo?: boolean; password?: string },
): Promise<Usuario | null> {
  const sets: string[] = ["actualizado_en = now()"];
  const vals: unknown[] = [];
  const add = (sql: string, valor: unknown) => {
    vals.push(valor);
    sets.push(`${sql} = $${vals.length}`);
  };

  if (datos.nombre !== undefined) add("nombre", datos.nombre.trim());
  if (datos.rol !== undefined) add("rol", datos.rol);
  if (datos.activo !== undefined) add("activo", datos.activo);
  if (datos.password) add("password_hash", await hashearPassword(datos.password));

  vals.push(id);
  const { rows } = await db.query(
    `update usuarios set ${sets.join(", ")} where id = $${vals.length} returning ${CAMPOS}`,
    vals,
  );
  return rows[0] ?? null;
}

export async function borrarUsuario(id: string): Promise<void> {
  await db.query("delete from usuarios where id = $1", [id]);
}

/** Cuántos admin activos quedan. Se usa para no dejar el panel sin administrador. */
export async function contarAdminsActivos(exceptoId?: string): Promise<number> {
  const { rows } = await db.query(
    `select count(*)::int as n from usuarios
      where rol = 'admin' and activo and ($1::uuid is null or id <> $1)`,
    [exceptoId ?? null],
  );
  return rows[0].n;
}

/** true si la tabla todavía no existe (base sin migrar). */
export function esTablaFaltante(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "42P01";
}
