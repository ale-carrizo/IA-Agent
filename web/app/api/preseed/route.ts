import { db } from "@/lib/db";

// POST /api/preseed
// Pre-siembra una conversación ANTES de que el lead responda la plantilla saliente,
// para que el bot arranque sabiendo el programa y NO tenga que preguntarlo.
//
// Modelo: UNA plantilla genérica de bienvenida + esta llamada disparada por el CRM /
// Neotel en el mismo flujo (el CRM ya tiene el código de mapeo del programa). Esto
// escala sin crear una plantilla por programa: agregar un programa = una fila en
// preseed_mapa. La llave para unir esto con la conversación real que creará el motor
// al llegar el primer mensaje es el TELÉFONO (normalizado a dígitos).
//
// Auth: secret == process.env.PRESEED_SECRET (machine-to-machine). Se acepta en el
// header `x-preseed-secret` (preferido) o en el campo `secret` del body, para CRMs que
// no mandan headers custom de forma confiable (ej. Neotel). Excluido del gate de Google
// OAuth en middleware.ts.
//
// Body: { agente_id, telefono, codigo?, programa?, nombre? }
//   - codigo:   código del programa mapeado en la tabla preseed_mapa (ej. "SST").
//   - programa: nombre completo del programa (bypass del mapa, gana sobre codigo).
//   - nombre:   opcional, nombre del lead si el CRM lo tiene.
//
// Resuelve el nombre del programa (mapa o directo), hace UPSERT en conversaciones
// por (agente_id, telefono) y setea variables_recolectadas.programa_interes.
// Si la conversación ya existía (raro: el lead ya venía hablando), NO pisa lo ya
// recolectado — solo rellena las claves que falten.

type Body = {
  agente_id?: string;
  telefono?: string;
  codigo?: string;
  programa?: string;
  nombre?: string;
  cc?: string;       // código país opcional (ej. "57"); ver normalizarTelefono
  secret?: string;   // auth por body (alternativa al header x-preseed-secret)
};

// El motor matchea la conversación por el teléfono, que toma de `contactId` de
// Botmaker = formato internacional SIN "+" (ej. Colombia "573001234567"). Acá tenemos
// que producir EXACTAMENTE ese string a partir de lo que mande el CRM.
//   - Si viene `cc` (recomendado): se antepone si el número no lo tiene ya.
//   - Sin `cc`: heurística Colombia — un celular local de 10 dígitos que empieza en 3
//     se completa con 57. Cualquier número que ya trae prefijo país queda igual.
function normalizarTelefono(raw: unknown, cc?: string): string {
  let d = (raw ?? "").toString().replace(/\D+/g, "");
  if (d.startsWith("00")) d = d.slice(2); // prefijo de marcado internacional
  const ccd = (cc ?? "").toString().replace(/\D+/g, "");
  if (ccd) {
    if (!d.startsWith(ccd)) d = ccd + d;
    return d;
  }
  if (d.length === 10 && d.startsWith("3")) d = "57" + d; // celular CO sin prefijo
  return d;
}

export async function POST(req: Request) {
  // ── Auth machine-to-machine ──
  const secret = process.env.PRESEED_SECRET;
  if (!secret) {
    return Response.json(
      { error: "PRESEED_SECRET no configurado en el servidor" },
      { status: 503 }
    );
  }
  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "body inválido (JSON)" }, { status: 400 });
  }

  // Secret por header (preferido) o por body. Se hace trim para tolerar saltos de línea
  // que algunos CRMs agregan al renderizar el valor desde una variable.
  const enviado = (req.headers.get("x-preseed-secret") ?? b.secret ?? "").trim();
  if (enviado !== secret) {
    return Response.json({ error: "no autorizado" }, { status: 401 });
  }

  const agente_id = (b.agente_id ?? "").trim();
  const telefono = normalizarTelefono(b.telefono, b.cc);
  const codigo = (b.codigo ?? "").trim();
  const programaDirecto = (b.programa ?? "").trim();
  const nombre = (b.nombre ?? "").trim();

  if (!agente_id) return Response.json({ error: "falta agente_id" }, { status: 400 });
  if (!telefono || telefono.length < 8)
    return Response.json({ error: "telefono inválido (esperado dígitos con prefijo país)" }, { status: 400 });
  if (!codigo && !programaDirecto)
    return Response.json({ error: "falta codigo o programa" }, { status: 400 });

  // ── Resolver el nombre del programa ──
  let programa = programaDirecto;
  if (!programa) {
    const { rows } = await db.query(
      `select programa_nombre from preseed_mapa
        where agente_id=$1 and lower(codigo)=lower($2) and activo
        limit 1`,
      [agente_id, codigo]
    );
    if (!rows.length) {
      // Neotel manda los códigos de TODAS las carreras de UNAB; este agente solo atiende
      // los 3 posgrados del preseed_mapa. Los demás se IGNORAN limpio (200, sin crear
      // conversación) — así Neotel no acumula errores 404 por leads de otras carreras.
      return Response.json({
        ok: true,
        ignored: true,
        motivo: `código '${codigo}' fuera de los programas atendidos por este agente`,
      });
    }
    programa = rows[0].programa_nombre as string;
  }

  // ── Etapa Apertura del agente (para arrancar ahí en filas nuevas) ──
  const { rows: etRows } = await db.query(
    `select id from etapas where agente_id=$1 and orden=1 and activo limit 1`,
    [agente_id]
  );
  const etapaApertura: string | null = etRows[0]?.id ?? null;

  // ── Patch de la ficha ──
  const patch: Record<string, string> = {
    programa_interes: programa,
    canal_origen: "plantilla_saliente",
  };
  if (codigo) patch.programa_codigo = codigo;
  if (nombre) patch.nombre = nombre;

  // UPSERT: en conflicto, lo YA recolectado gana (no pisa una conversación en curso);
  // el patch solo rellena claves faltantes.
  const { rows: upRows } = await db.query(
    `insert into conversaciones
        (agente_id, telefono, contacto_id, etapa_actual_id, variables_recolectadas, ultima_actividad)
     values ($1, $2, $2, $3, $4::jsonb, now())
     on conflict (agente_id, telefono) do update
        set variables_recolectadas =
              excluded.variables_recolectadas || conversaciones.variables_recolectadas
     returning (xmax = 0) as inserted, variables_recolectadas`,
    [agente_id, telefono, etapaApertura, JSON.stringify(patch)]
  );

  const inserted = upRows[0]?.inserted === true;
  return Response.json({
    ok: true,
    inserted,               // true = fila nueva, false = ya existía y se mergeó
    agente_id,
    telefono,
    programa,
    ficha: upRows[0]?.variables_recolectadas ?? {},
  });
}
