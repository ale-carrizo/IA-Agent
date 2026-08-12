"use client";

import { use, useEffect, useState, useCallback, useRef } from "react";
import { GraduationCap, Plus, Trash2, Calendar, Pencil, X, Check, Upload, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useToast, api, Toggle, Field } from "@/lib/ui";

// Columnas aceptadas en el Excel (con sus alias). Solo "nombre" es obligatorio.
const COLUMNAS_IMPORT = [
  "nombre", "tipo", "area", "modalidad", "nivel", "duracion",
  "precio", "condiciones", "descripcion", "pdf_url", "checkout_url",
  "costo_credito", "creditos_totales", "creditos_base", "creditos_especializacion", "moneda",
] as const;

const stripAccents = (x: string) => x.normalize("NFD").replace(/\p{Diacritic}/gu, "");
const canonKey = (k: string) => stripAccents(String(k)).toLowerCase().trim().replace(/\s+/g, "_");
const ALIAS_COLUMNA: Record<string, string> = {
  nombre: "nombre", name: "nombre", curso: "nombre", programa: "nombre",
  tipo: "tipo", type: "tipo",
  area: "area",
  modalidad: "modalidad",
  nivel: "nivel",
  duracion: "duracion",
  precio: "precio", price: "precio",
  condiciones: "condiciones", condiciones_de_pago: "condiciones",
  descripcion: "descripcion", description: "descripcion",
  pdf_url: "pdf_url", pdf: "pdf_url", url_pdf: "pdf_url", url_del_pdf: "pdf_url", brochure: "pdf_url",
  checkout_url: "checkout_url", checkout: "checkout_url", url_checkout: "checkout_url", url_de_checkout: "checkout_url",
  // cobro por crédito (universidades que cotizan por crédito académico, ej. MIU)
  costo_credito: "costo_credito", costo_x_credito: "costo_credito", costo_por_credito: "costo_credito", precio_por_credito: "costo_credito",
  creditos_totales: "creditos_totales", total_creditos: "creditos_totales", creditos: "creditos_totales",
  creditos_base: "creditos_base",
  creditos_especializacion: "creditos_especializacion", creditos_de_especializacion: "creditos_especializacion",
  moneda: "moneda", currency: "moneda",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Turma = {
  id: string;
  fecha_inicio: string;
  cupos: number | null;
  activo: boolean;
};

type Curso = {
  id: string;
  nombre: string;
  tipo: string | null;
  area: string | null;
  modalidad: string | null;
  nivel: string | null;
  duracion: string | null;
  precio: number | null;
  condiciones: string | null;
  descripcion: string | null;
  pdf_url: string | null;
  checkout_url: string | null;
  activo: boolean;
  // Cobro por crédito (ej. MIU): en vez de un precio cerrado, el programa se
  // cotiza por crédito académico. Si cobro_por_credito es false, estos campos
  // van null y el curso se comporta exactamente como hoy (precio de texto libre).
  cobro_por_credito: boolean;
  costo_credito: number | null;
  creditos_totales: number | null;
  creditos_base: number | null;
  creditos_especializacion: number | null;
  moneda: string | null;
  turmas: Turma[];
};

type CursoForm = {
  nombre: string;
  tipo: string;
  area: string;
  modalidad: string;
  nivel: string;
  duracion: string;
  precio: string;
  condiciones: string;
  descripcion: string;
  pdf_url: string;
  checkout_url: string;
  cobro_por_credito: boolean;
  costo_credito: string;
  creditos_totales: string;
  creditos_base: string;
  creditos_especializacion: string;
  moneda: string;
};

const EMPTY_FORM: CursoForm = {
  nombre: "",
  tipo: "master",
  area: "",
  modalidad: "online",
  nivel: "",
  duracion: "",
  precio: "",
  condiciones: "",
  descripcion: "",
  pdf_url: "",
  checkout_url: "",
  cobro_por_credito: false,
  costo_credito: "",
  creditos_totales: "",
  creditos_base: "",
  creditos_especializacion: "",
  moneda: "USD",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtFecha(d: string) {
  // El backend serializa las fechas (columna date) como ISO datetime; nos quedamos
  // con la parte YYYY-MM-DD para evitar Invalid Date y corrimientos de zona horaria.
  return new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtPrecio(n: number | null) {
  if (n == null) return null;
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

function fmtMoneda(n: number, moneda: string | null) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: moneda || "USD", maximumFractionDigits: 0 }).format(n);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CursosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();

  const [loading, setLoading] = useState(true);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CursoForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/api/agentes/${id}/cursos`, "GET");
      setCursos(Array.isArray(data) ? (data as Curso[]) : []);
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al cargar", true);
    } finally {
      setLoading(false);
    }
  }, [id, show]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Form helpers ─────────────────────────────────────────────────────────

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setTimeout(() => document.getElementById("campo-nombre")?.focus(), 50);
  }

  function openEdit(c: Curso) {
    setEditingId(c.id);
    setForm({
      nombre: c.nombre,
      tipo: c.tipo ?? "master",
      area: c.area ?? "",
      modalidad: c.modalidad ?? "online",
      nivel: c.nivel ?? "",
      duracion: c.duracion ?? "",
      precio: c.precio != null ? String(c.precio) : "",
      condiciones: c.condiciones ?? "",
      descripcion: c.descripcion ?? "",
      pdf_url: c.pdf_url ?? "",
      checkout_url: c.checkout_url ?? "",
      cobro_por_credito: c.cobro_por_credito,
      costo_credito: c.costo_credito != null ? String(c.costo_credito) : "",
      creditos_totales: c.creditos_totales != null ? String(c.creditos_totales) : "",
      creditos_base: c.creditos_base != null ? String(c.creditos_base) : "",
      creditos_especializacion: c.creditos_especializacion != null ? String(c.creditos_especializacion) : "",
      moneda: c.moneda ?? "USD",
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function setField<K extends keyof CursoForm>(k: K, v: CursoForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // ── Submit curso ──────────────────────────────────────────────────────────

  async function submitCurso(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) {
      show("El nombre es obligatorio", true);
      return;
    }
    setSaving(true);
    try {
      const body = {
        nombre: form.nombre.trim(),
        tipo: form.tipo || null,
        area: form.area.trim() || null,
        modalidad: form.modalidad || null,
        nivel: form.nivel.trim() || null,
        duracion: form.duracion.trim() || null,
        precio: form.precio.trim() ? Number(form.precio) : null,
        condiciones: form.condiciones.trim() || null,
        descripcion: form.descripcion.trim() || null,
        pdf_url: form.pdf_url.trim() || null,
        checkout_url: form.checkout_url.trim() || null,
        cobro_por_credito: form.cobro_por_credito,
        costo_credito: form.cobro_por_credito && form.costo_credito.trim() ? Number(form.costo_credito) : null,
        creditos_totales: form.cobro_por_credito && form.creditos_totales.trim() ? Number(form.creditos_totales) : null,
        creditos_base: form.cobro_por_credito && form.creditos_base.trim() ? Number(form.creditos_base) : null,
        creditos_especializacion: form.cobro_por_credito && form.creditos_especializacion.trim() ? Number(form.creditos_especializacion) : null,
        moneda: form.cobro_por_credito ? (form.moneda.trim() || "USD") : null,
      };

      if (editingId) {
        await api(`/api/cursos/${editingId}`, "PATCH", body);
        show("Curso actualizado");
      } else {
        await api(`/api/agentes/${id}/cursos`, "POST", body);
        show("Curso creado");
      }
      cancelForm();
      load();
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al guardar", true);
    } finally {
      setSaving(false);
    }
  }

  // ── Plantilla Excel (pre-cargada con los cursos actuales) ──────────────────

  function downloadTemplate() {
    // La columna 'id' viene llena para los cursos existentes (para que se
    // ACTUALICEN al re-subir) y vacía para las filas nuevas (que se CREAN).
    const filas = cursos.map((c) => ({
      id: c.id,
      nombre: c.nombre ?? "",
      tipo: c.tipo ?? "",
      area: c.area ?? "",
      modalidad: c.modalidad ?? "",
      nivel: c.nivel ?? "",
      duracion: c.duracion ?? "",
      precio: c.precio ?? "",
      condiciones: c.condiciones ?? "",
      descripcion: c.descripcion ?? "",
      pdf_url: c.pdf_url ?? "",
      checkout_url: c.checkout_url ?? "",
      costo_credito: c.costo_credito ?? "",
      creditos_totales: c.creditos_totales ?? "",
      creditos_base: c.creditos_base ?? "",
      creditos_especializacion: c.creditos_especializacion ?? "",
      moneda: c.moneda ?? "",
    }));
    const header = ["id", ...COLUMNAS_IMPORT];
    const ws = filas.length
      ? XLSX.utils.json_to_sheet(filas, { header })
      : XLSX.utils.aoa_to_sheet([header]); // sin cursos: solo encabezados
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "cursos");
    XLSX.writeFile(wb, "plantilla-cursos.xlsx");
  }

  // ── Importar Excel ─────────────────────────────────────────────────────────

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("El archivo no tiene ninguna hoja.");
      const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      // Mapea cada fila a los campos del curso usando los encabezados (con alias/acentos).
      const cursos = filas
        .map((fila) => {
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(fila)) {
            const ck = canonKey(k);
            const campo = ck === "id" ? "id" : ALIAS_COLUMNA[ck];
            if (!campo) continue;
            const val = v == null ? "" : String(v).trim();
            // si dos columnas mapean al mismo campo, no dejar que una vacía pise una con dato
            if (val !== "" || !(campo in out)) out[campo] = val;
          }
          return out;
        })
        .filter((c) => c.nombre);
      if (!cursos.length) {
        show("No encontré filas con la columna 'nombre'. Revisá los encabezados.", true);
        return;
      }
      const res = (await api(`/api/agentes/${id}/cursos/import`, "POST", { cursos })) as {
        importados: number;
        creados: number;
        actualizados: number;
      };
      const partes: string[] = [];
      if (res.creados) partes.push(`${res.creados} nuevo${res.creados === 1 ? "" : "s"}`);
      if (res.actualizados) partes.push(`${res.actualizados} actualizado${res.actualizados === 1 ? "" : "s"}`);
      show(partes.length ? `Importado: ${partes.join(", ")}` : "No se importó nada");
      await load();
    } catch (err) {
      show(err instanceof Error ? err.message : "Error al importar el Excel", true);
    } finally {
      setImporting(false);
    }
  }

  // ── Toggle activo curso ───────────────────────────────────────────────────

  async function toggleActivo(c: Curso, v: boolean) {
    try {
      await api(`/api/cursos/${c.id}`, "PATCH", { activo: v });
      setCursos((prev) => prev.map((x) => (x.id === c.id ? { ...x, activo: v } : x)));
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al actualizar", true);
    }
  }

  // ── Eliminar curso ────────────────────────────────────────────────────────

  async function deleteCurso(c: Curso) {
    if (!confirm(`¿Eliminar el curso "${c.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api(`/api/cursos/${c.id}`, "DELETE");
      show("Curso eliminado");
      setCursos((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al eliminar", true);
    }
  }

  // ── Turma ops ────────────────────────────────────────────────────────────

  async function addTurma(cursoId: string, fecha: string, cupos: string) {
    try {
      const data = await api(`/api/cursos/${cursoId}/turmas`, "POST", {
        fecha_inicio: fecha,
        cupos: cupos ? Number(cupos) : null,
      });
      setCursos((prev) =>
        prev.map((c) =>
          c.id === cursoId ? { ...c, turmas: [...c.turmas, data as Turma] } : c
        )
      );
      show("Turma agregada");
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al agregar turma", true);
    }
  }

  async function deleteTurma(cursoId: string, turmaId: string) {
    if (!confirm("¿Eliminar esta turma?")) return;
    try {
      await api(`/api/turmas/${turmaId}`, "DELETE");
      setCursos((prev) =>
        prev.map((c) =>
          c.id === cursoId ? { ...c, turmas: c.turmas.filter((t) => t.id !== turmaId) } : c
        )
      );
      show("Turma eliminada");
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al eliminar turma", true);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <GraduationCap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Cursos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Catálogo de programas. Sus datos alimentan las herramientas del agente (precios, fechas, materiales).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={downloadTemplate}
            title="Descarga un Excel con los cursos actuales para editarlos o agregar más. No borres la columna 'id'."
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Download className="w-4 h-4" />
            Plantilla
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            title={`Columnas del Excel: ${COLUMNAS_IMPORT.join(", ")} (solo "nombre" es obligatorio). La columna "id" se maneja sola.`}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60"
          >
            <Upload className="w-4 h-4" />
            {importing ? "Importando…" : "Importar Excel"}
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo curso
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-base">
              {editingId ? "Editar curso" : "Nuevo curso"}
            </h2>
            <button
              onClick={cancelForm}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={submitCurso} className="space-y-4">
            {/* Nombre */}
            <Field label="Nombre *">
              <input
                id="campo-nombre"
                type="text"
                value={form.nombre}
                onChange={(e) => setField("nombre", e.target.value)}
                placeholder="Ej: Master en Marketing Digital"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Tipo */}
              <Field label="Tipo">
                <select
                  value={form.tipo}
                  onChange={(e) => setField("tipo", e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
                >
                  <option value="master">Master</option>
                  <option value="diplomado">Diplomado</option>
                </select>
              </Field>

              {/* Modalidad */}
              <Field label="Modalidad">
                <select
                  value={form.modalidad}
                  onChange={(e) => setField("modalidad", e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
                >
                  <option value="online">Online</option>
                  <option value="presencial">Presencial</option>
                  <option value="hibrido">Híbrido</option>
                </select>
              </Field>

              {/* Área */}
              <Field label="Área">
                <input
                  type="text"
                  value={form.area}
                  onChange={(e) => setField("area", e.target.value)}
                  placeholder="Ej: Marketing, Finanzas"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
                />
              </Field>

              {/* Nivel */}
              <Field label="Nivel">
                <input
                  type="text"
                  value={form.nivel}
                  onChange={(e) => setField("nivel", e.target.value)}
                  placeholder="Ej: Básico, Avanzado"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
                />
              </Field>

              {/* Duración */}
              <Field label="Duración">
                <input
                  type="text"
                  value={form.duracion}
                  onChange={(e) => setField("duracion", e.target.value)}
                  placeholder="Ej: 6 meses"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
                />
              </Field>

              {/* Precio (oculto si el curso cobra por crédito) */}
              {!form.cobro_por_credito && (
                <Field label="Precio">
                  <input
                    type="number"
                    value={form.precio}
                    onChange={(e) => setField("precio", e.target.value)}
                    placeholder="Ej: 150000"
                    min="0"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
                  />
                </Field>
              )}
            </div>

            {/* Cobro por crédito (ej. MIU): en vez de un precio cerrado, el programa
                se cotiza por crédito académico (costo x crédito x créditos totales). */}
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Cobro por crédito</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Para universidades que cotizan por crédito académico en vez de un precio fijo (ej. MIU).
                  </p>
                </div>
                <Toggle
                  on={form.cobro_por_credito}
                  onChange={(v) => setField("cobro_por_credito", v)}
                  label=""
                />
              </div>

              {form.cobro_por_credito && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Costo por crédito">
                    <input
                      type="number"
                      value={form.costo_credito}
                      onChange={(e) => setField("costo_credito", e.target.value)}
                      placeholder="Ej: 85"
                      min="0"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
                    />
                  </Field>
                  <Field label="Moneda">
                    <input
                      type="text"
                      value={form.moneda}
                      onChange={(e) => setField("moneda", e.target.value)}
                      placeholder="Ej: USD"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
                    />
                  </Field>
                  <Field label="Créditos totales">
                    <input
                      type="number"
                      value={form.creditos_totales}
                      onChange={(e) => setField("creditos_totales", e.target.value)}
                      placeholder="Ej: 60"
                      min="0"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
                    />
                  </Field>
                  <Field label="Créditos base">
                    <input
                      type="number"
                      value={form.creditos_base}
                      onChange={(e) => setField("creditos_base", e.target.value)}
                      placeholder="Ej: 42"
                      min="0"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
                    />
                  </Field>
                  <Field label="Créditos de especialización">
                    <input
                      type="number"
                      value={form.creditos_especializacion}
                      onChange={(e) => setField("creditos_especializacion", e.target.value)}
                      placeholder="Ej: 18"
                      min="0"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
                    />
                  </Field>
                  {form.costo_credito.trim() && form.creditos_totales.trim() && (
                    <Field label="Total aprox. (calculado)">
                      <div className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground">
                        {fmtMoneda(Number(form.costo_credito) * Number(form.creditos_totales), form.moneda)}
                      </div>
                    </Field>
                  )}
                </div>
              )}
            </div>

            {/* Condiciones */}
            <Field label="Condiciones de pago">
              <input
                type="text"
                value={form.condiciones}
                onChange={(e) => setField("condiciones", e.target.value)}
                placeholder="Ej: 3 cuotas sin interés"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
              />
            </Field>

            {/* Descripción */}
            <Field label="Descripción">
              <textarea
                value={form.descripcion}
                onChange={(e) => setField("descripcion", e.target.value)}
                placeholder="Descripción del programa…"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow resize-none"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* PDF URL */}
              <Field label="URL del PDF / Brochure">
                <input
                  type="url"
                  value={form.pdf_url}
                  onChange={(e) => setField("pdf_url", e.target.value)}
                  placeholder="https://…"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
                />
              </Field>

              {/* Checkout URL */}
              <Field label="URL de checkout">
                <input
                  type="url"
                  value={form.checkout_url}
                  onChange={(e) => setField("checkout_url", e.target.value)}
                  placeholder="https://…"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
                />
              </Field>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={cancelForm}
                className="px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {saving ? (
                  "Guardando…"
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {editingId ? "Actualizar" : "Crear curso"}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
          Cargando…
        </div>
      )}

      {/* Empty state */}
      {!loading && cursos.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-12 shadow-card flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <GraduationCap className="w-7 h-7 text-primary" />
          </div>
          <p className="font-semibold text-foreground">Sin cursos todavía</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Agregá el primer programa para que el agente pueda informar precios, fechas y materiales a los leads.
          </p>
          <button
            onClick={openNew}
            className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo curso
          </button>
        </div>
      )}

      {/* Course list */}
      {!loading && cursos.length > 0 && (
        <div className="space-y-4">
          {cursos.map((c) => (
            <CursoCard
              key={c.id}
              curso={c}
              onEdit={() => openEdit(c)}
              onDelete={() => deleteCurso(c)}
              onToggleActivo={(v) => toggleActivo(c, v)}
              onAddTurma={(fecha, cupos) => addTurma(c.id, fecha, cupos)}
              onDeleteTurma={(turmaId) => deleteTurma(c.id, turmaId)}
            />
          ))}
        </div>
      )}

      {node}
    </>
  );
}

// ─── CursoCard ───────────────────────────────────────────────────────────────

function CursoCard({
  curso,
  onEdit,
  onDelete,
  onToggleActivo,
  onAddTurma,
  onDeleteTurma,
}: {
  curso: Curso;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActivo: (v: boolean) => void;
  onAddTurma: (fecha: string, cupos: string) => void;
  onDeleteTurma: (turmaId: string) => void;
}) {
  const [turmaFecha, setTurmaFecha] = useState("");
  const [turmaCupos, setTurmaCupos] = useState("");
  const [addingTurma, setAddingTurma] = useState(false);

  async function handleAddTurma(e: React.FormEvent) {
    e.preventDefault();
    if (!turmaFecha) return;
    setAddingTurma(true);
    try {
      await onAddTurma(turmaFecha, turmaCupos);
      setTurmaFecha("");
      setTurmaCupos("");
    } finally {
      setAddingTurma(false);
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
      {/* Card header */}
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground truncate">{curso.nombre}</h3>
              {!curso.activo && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                  Inactivo
                </span>
              )}
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {curso.tipo && (
                <Badge color="primary">{curso.tipo}</Badge>
              )}
              {curso.area && (
                <Badge color="muted">{curso.area}</Badge>
              )}
              {curso.modalidad && (
                <Badge color="accent">{curso.modalidad}</Badge>
              )}
              {curso.nivel && (
                <Badge color="muted">{curso.nivel}</Badge>
              )}
              {curso.duracion && (
                <Badge color="muted">{curso.duracion}</Badge>
              )}
            </div>

            {/* Precio + condiciones (o desglose por crédito, ej. MIU) */}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {curso.cobro_por_credito ? (
                <>
                  {curso.costo_credito != null && (
                    <span className="text-lg font-bold text-foreground">
                      {fmtMoneda(curso.costo_credito, curso.moneda)}
                      <span className="text-xs font-normal text-muted-foreground"> / crédito</span>
                    </span>
                  )}
                  {curso.creditos_totales != null && (
                    <span className="text-xs text-muted-foreground">
                      {curso.creditos_totales} créditos
                      {curso.creditos_base != null && curso.creditos_especializacion != null &&
                        ` (${curso.creditos_base} base + ${curso.creditos_especializacion} especialización)`}
                    </span>
                  )}
                  {curso.costo_credito != null && curso.creditos_totales != null && (
                    <span className="text-xs text-muted-foreground">
                      Total aprox. {fmtMoneda(curso.costo_credito * curso.creditos_totales, curso.moneda)}
                    </span>
                  )}
                </>
              ) : (
                curso.precio != null && (
                  <span className="text-lg font-bold text-foreground">
                    {fmtPrecio(curso.precio)}
                  </span>
                )
              )}
              {curso.condiciones && (
                <span className="text-xs text-muted-foreground">{curso.condiciones}</span>
              )}
            </div>

            {curso.descripcion && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{curso.descripcion}</p>
            )}

            {/* Links */}
            <div className="flex gap-3 mt-2 flex-wrap">
              {curso.pdf_url && (
                <a
                  href={curso.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary font-medium hover:underline"
                >
                  Ver PDF
                </a>
              )}
              {curso.checkout_url && (
                <a
                  href={curso.checkout_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary font-medium hover:underline"
                >
                  Checkout →
                </a>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Toggle on={curso.activo} onChange={onToggleActivo} label="" />
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Editar"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg border border-border bg-card hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Eliminar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Turmas section */}
      <div className="border-t border-border bg-muted/20 px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Turmas / Fechas de inicio
          </span>
        </div>

        {curso.turmas.length === 0 ? (
          <p className="text-xs text-muted-foreground italic mb-3">Sin turmas registradas.</p>
        ) : (
          <div className="space-y-1.5 mb-3">
            {curso.turmas.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 bg-card rounded-lg border border-border px-3 py-2"
              >
                <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium text-foreground flex-1">
                  {fmtFecha(t.fecha_inicio)}
                </span>
                {t.cupos != null && (
                  <span className="text-xs text-muted-foreground">
                    {t.cupos} cupos
                  </span>
                )}
                <button
                  onClick={() => onDeleteTurma(t.id)}
                  className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                  title="Eliminar turma"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add turma form */}
        <form onSubmit={handleAddTurma} className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={turmaFecha}
            onChange={(e) => setTurmaFecha(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
            required
          />
          <input
            type="number"
            value={turmaCupos}
            onChange={(e) => setTurmaCupos(e.target.value)}
            placeholder="Cupos (opcional)"
            min="1"
            className="flex h-9 w-36 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-shadow"
          />
          <button
            type="submit"
            disabled={!turmaFecha || addingTurma}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar turma
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Badge ───────────────────────────────────────────────────────────────────

function Badge({
  children,
  color,
}: {
  children: React.ReactNode;
  color: "primary" | "muted" | "accent" | "success";
}) {
  const cls: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    muted: "bg-muted text-muted-foreground",
    accent: "bg-accent text-accent-foreground",
    success: "bg-success/15 text-success",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${cls[color]}`}
    >
      {children}
    </span>
  );
}
