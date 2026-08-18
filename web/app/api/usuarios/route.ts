import { validarPassword } from "@/lib/password";
import { crearUsuario, esTablaFaltante, listarUsuarios, normalizarEmail } from "@/lib/usuarios";
import { exigirAdmin } from "./guard";

// GET /api/usuarios — listado
export async function GET() {
  const g = await exigirAdmin();
  if (!g.ok) return g.res;

  try {
    return Response.json({ usuarios: await listarUsuarios() });
  } catch (e) {
    if (esTablaFaltante(e)) {
      return Response.json({ usuarios: [], migrado: false });
    }
    throw e;
  }
}

// POST /api/usuarios — alta
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const email = normalizarEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");
  const rol = body.rol === "admin" ? "admin" : "usuario";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "Email inválido." }, { status: 400 });
  }
  // Sin contraseña la cuenta queda solo-Google, que es válido pero requiere
  // que Google esté configurado. Si mandan una, tiene que ser decente.
  if (password) {
    const problema = validarPassword(password);
    if (problema) return Response.json({ error: problema }, { status: 400 });
  }

  try {
    const usuario = await crearUsuario({
      email,
      nombre: String(body.nombre ?? ""),
      password: password || undefined,
      rol,
    });
    return Response.json({ usuario }, { status: 201 });
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "23505") {
      return Response.json({ error: "Ya existe un usuario con ese email." }, { status: 409 });
    }
    if (esTablaFaltante(e)) {
      return Response.json({ error: "Falta correr db/22-usuarios.sql." }, { status: 503 });
    }
    throw e;
  }
}
