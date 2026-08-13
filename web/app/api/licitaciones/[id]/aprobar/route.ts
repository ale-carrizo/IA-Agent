import { auth } from "@/auth";
import { servicio, ServicioNoConfigurado } from "@/lib/licitaciones";

// POST /api/licitaciones/:id/aprobar
// EL GATE. Nada sale hacia el hospital sin pasar por acá, y acá sin un humano
// logueado no se pasa. El servicio vuelve a correr la auditoría y responde 409
// si algún check bloquea: el panel no puede saltearse esa verificación aunque
// muestre la pantalla en verde.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sesion = await auth().catch(() => null);
  const aprobadoPor = sesion?.user?.email ?? null;

  let body: { forzar?: boolean } = {};
  try {
    body = (await req.json()) as { forzar?: boolean };
  } catch {
    /* body vacío es válido */
  }

  try {
    const datos = await servicio(`/licitaciones/${Number(id)}/aprobar`, {
      method: "POST",
      body: { aprobado_por: aprobadoPor, forzar: body.forzar === true },
    });
    return Response.json(datos);
  } catch (e) {
    if (e instanceof ServicioNoConfigurado) {
      return Response.json({ error: e.message }, { status: 503 });
    }
    const err = e as Error & { estado?: number; datos?: unknown };
    // 409 = la auditoría bloqueó. Se devuelve el informe entero para que el
    // panel muestre exactamente qué falta.
    return Response.json(
      { error: err.message, detalle: err.datos },
      { status: err.estado ?? 502 }
    );
  }
}
