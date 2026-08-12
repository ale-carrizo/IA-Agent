import { db } from "@/lib/db";
import { compilarPrompt } from "@/lib/compilar";

// GET /api/etapas/:id/prompt  -> devuelve el prompt compilado (pestaña "Prompt")
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { rows: er } = await db.query(
    `select e.*,
       coalesce(json_agg(distinct jsonb_build_object('clave',h.clave,'nombre',h.nombre,'descripcion',h.descripcion))
                filter (where h.id is not null), '[]') as herramientas,
       coalesce(json_agg(distinct jsonb_build_object('nombre',v.nombre))
                filter (where v.id is not null), '[]') as variables
     from etapas e
     left join etapa_herramientas eh on eh.etapa_id = e.id
     left join herramientas h on h.id = eh.herramienta_id
     left join etapa_variables ev on ev.etapa_id = e.id
     left join agente_variables v on v.id = ev.variable_id
     where e.id = $1
     group by e.id`,
    [id]
  );
  if (!er[0]) return Response.json({ error: "etapa no encontrada" }, { status: 404 });
  const etapa = er[0];

  const { rows: ar } = await db.query("select * from agentes where id = $1", [etapa.agente_id]);
  const agente = ar[0];

  const prompt = compilarPrompt(agente, etapa);
  return Response.json({ prompt });
}
