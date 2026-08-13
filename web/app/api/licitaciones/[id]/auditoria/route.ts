import { servicio, ServicioNoConfigurado } from "@/lib/licitaciones";

// GET /api/licitaciones/:id/auditoria
// Proxy al servicio: los checks son lógica de dominio y viven en Python
// (`app/auditoria.py`), no duplicados en TypeScript. Un check que existiera en
// dos lugares se desincroniza el día que alguien toca uno solo.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const datos = await servicio(`/licitaciones/${Number(id)}/auditoria`);
    return Response.json(datos);
  } catch (e) {
    if (e instanceof ServicioNoConfigurado) {
      return Response.json({ error: e.message }, { status: 503 });
    }
    const err = e as Error & { estado?: number };
    return Response.json({ error: err.message }, { status: err.estado ?? 502 });
  }
}
