import { db } from "@/lib/db";
import { textoAPdf } from "@/lib/pdf-texto";

// POST /api/kb/:baseId/upload  (multipart: file | texto+nombre, programa?, curso_id?)
// Dos modos:
//  - file: PDF ya existente (brochure, folleto)
//  - texto + nombre: contenido pegado (ej. transcripto de una imagen) -> se genera un
//    PDF de texto en el server y sigue el mismo camino.
// Sube el PDF al servicio de storage (token server-side), registra el doc en la KB
// en estado 'procesando' -> la ingesta de n8n lo embebe automáticamente.
export async function POST(req: Request, { params }: { params: Promise<{ baseId: string }> }) {
  const { baseId } = await params;
  const STORAGE = process.env.STORAGE_URL;
  const TOKEN = process.env.STORAGE_TOKEN || "";
  if (!STORAGE) return Response.json({ error: "falta STORAGE_URL" }, { status: 500 });

  try {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const texto = ((form.get("texto") as string) || "").trim();
  const nombreCampo = ((form.get("nombre") as string) || "").trim();
  const programa = (form.get("programa") as string) || null;
  const cursoId = (form.get("curso_id") as string) || null;

  let blob: Blob;
  let fileName: string;
  if (file) {
    blob = file;
    fileName = file.name;
  } else if (texto) {
    if (!nombreCampo) return Response.json({ error: "falta 'nombre' para el documento de texto" }, { status: 400 });
    const pdf = textoAPdf(texto);
    blob = new Blob([new Uint8Array(pdf)], { type: "application/pdf" });
    fileName = nombreCampo.replace(/[\\/:*?"<>|]+/g, "").trim() + ".pdf";
  } else {
    return Response.json({ error: "falta archivo (campo 'file') o contenido (campo 'texto')" }, { status: 400 });
  }

  // reenviar al storage público
  const fd = new FormData();
  fd.append("file", blob, fileName);
  const up = await fetch(`${STORAGE}/upload`, { method: "POST", headers: { "x-token": TOKEN }, body: fd });
  if (!up.ok) {
    return Response.json({ error: "storage respondió " + up.status, detalle: await up.text() }, { status: 502 });
  }
  const { url } = await up.json();

  // registrar el documento (versionado por nombre)
  const nombre = fileName.replace(/\.pdf$/i, "");
  const { rows: prev } = await db.query(
    "select coalesce(max(version),0)+1 as v from documentos_kb where base_id=$1 and nombre=$2", [baseId, nombre]
  );
  const version = prev[0].v;
  const docId = `${nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-v${version}`;
  const { rows } = await db.query(
    `insert into documentos_kb (base_id, programa, curso_id, nombre, pdf_url, doc_id, version, estado)
     values ($1,$2,$3,$4,$5,$6,$7,'procesando') returning *`,
    [baseId, programa, cursoId, nombre, url, docId, version]
  );
  return Response.json(rows[0], { status: 201 });
  } catch (e: unknown) {
    // Antes cualquier excepción caía como un 500 opaco (ej. body truncado por el límite
    // del middleware -> "Failed to parse body as FormData"). Devolvemos el error real.
    const err = e as { message?: string; code?: string };
    console.error("[kb/upload] fallo:", err);
    return Response.json(
      { error: "no se pudo subir el documento", detalle: err?.message, code: err?.code },
      { status: 500 }
    );
  }
}
