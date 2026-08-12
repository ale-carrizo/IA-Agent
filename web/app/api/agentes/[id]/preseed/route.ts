import { db } from "@/lib/db";

// Variante INTERNA de /api/preseed para el playground (simular "llegó por plantilla").
// Protegida por la sesión del panel (middleware OAuth) — no pide el secreto M2M.
// A diferencia del endpoint público, NO normaliza el teléfono: el playground usa
// teléfonos "play-xxxxx" tal cual, que es lo que también manda a /api/preview.

// GET  -> lista el mapa código->programa del agente (para el selector del playground)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await db.query(
    `select codigo, programa_nombre from preseed_mapa
      where agente_id=$1 and activo order by programa_nombre`,
    [id]
  );
  return Response.json({ programas: rows });
}

// POST { telefono, codigo } -> siembra programa_interes en la conversación de preview
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let b: { telefono?: string; codigo?: string };
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "body inválido" }, { status: 400 });
  }
  const telefono = (b.telefono ?? "").toString().trim();
  const codigo = (b.codigo ?? "").toString().trim();
  if (!telefono) return Response.json({ error: "falta telefono" }, { status: 400 });
  if (!codigo) return Response.json({ error: "falta codigo" }, { status: 400 });

  const { rows } = await db.query(
    `select programa_nombre from preseed_mapa
      where agente_id=$1 and lower(codigo)=lower($2) and activo limit 1`,
    [id, codigo]
  );
  if (!rows.length) return Response.json({ error: "código no mapeado" }, { status: 404 });
  const programa = rows[0].programa_nombre as string;

  const { rows: et } = await db.query(
    `select id from etapas where agente_id=$1 and orden=1 and activo limit 1`,
    [id]
  );
  const etapaApertura: string | null = et[0]?.id ?? null;

  const patch = {
    programa_interes: programa,
    canal_origen: "plantilla_saliente",
    programa_codigo: codigo,
  };
  await db.query(
    `insert into conversaciones
        (agente_id, telefono, contacto_id, etapa_actual_id, variables_recolectadas, ultima_actividad)
     values ($1, $2, $2, $3, $4::jsonb, now())
     on conflict (agente_id, telefono) do update
        set variables_recolectadas = excluded.variables_recolectadas || conversaciones.variables_recolectadas,
            etapa_actual_id = coalesce(conversaciones.etapa_actual_id, excluded.etapa_actual_id)`,
    [id, telefono, etapaApertura, JSON.stringify(patch)]
  );
  return Response.json({ ok: true, programa });
}
