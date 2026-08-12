"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Plus, Trash2, FileText, Database, Upload } from "lucide-react";
import { Field, useToast, api } from "@/lib/ui";

type Estado = "procesando" | "listo" | "error";

type Documento = {
  id: number;
  programa: string | null;
  curso_id: string | null;
  curso_nombre: string | null;
  nombre: string;
  pdf_url: string | null;
  doc_id: string | null;
  version: string | null;
  estado: Estado;
  creado_en: string;
};

type CursoLite = { id: string; nombre: string };

type Base = {
  id: number;
  nombre: string;
  coleccion_vector: string | null;
  documentos: Documento[];
};

const inputCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

function EstadoBadge({ estado }: { estado: Estado }) {
  if (estado === "listo") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-success/15 text-success">
        listo
      </span>
    );
  }
  if (estado === "procesando") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning">
        procesando
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-destructive/10 text-destructive">
      error
    </span>
  );
}

function DocForm({ baseId, cursos, onDone }: { baseId: number; cursos: CursoLite[]; onDone: () => void }) {
  const { show, node } = useToast();
  const [cursoId, setCursoId] = useState("");
  const [nombre, setNombre] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [texto, setTexto] = useState("");
  const [saving, setSaving] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [subiendoTexto, setSubiendoTexto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function subirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (cursoId) fd.append("curso_id", cursoId);
      const r = await fetch(`/api/kb/${baseId}/upload`, { method: "POST", body: fd });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      show("PDF subido — se está embebiendo (1-2 min)");
      if (fileRef.current) fileRef.current.value = "";
      onDone();
    } catch (err) {
      show((err as Error).message, true);
    } finally {
      setSubiendo(false);
    }
  }

  async function subirTexto() {
    if (!nombre.trim()) {
      show("Poné un nombre para el documento", true);
      return;
    }
    if (!texto.trim()) {
      show("Pegá el contenido en el cuadro de texto", true);
      return;
    }
    setSubiendoTexto(true);
    try {
      const fd = new FormData();
      fd.append("texto", texto);
      fd.append("nombre", nombre.trim());
      if (cursoId) fd.append("curso_id", cursoId);
      const r = await fetch(`/api/kb/${baseId}/upload`, { method: "POST", body: fd });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      show("Texto convertido a PDF y subido — se está embebiendo (1-2 min)");
      setTexto("");
      setNombre("");
      onDone();
    } catch (err) {
      show((err as Error).message, true);
    } finally {
      setSubiendoTexto(false);
    }
  }

  async function agregar() {
    if (!nombre.trim()) {
      show("Poné un nombre para el documento", true);
      return;
    }
    setSaving(true);
    try {
      await api(`/api/kb/${baseId}/documentos`, "POST", {
        curso_id: cursoId || undefined,
        nombre: nombre.trim(),
        pdf_url: pdfUrl.trim() || undefined,
      });
      setCursoId("");
      setNombre("");
      setPdfUrl("");
      show("Documento agregado");
      onDone();
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="pt-4 mt-4 border-t border-border space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Agregar documento</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Curso" hint="Vinculá el documento a un curso. Vacío = KB general (para cualquier curso).">
            <select
              className={inputCls}
              value={cursoId}
              onChange={(e) => setCursoId(e.target.value)}
            >
              <option value="">— General (sin curso) —</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nombre">
            <input
              className={inputCls}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="ej: Brochure del programa"
            />
          </Field>
        </div>
        {/* Subir PDF directo (se sube al storage público y se embebe solo) */}
        <Field label="Subir PDF" hint="Se sube al almacenamiento público y se embebe automáticamente (1-2 min)">
          <input ref={fileRef} type="file" accept="application/pdf" onChange={subirArchivo} className="hidden" id={`file-${baseId}`} />
          <label
            htmlFor={`file-${baseId}`}
            className={"inline-flex items-center gap-2 px-4 py-2 rounded-md border border-input bg-background text-sm font-medium cursor-pointer hover:bg-muted/40 transition-colors" + (subiendo ? " opacity-60 pointer-events-none" : "")}
          >
            <Upload className="w-4 h-4" />
            {subiendo ? "Subiendo…" : "Elegir PDF"}
          </label>
        </Field>

        <Field
          label="…o pegá el contenido como texto"
          hint="Para material que no es PDF (una imagen, un mail, un Word): transcribí/pegá el texto acá. Se convierte a PDF en el servidor y se embebe igual que un PDF subido. Usa el Nombre y el Curso de arriba."
        >
          <textarea
            className={inputCls + " h-40 py-2 resize-y font-mono text-xs"}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={"ej:\nMIU - Bachelor en Administración | Marketing\nPLAN DE ESTUDIOS\n- MKT 410 Principios de Ventas (3 cr.)\n..."}
          />
        </Field>
        <button
          onClick={subirTexto}
          disabled={subiendoTexto}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted/40 transition-colors disabled:opacity-60"
        >
          <FileText className="w-4 h-4" />
          {subiendoTexto ? "Subiendo…" : "Agregar desde texto"}
        </button>

        <Field
          label="…o pegá una URL de PDF"
          hint="Alternativa si el PDF ya está en una URL pública"
        >
          <input
            className={inputCls}
            value={pdfUrl}
            onChange={(e) => setPdfUrl(e.target.value)}
            placeholder="https://..."
          />
        </Field>
        <button
          onClick={agregar}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          <Plus className="w-4 h-4" />
          {saving ? "Agregando…" : "Agregar documento"}
        </button>
      </div>
      {node}
    </>
  );
}

