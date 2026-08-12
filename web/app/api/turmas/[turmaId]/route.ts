import { db } from "@/lib/db";

// DELETE /api/turmas/:turmaId
export async function DELETE(_req: Request, { params }: { params: Promise<{ turmaId: string }> }) {
  const { turmaId } = await params;
  await db.query("delete from turmas where id=$1", [turmaId]);
  return new Response(null, { status: 204 });
}
