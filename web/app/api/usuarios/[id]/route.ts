import { validarPassword } from "@/lib/password";
import {
  actualizarUsuario,
  borrarUsuario,
  contarAdminsActivos,
  obtenerUsuario,
} from "@/lib/usuarios";
import { exigirAdmin } from "../guard";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/usuarios/:id — modificación (nombre, rol, activo, contraseña)
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await exigirAdmin();
  if (!g.ok) return g.res;

  const { id } = await params;
  const actual = await obtenerUsuario(id);
  if (!actual) return Response.json({ error: "No existe ese usuario." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const cambios: { nombre?: string; rol?: "admin" | "usuario"; activo?: boolean; password?: string } = {};

  if (body.nombre !== undefined) cambios.nombre = String(body.nombre);
  if (body.rol !== undefined) cambios.rol = body.rol === "admin" ? "admin" : "usuario";
  if (body.activo !== undefined) cambios.activo = Boolean(body.activo);
  if (body.password) {
    const problema = validarPassword(String(body.password));
    if (problema) return Response.json({ error: problema }, { status: 400 });
    cambios.password = String(body.password);
  }

  // Nadie se saca a sí mismo el admin ni se desactiva: el que lo hace queda
  // afuera del ABM en el mismo request.
  if (id === g.userId && (cambios.rol === "usuario" || cambios.activo === false)) {
    return Response.json(
      { error: "No podés quitarte tu propio acceso de admin." },
      { status: 400 },
    );
  }

  // Y el panel no puede quedarse sin ningún admin activo.
  const pierdeAdmin =
    actual.rol === "admin" && actual.activo && (cambios.rol === "usuario" || cambios.activo === false);
  if (pierdeAdmin && (await contarAdminsActivos(id)) === 0) {
    return Response.json(
      { error: "Es el único admin activo. Designá otro antes de cambiarlo." },
      { status: 409 },
    );
  }

  return Response.json({ usuario: await actualizarUsuario(id, cambios) });
}

// DELETE /api/usuarios/:id — baja definitiva
export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await exigirAdmin();
  if (!g.ok) return g.res;

  const { id } = await params;
  if (id === g.userId) {
    return Response.json({ error: "No podés borrar tu propia cuenta." }, { status: 400 });
  }

  const actual = await obtenerUsuario(id);
  if (!actual) return new Response(null, { status: 204 });

  if (actual.rol === "admin" && actual.activo && (await contarAdminsActivos(id)) === 0) {
    return Response.json(
      { error: "Es el único admin activo. Designá otro antes de borrarlo." },
      { status: 409 },
    );
  }

  await borrarUsuario(id);
  return new Response(null, { status: 204 });
}
