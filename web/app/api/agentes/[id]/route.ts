import { db } from "@/lib/db";

// GET /api/agentes/:id -> agente completo
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await db.query("select * from agentes where id=$1", [id]);
  if (!rows[0]) return Response.json({ error: "no encontrado" }, { status: 404 });
  return Response.json(rows[0]);
}

// PATCH /api/agentes/:id -> actualiza campos parciales (Identidad y Comportamiento)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  const cols = [
    "nombre", "tenant", "ambiente", "rol", "idioma", "zona_horaria", "formato_hora",
    "persona", "tono", "velocidad_respuesta", "long_max_mensaje", "mensajes_historial",
    "usar_emojis", "usar_abreviaturas", "publicado",
    "orquestador_prompt", "comportamiento_global",
  ];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const c of cols) {
    if (c in b) { vals.push(b[c]); sets.push(`${c}=$${vals.length}`); }
  }
  if (!sets.length) return Response.json({ error: "nada para actualizar" }, { status: 400 });
  sets.push("actualizado_en=now()");
  vals.push(id);
  const { rows } = await db.query(
    `update agentes set ${sets.join(", ")} where id=$${vals.length} returning *`, vals
  );
  return Response.json(rows[0]);
}

// DELETE /api/agentes/:id -> borrado profundo del agente y todos sus datos.
// Recorre el esquema: primero las tablas hijas de etapas/bases/cursos, después todas
// las que tienen agente_id (con reintentos por orden de FKs), la memoria del chat y el agente.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await db.connect();
  try {
    await client.query("begin");

    // nietos: tablas que cuelgan de etapas / bases_conocimiento / cursos
    const childSpecs: [string, string][] = [
      ["etapa_id", "etapas"],
      ["base_id", "bases_conocimiento"],
      ["curso_id", "cursos"],
    ];
    for (const [col, parent] of childSpecs) {
      const { rows } = await client.query(
        `select table_name from information_schema.columns
         where table_schema='public' and column_name=$1 and table_name<>$2`,
        [col, parent]
      );
      for (const r of rows) {
        await client.query(
          `delete from ${r.table_name} where ${col} in (select id from ${parent} where agente_id=$1)`,
          [id]
        );
      }
    }

    // tablas con agente_id: varias pasadas con savepoints para respetar el orden de FKs
    const { rows: tablas } = await client.query(
      `select distinct table_name from information_schema.columns
       where table_schema='public' and column_name='agente_id' and table_name<>'agentes'`
    );
    let pendientes = tablas.map((r) => r.table_name as string);
    for (let pase = 0; pase < 6 && pendientes.length; pase++) {
      const quedan: string[] = [];
      for (const t of pendientes) {
        await client.query(`savepoint sp_del`);
        try {
          await client.query(`delete from ${t} where agente_id=$1`, [id]);
          await client.query(`release savepoint sp_del`);
        } catch {
          await client.query(`rollback to savepoint sp_del`);
          quedan.push(t);
        }
      }
      if (quedan.length === pendientes.length) break; // sin progreso
      pendientes = quedan;
    }
    if (pendientes.length) throw new Error("no pude vaciar: " + pendientes.join(", "));

    // memoria del AI Agent (session_id = agente_id:telefono)
    const { rows: chatT } = await client.query(
      `select table_name from information_schema.tables
       where table_schema='public' and table_name ilike '%chat_histor%'`
    );
    for (const r of chatT) {
      await client.query(`delete from ${r.table_name} where session_id like $1`, [id + ":%"]);
    }

    const del = await client.query("delete from agentes where id=$1", [id]);
    await client.query("commit");
    if (!del.rowCount) return Response.json({ error: "no encontrado" }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (e) {
    await client.query("rollback");
    return Response.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
