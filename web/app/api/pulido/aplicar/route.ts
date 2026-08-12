import { db } from "@/lib/db";
import { auth } from "@/auth";

// POST /api/pulido/aplicar  -> aplica la propuesta de Pulido IA a la config del agente.
// { agente_id, etapa_id?, campo, accion, texto_actual, texto_propuesto }
export async function POST(req: Request) {
  const session = await auth();
  const aplicado_por = session?.user?.email ?? null;

  const b = await req.json();
  const { agente_id, etapa_id, accion, caso_id } = b;
  const campo = String(b.campo || "");
  const texto_actual = String(b.texto_actual || "");
  const texto_propuesto = String(b.texto_propuesto || "");
  if (!texto_propuesto.trim()) return Response.json({ error: "sin texto propuesto" }, { status: 400 });

  const marcar = async (texto_antes: string | null) => {
    if (caso_id) await db.query(
      "update pulido_casos set estado='aplicado', aplicado_en=now(), texto_propuesto=$2, texto_antes=$3, aplicado_por=$4 where id=$1",
      [caso_id, texto_propuesto, texto_antes, aplicado_por]
    );
  };

  try {
    // Reglas / Objetivo de una etapa (whitelist de columnas)
    if (campo === "reglas" || campo === "objetivo") {
      if (!etapa_id) return Response.json({ error: "falta etapa_id" }, { status: 400 });
      const col = campo === "reglas" ? "reglas" : "objetivo";
      const { rows } = await db.query(`select ${col} as v from etapas where id=$1`, [etapa_id]);
      if (!rows[0]) return Response.json({ error: "etapa no encontrada" }, { status: 404 });
      const cur = rows[0].v || "";
      let nuevo: string;
      if (accion === "replace" && texto_actual && cur.includes(texto_actual)) {
        nuevo = cur.replace(texto_actual, texto_propuesto);
      } else {
        nuevo = (cur ? cur.trimEnd() + "\n\n" : "") + texto_propuesto;
      }
      await db.query(`update etapas set ${col}=$1 where id=$2`, [nuevo, etapa_id]);
      await marcar(cur);
      return Response.json({ ok: true, aplicado: `etapa.${col}`, chars: nuevo.length });
    }

    // Persona / Tono del agente
    if (campo === "persona" || campo === "tono") {
      const { rows: agRows } = await db.query(`select ${campo} as v from agentes where id=$1`, [agente_id]);
      const cur = agRows[0]?.v ?? null;
      await db.query(`update agentes set ${campo}=$1 where id=$2`, [texto_propuesto, agente_id]);
      await marcar(cur);
      return Response.json({ ok: true, aplicado: `agente.${campo}` });
    }

    // Rol / Orquestador del agente (textos largos: replace parcial o append, como etapas)
    if (campo === "rol" || campo === "orquestador_prompt") {
      const { rows: agRows } = await db.query(`select ${campo} as v from agentes where id=$1`, [agente_id]);
      if (!agRows[0]) return Response.json({ error: "agente no encontrado" }, { status: 404 });
      const cur = agRows[0].v || "";
      let nuevo: string;
      if (accion === "replace" && texto_actual && cur.includes(texto_actual)) {
        nuevo = cur.replace(texto_actual, texto_propuesto);
      } else {
        nuevo = (cur ? cur.trimEnd() + "\n\n" : "") + texto_propuesto;
      }
      await db.query(`update agentes set ${campo}=$1 where id=$2`, [nuevo, agente_id]);
      await marcar(cur);
      return Response.json({ ok: true, aplicado: `agente.${campo}`, chars: nuevo.length });
    }

    // Guardrail nuevo
    if (campo === "guardrail_nuevo") {
      await db.query(
        `insert into guardrails (agente_id, nombre, regla, activo) values ($1,$2,$3,true)`,
        [agente_id, "Pulido IA", texto_propuesto]
      );
      await marcar(null);
      return Response.json({ ok: true, aplicado: "guardrail_nuevo" });
    }

    return Response.json({ error: "campo no soportado: " + campo + " (aplicalo a mano en la etapa)" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
