import { db } from "@/lib/db";

// GET /api/herramientas -> catálogo global de tools
export async function GET() {
  const { rows } = await db.query(
    "select id, clave, nombre, descripcion, tipo from herramientas order by nombre"
  );
  return Response.json(rows);
}