export default function KnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();

  const [bases, setBases] = useState<Base[]>([]);
  const [cursos, setCursos] = useState<CursoLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [basesData, cursosData] = await Promise.all([
        api(`/api/agentes/${id}/kb`, "GET"),
        api(`/api/agentes/${id}/cursos`, "GET"),
      ]);
      setBases(basesData);
      setCursos(
        (Array.isArray(cursosData) ? cursosData : []).map((c: CursoLite) => ({ id: c.id, nombre: c.nombre }))
      );
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }, [id, show]);

  useEffect(() => {
    load();
  }, [load]);

  async function crearBase() {
    if (!nombre.trim()) {
      show("Poné un nombre para la base", true);
      return;
    }
    setSaving(true);
    try {
      await api(`/api/agentes/${id}/kb`, "POST", { nombre: nombre.trim() });
      setNombre("");
      show("Base creada");
      await load();
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }

  async function borrarDoc(docId: number) {
    if (!confirm("¿Borrar este documento y sus vectores?")) return;
    try {
      await api(`/api/kb/documentos/${docId}`, "DELETE");
      show("Documento eliminado");
      await load();
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  async function asignarCurso(docId: number, cursoId: string) {
    try {
      await api(`/api/kb/documentos/${docId}`, "PATCH", { curso_id: cursoId || null });
      show(cursoId ? "Curso asignado" : "Marcado como General");
      await load();
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Bases de Conocimiento</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Embebé PDFs en una base vectorial. Después, en cada etapa, habilitá la herramienta de
            KB para que el agente la consulte.
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl px-5 py-3.5 text-sm text-foreground">
        Subí un PDF y se sube al almacenamiento público + se embebe automáticamente (PDF →
        embeddings → pgvector). Queda en &apos;procesando&apos; ~1-2 min y pasa a &apos;listo&apos;.
        El agente lo consulta (faq_kb) y puede adjuntarlo al lead (envío de PDF).
      </div>

      {/* Crear base */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Database className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-semibold text-base">Crear base</h2>
        </div>
        <Field label="Nombre">
          <input
            className={inputCls}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="ej: Programas de Posgrado"
          />
        </Field>
        <button
          onClick={crearBase}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          <Plus className="w-4 h-4" />
          {saving ? "Creando…" : "Crear base"}
        </button>
      </div>

      {/* Lista de bases */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
          Cargando bases…
        </div>
      ) : bases.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-10 shadow-card flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-muted-foreground opacity-50" />
          </div>
          <p className="text-sm text-muted-foreground">
            Todavía no hay bases de conocimiento. Creá la primera arriba.
          </p>
        </div>
      ) : (
        bases.map((base) => (
          <div key={base.id} className="bg-card rounded-xl border border-border p-6 shadow-card space-y-4">
            {/* Base header */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Database className="w-4 h-4 text-primary" />
                </div>
                <h2 className="font-semibold text-base text-foreground">{base.nombre}</h2>
              </div>
              {base.coleccion_vector && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-primary/10 text-primary">
                  {base.coleccion_vector}
                </span>
              )}
            </div>

            {/* Documentos */}
            {base.documentos.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                <FileText className="w-4 h-4 mr-2 opacity-40" />
                Sin documentos en esta base.
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Curso</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Nombre</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Versión</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Estado</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Fecha</th>
                      <th className="px-4 py-2.5 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {base.documentos.map((doc) => (
                      <tr
                        key={doc.id}
                        className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3 text-sm text-foreground">
                          <select
                            className={inputCls + " h-8 py-0 text-xs max-w-[200px]"}
                            value={doc.curso_id ?? ""}
                            onChange={(e) => asignarCurso(doc.id, e.target.value)}
                            title="Asignar este documento a un curso (o dejarlo General)"
                          >
                            <option value="">— General —</option>
                            {cursos.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{doc.nombre}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {doc.version || <span>—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <EstadoBadge estado={doc.estado} />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(doc.creado_en).toLocaleDateString("es-AR")}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => borrarDoc(doc.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-destructive/30 bg-destructive/5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            Borrar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <DocForm baseId={base.id} cursos={cursos} onDone={load} />
          </div>
        ))
      )}

      {node}
    </>
  );
}
