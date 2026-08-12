"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Plug, Plus, Save, Trash2, Send, ChevronDown, ChevronRight } from "lucide-react";
import { Toggle, useToast, api } from "@/lib/ui";
import { CRM_PRESETS, type CrmConfig } from "@/lib/crm";

type Integracion = {
  id: string;
  nombre: string;
  preset: string | null;
  config: CrmConfig;
  activo: boolean;
};

type Envio = {
  id: string;
  integracion: string;
  telefono: string | null;
  etapa: string | null;
  status_http: number | null;
  respuesta: string | null;
  exito: boolean;
  es_test: boolean;
  creado_en: string;
};

const inputCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

const textareaCls =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow resize-vertical min-h-[140px]";

export default function CrmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();

  const [items, setItems] = useState<Integracion[]>([]);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [creando, setCreando] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ints, envs] = await Promise.all([
        api(`/api/agentes/${id}/crm`, "GET"),
        api(`/api/agentes/${id}/crm/envios`, "GET"),
      ]);
      setItems(ints);
      setEnvios(envs);
    } catch (e) {
      show((e as Error).message, true);
    }
  }, [id, show]);

  useEffect(() => {
    load();
  }, [load]);

  async function crearDesdePreset(key: string) {
    const p = CRM_PRESETS[key];
    setCreando(key);
    try {
      await api(`/api/agentes/${id}/crm`, "POST", {
        nombre: p.nombre,
        preset: key,
        config: p.config,
      });
      show(`Integración "${p.nombre}" creada — revisá y guardá la config`);
      await load();
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setCreando(null);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Plug className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Integración CRM</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Envía los datos de la ficha del lead a un CRM externo. El disparo se configura activando la
            herramienta <b>&quot;Enviar datos a CRM&quot;</b> en la etapa correspondiente (Etapas → herramientas),
            típicamente la de derivación a especialista. Un envío exitoso por conversación (con reintentos si el CRM falla).
          </p>
        </div>
      </div>

      {/* Nueva integración desde preset */}
      <div className="bg-card rounded-xl border border-border shadow-card p-6 space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Plus className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-semibold text-base">Nueva integración</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.entries(CRM_PRESETS).map(([key, p]) => (
            <button
              key={key}
              onClick={() => crearDesdePreset(key)}
              disabled={creando !== null}
              className="text-left rounded-lg border border-border p-4 hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-60"
            >
              <div className="font-semibold text-sm text-foreground">{p.nombre}</div>
              <div className="text-xs text-muted-foreground mt-1">{p.descripcion}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Placeholders disponibles en la plantilla: <code className="bg-muted px-1 rounded">{"{{telefono}}"}</code>{" "}
          <code className="bg-muted px-1 rounded">{"{{nombre_completo}}"}</code>{" "}
          <code className="bg-muted px-1 rounded">{"{{etapa}}"}</code>{" "}
          <code className="bg-muted px-1 rounded">{"{{agente}}"}</code>{" "}
          <code className="bg-muted px-1 rounded">{"{{ficha.email}}"}</code> (o cualquier campo de la ficha).
          Con default si falta el dato: <code className="bg-muted px-1 rounded">{"{{ficha.email|No definido}}"}</code>.
        </p>
      </div>

      {/* Integraciones */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-muted-foreground text-sm gap-2">
          <Plug className="w-8 h-8 opacity-30" />
          Sin integraciones todavía. Creá una desde un preset.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((it) => (
            <IntegracionCard key={it.id} integ={it} onChanged={load} show={show} />
          ))}
        </div>
      )}

      {/* Envíos recientes */}
      {envios.length > 0 && (
        <div className="bg-card rounded-xl border border-border shadow-card p-6">
          <h2 className="font-semibold text-base pb-4 border-b border-border">Envíos recientes</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm mt-3">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Integración</th>
                  <th className="py-2 pr-4">Teléfono</th>
                  <th className="py-2 pr-4">Etapa</th>
                  <th className="py-2 pr-4">HTTP</th>
                  <th className="py-2 pr-4">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {envios.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                      {new Date(e.creado_en).toLocaleString("es-AR")}
                    </td>
                    <td className="py-2 pr-4">{e.integracion}</td>
                    <td className="py-2 pr-4">{e.telefono ?? "—"}</td>
                    <td className="py-2 pr-4">{e.etapa ?? "—"}</td>
                    <td className="py-2 pr-4 tabular-nums">{e.status_http ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                          e.exito ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {e.exito ? "OK" : "Falló"}
                        {e.es_test ? " · test" : ""}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {node}
    </>
  );
}

// ─── Card de integración ─────────────────────────────────────────────────────

function IntegracionCard({
  integ,
  onChanged,
  show,
}: {
  integ: Integracion;
  onChanged: () => Promise<void>;
  show: (msg: string, err?: boolean) => void;
}) {
  const [nombre, setNombre] = useState(integ.nombre);
  const [activo, setActivo] = useState(integ.activo);
  const [url, setUrl] = useState(integ.config.url || "");
  const [formato, setFormato] = useState<"form" | "json">(integ.config.formato || "form");
  const [campoJson, setCampoJson] = useState(integ.config.campo_json || "");
  const [comoArray, setComoArray] = useState(!!integ.config.json_como_array);
  const [fijosTxt, setFijosTxt] = useState(JSON.stringify(integ.config.campos_fijos || {}, null, 2));
  const [headersTxt, setHeadersTxt] = useState(JSON.stringify(integ.config.headers || {}, null, 2));
  const [plantillaTxt, setPlantillaTxt] = useState(JSON.stringify(integ.config.plantilla || {}, null, 2));
  const [abierto, setAbierto] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function parseJson(txt: string, label: string): Record<string, string> | null {
    try {
      return JSON.parse(txt || "{}");
    } catch {
      show(`JSON inválido en ${label}`, true);
      return null;
    }
  }

  async function guardar() {
    const campos_fijos = parseJson(fijosTxt, "campos fijos");
    const headers = parseJson(headersTxt, "headers");
    const plantilla = parseJson(plantillaTxt, "plantilla");
    if (!campos_fijos || !headers || !plantilla) return;
    setBusy(true);
    try {
      const config: CrmConfig = {
        url: url.trim(),
        metodo: "POST",
        formato,
        headers,
        campos_fijos,
        campo_json: campoJson.trim() || undefined,
        json_como_array: comoArray,
        plantilla,
      };
      await api(`/api/crm/${integ.id}`, "PATCH", { nombre, config, activo });
      show("Integración guardada");
      await onChanged();
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function eliminar() {
    try {
      await api(`/api/crm/${integ.id}`, "DELETE");
      show("Integración eliminada");
      await onChanged();
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  async function probar() {
    setBusy(true);
    setTestResult(null);
    try {
      const r = await api(`/api/crm/${integ.id}/test`, "POST", {});
      setTestResult(`HTTP ${r.status} ${r.exito ? "✓" : "✗"} — ${String(r.respuesta || "").slice(0, 400)}`);
      await onChanged();
    } catch (e) {
      setTestResult(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-card p-6 space-y-5">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={() => setAbierto((v) => !v)} className="text-muted-foreground hover:text-foreground">
            {abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <span className="font-semibold text-base">{nombre}</span>
          {integ.preset && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              preset: {integ.preset}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              activo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activo ? "bg-success" : "bg-muted-foreground"}`} />
            {activo ? "Activa" : "Inactiva"}
          </span>
        </div>
        <Toggle on={activo} onChange={setActivo} label="Activa" />
      </div>

      {abierto && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldRow label="Nombre">
              <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </FieldRow>
            <FieldRow label="Endpoint (URL)">
              <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} />
            </FieldRow>
            <FieldRow label="Formato del body">
              <select
                className={inputCls}
                value={formato}
                onChange={(e) => setFormato(e.target.value as "form" | "json")}
              >
                <option value="form">form-urlencoded</option>
                <option value="json">JSON</option>
              </select>
            </FieldRow>
            <FieldRow
              label="Campo JSON del form"
              hint='si se completa, la plantilla va serializada dentro de este campo (ej: "param1" para Neotel)'
            >
              <input className={inputCls} value={campoJson} onChange={(e) => setCampoJson(e.target.value)} />
            </FieldRow>
          </div>

          <div className="flex items-center gap-3">
            <Toggle on={comoArray} onChange={setComoArray} label="Envolver plantilla en array [ … ]" />
            <span className="text-xs text-muted-foreground">Neotel lo exige; la mayoría de los CRMs no.</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldRow label="Campos fijos" hint='literales que van directo al body (ej: {"idTask": "42"})'>
              <textarea className={textareaCls} value={fijosTxt} onChange={(e) => setFijosTxt(e.target.value)} />
            </FieldRow>
            <FieldRow label="Headers extra" hint='auth/api keys (ej: {"Authorization": "Bearer …"})'>
              <textarea className={textareaCls} value={headersTxt} onChange={(e) => setHeadersTxt(e.target.value)} />
            </FieldRow>
          </div>

          <FieldRow
            label="Plantilla de campos"
            hint="los valores admiten placeholders {{telefono}}, {{nombre_completo}}, {{ficha.<campo>}}…"
          >
            <textarea
              className={textareaCls + " min-h-[220px]"}
              value={plantillaTxt}
              onChange={(e) => setPlantillaTxt(e.target.value)}
            />
          </FieldRow>

          {testResult && (
            <div className="text-xs font-mono bg-muted rounded-md p-3 whitespace-pre-wrap break-all">{testResult}</div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              className="inline-flex items-center gap-2 px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
              onClick={guardar}
              disabled={busy}
            >
              <Save className="w-3.5 h-3.5" />
              Guardar
            </button>
            <button
              className="inline-flex items-center gap-2 px-4 h-9 rounded-md bg-secondary text-secondary-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors disabled:opacity-60"
              onClick={probar}
              disabled={busy}
              title="Envía datos ficticios al endpoint REAL y muestra la respuesta"
            >
              <Send className="w-3.5 h-3.5" />
              {busy ? "Probando…" : "Probar envío"}
            </button>
            <button
              className="inline-flex items-center gap-2 px-4 h-9 rounded-md bg-destructive/10 text-destructive text-sm font-semibold hover:bg-destructive/20 transition-colors"
              onClick={eliminar}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── FieldRow ────────────────────────────────────────────────────────────────

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}
