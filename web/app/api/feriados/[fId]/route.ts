import { db } from "@/lib/db";

// DELETE /api/feriados/:fId
export async function DELETE(_req: Request, { params }: { params: Promise<{ fId: string }> }) {
  const { fId } = await params;
  await db.query("delete from feriados where id=$1", [fId]);
  return new Response(null, { status: 204 });
}
