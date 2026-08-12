import { db } from "@/lib/db";

// DELETE /api/variables/:varId
export async function DELETE(_req: Request, { params }: { params: Promise<{ varId: string }> }) {
  const { varId } = await params;
  await db.query("delete from agente_variables where id=$1", [varId]);
  return new Response(null, { status: 204 });
}
