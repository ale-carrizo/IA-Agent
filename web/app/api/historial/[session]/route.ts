import { db } from "@/lib/db";

// GET /api/historial/:session?agente_id=... -> mensajes del historial de n8n para esa sesión.
// Lee la tabla n8n_chat_histories que crea el nodo Postgres Chat Memory.
// La memoria está namespaceada por agente: session_id = '<agente_id>:<telefono>'.
// Con agente_id se arma la clave compuesta; sin él, se usa la sesión tal cual.
export async function GET(req: Request, { params }: { params: Promise<{ session: string }> }) {
  const { session } = await params;
  const agenteId = new URL(req.url).searchParams.get("agente_id");
  const sessionId = agenteId ? `${agenteId}:${session}` : session;
  try {
    const { rows } = await db.query(
      `select id, message from n8n_chat_histories where session_id=$1 order by id`,
      [sessionId]
    );
    // message es jsonb: { type: 'human'|'ai', content } (algunas versiones anidan en data.content)
    const mensajes = rows.map((r: any) => {
      const m = typeof r.message === "string" ? JSON.parse(r.message) : r.message;
      return { rol: m?.type === "ai" ? "bot" : "user", texto: m?.content ?? m?.data?.content ?? "" };
    });
    return Response.json({ disponible: true, mensajes });
  } catch {
    return Response.json({ disponible: false, mensajes: [] });
  }
}
