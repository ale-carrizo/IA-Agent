import { db } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/agentes/:id/cursos/import
//   body: { cursos: Array<{ id?, nombre, tipo?, area?, modalidad?, nivel?, duracion?,
//                           precio?, condiciones?, descripcion?, pdf_url?, checkout_url?,
//                           costo_credito?, creditos_totales?, creditos_base?, creditos_especializacion?, moneda? }> }
// Carga cursos en masa desde el Excel. Las filas con 'id' (de la plantilla) se
// ACTUALIZAN; las filas sin 'id' se CREAN. Así re-subir la plantilla no duplica.
// Todos los campos son texto en la DB. Solo 'nombre' es obligatorio.
// Si la fila trae 'costo_credito', el curso queda marcado como cobro_por_credito
// (usado por universidades que cotizan por crédito académico, ej. MIU); el resto
// de universidades no llena esas columnas y sigue exactamente igual que antes.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const filas: Record<string, unknown>[] | null = Array.isArray(body?.cursos) ? body.cursos : null;
  if (!filas) return Response.json({ error: "falta el arreglo 'cursos'" }, { status: 400 });

  const s = (v: unknown) => {
    const t = v == null ? "" : String(v).trim();
    return t === "" ? null : t;
  };
  const n = (v: unknown) => {
    const t = s(v);
    if (t == null) return null;
    const num = Number(t);
    return Number.isFinite(num) ? num : null;
  };

  const cursos = filas
    .map((r) => {
      const costo_credito = n(r.costo_credito);
      return {
        // id de la plantilla solo si es un uuid válido; si no, se trata como fila nueva
        id: UUID_RE.test(String(r.id ?? "").trim()) ? String(r.id).trim() : null,
        nombre: s(r.nombre),
        tipo: s(r.tipo),
        area: s(r.area),
        modalidad: s(r.modalidad),
        nivel: s(r.nivel),
        duracion: s(r.duracion),
        precio: s(r.precio),
        condiciones: s(r.condiciones),
        descripcion: s(r.descripcion),
        pdf_url: s(r.pdf_url),
        checkout_url: s(r.checkout_url),
        cobro_por_credito: costo_credito != null,
        costo_credito,
        creditos_totales: n(r.creditos_totales),
        creditos_base: n(r.creditos_base),
        creditos_especializacion: n(r.creditos_especializacion),
        moneda: s(r.moneda) ?? (costo_credito != null ? "USD" : null),
      };
    })
    .filter((c) => c.nombre); // sin nombre no es un curso válido

  if (!cursos.length)
    return Response.json({ error: "el archivo no tiene filas válidas (falta la columna 'nombre')" }, { status: 400 });

  let creados = 0;
  let actualizados = 0;
  const client = await db.connect();
  try {
    await client.query("begin");
    for (const c of cursos) {
      const campos = [c.nombre, c.tipo, c.area, c.modalidad, c.nivel, c.duracion, c.precio, c.condiciones, c.descripcion, c.pdf_url, c.checkout_url,
        c.cobro_por_credito, c.costo_credito, c.creditos_totales, c.creditos_base, c.creditos_especializacion, c.moneda];
      if (c.id) {
        // update acotado al agente (evita editar cursos de otro agente por id ajeno)
        const upd = await client.query(
          `update cursos set nombre=$3, tipo=$4, area=$5, modalidad=$6, nivel=$7, duracion=$8,
                             precio=$9, condiciones=$10, descripcion=$11, pdf_url=$12, checkout_url=$13,
                             cobro_por_credito=$14, costo_credito=$15, creditos_totales=$16, creditos_base=$17,
                             creditos_especializacion=$18, moneda=$19
           where id=$1 and agente_id=$2`,
          [c.id, id, ...campos]
        );
        if (upd.rowCount) { actualizados++; continue; }
        // id no encontrado para este agente -> se inserta como nuevo
      }
      await client.query(
        `insert into cursos (agente_id, nombre, tipo, area, modalidad, nivel, duracion, precio, condiciones, descripcion, pdf_url, checkout_url,
                              cobro_por_credito, costo_credito, creditos_totales, creditos_base, creditos_especializacion, moneda)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [id, ...campos]
      );
      creados++;
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    return Response.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }

  return Response.json({ importados: creados + actualizados, creados, actualizados }, { status: 201 });
}
