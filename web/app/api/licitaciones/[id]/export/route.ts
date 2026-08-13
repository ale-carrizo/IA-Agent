import * as XLSX from "xlsx";

import { db } from "@/lib/db";

// GET /api/licitaciones/:id/export  -> planilla del presupuesto aprobado.
//
// Se exporta el SNAPSHOT guardado en `presupuestos`, no un recálculo: lo que se
// presenta al hospital tiene que ser exactamente lo que un humano aprobó,
// aunque después cambien precios o se reabra la licitación.
//
// Dos hojas:
//  · "Presupuesto" — lo que ve el hospital.
//  · "Trazabilidad" — de qué mensaje, proveedor, canal y hora salió cada precio.
//    Es la hoja que justifica el número si alguien lo cuestiona.

export const dynamic = "force-dynamic";

type Linea = {
  producto: string;
  descripcion_original: string;
  presentacion: string;
  cantidad: number;
  proveedor: string;
  precio_costo: string;
  precio_final: string;
  subtotal: string;
  confianza: number;
  raw_respuesta: string | null;
  canal: string | null;
  respondida_en: string | null;
  condiciones: Record<string, unknown>;
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const licitacionId = Number(id);

  const { rows } = await db.query(
    `select p.id, p.margen_pct, p.total, p.lineas, p.aprobado_por, p.creado,
            l.hospital, l.expediente, l.cierre_presentacion
       from presupuestos p
       join licitaciones l on l.id = p.licitacion_id
      where p.licitacion_id = $1
      order by p.creado desc
      limit 1`,
    [licitacionId]
  );

  const presupuesto = rows[0];
  if (!presupuesto) {
    return Response.json(
      { error: "esta licitación todavía no tiene un presupuesto aprobado" },
      { status: 404 }
    );
  }

  const lineas: Linea[] = presupuesto.lineas ?? [];

  const hojaPresupuesto = XLSX.utils.json_to_sheet(
    lineas.map((l, i) => ({
      "#": i + 1,
      "Ítem del pliego": l.descripcion_original,
      Producto: l.producto,
      Presentación: l.presentacion,
      Cantidad: l.cantidad,
      "Precio unitario": Number(l.precio_final),
      Subtotal: Number(l.subtotal),
    }))
  );
  XLSX.utils.sheet_add_aoa(
    hojaPresupuesto,
    [[], ["", "", "", "", "", "TOTAL", Number(presupuesto.total)]],
    { origin: -1 }
  );

  const hojaTraza = XLSX.utils.json_to_sheet(
    lineas.map((l) => ({
      Producto: l.producto,
      Proveedor: l.proveedor,
      "Costo unitario": Number(l.precio_costo),
      Margen: `${presupuesto.margen_pct}%`,
      "Precio final": Number(l.precio_final),
      Confianza: l.confianza,
      Canal: l.canal ?? "",
      "Respondido el": l.respondida_en ?? "",
      Condiciones: JSON.stringify(l.condiciones ?? {}),
      "Mensaje original del proveedor": l.raw_respuesta ?? "",
    }))
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hojaPresupuesto, "Presupuesto");
  XLSX.utils.book_append_sheet(wb, hojaTraza, "Trazabilidad");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nombre = `presupuesto-${presupuesto.hospital.replace(/[^\w-]+/g, "_")}-${licitacionId}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nombre}"`,
      "cache-control": "no-store",
    },
  });
}
