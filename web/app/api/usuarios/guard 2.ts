import { auth } from "@/auth";

/**
 * Devuelve la sesión si es admin, o una Response de error si no.
 * El middleware ya exige sesión; esto agrega el rol, que el middleware no
 * chequea para no atarse a la base.
 */
export async function exigirAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; res: Response }
> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, res: Response.json({ error: "no autenticado" }, { status: 401 }) };
  }
  if (session.user.rol !== "admin") {
    return { ok: false, res: Response.json({ error: "necesitás rol admin" }, { status: 403 }) };
  }
  return { ok: true, userId: session.user.id };
}
