"use client";

import { use, useEffect, useRef, useState } from "react";
import { RotateCcw, Send, Check, CheckCheck, Play, FlaskConical, FileText, Smartphone } from "lucide-react";
import { useToast } from "@/lib/ui";

// ─── Tipos ───────────────────────────────────────────────────────────────────
type Msg = {
  rol: "user" | "bot" | "sys";
  texto: string;
  hora: string;
  pdf?: string | null;
};

// nombre legible del PDF adjunto (saca el timestamp del storage)
const nombrePdf = (url: string) => {
  try {
    const f = decodeURIComponent(url.split("/").pop() || "");
    return f.replace(/^\d+-/, "").replace(/_/g, " ") || "Documento PDF";
  } catch {
    return "Documento PDF";
  }
};

type TestRow = {
  pregunta: string;
  respuesta: string;
  ms: number;
  estado: "ok" | "vacia" | "error";
};

const BATERIA_DEFAULT = [
  "Hola, quiero información",
  "¿Qué másters tienen disponibles?",
  "Me interesa inteligencia artificial",
  "¿Cuánto dura el programa?",
  "¿Cuál es el precio?",
  "¿Es una maestría oficial con validez?",
  "¿Las clases son en vivo? no tengo tiempo",
  "¿Me pueden mandar el brochure?",
  "Soy psicóloga, ¿qué me recomiendan?",
  "Quiero hablar con un asesor",
].join("\n");

// Texto de la plantilla saliente que Neotel manda antes de que responda el lead.
// Solo para dar contexto en el playground (en prod la manda Botmaker con el nombre).
const PLANTILLA_SALIENTE =
  "Hola 👋 Vi tu solicitud de información sobre nuestros posgrados. ¿Te comparto los detalles por aquí?";

const hora = () =>
  new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

// ─── Página ──────────────────────────────────────────────────────────────────
export default function PlaygroundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { show, node } = useToast();

  const [tel, setTel] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const [modoQA, setModoQA] = useState(true);
  const [programas, setProgramas] = useState<{ codigo: string; programa_nombre: string }[]>([]);
  const [progCodigo, setProgCodigo] = useState(""); // "" = arranque en frío (sin plantilla)
  const chatRef = useRef<HTMLDivElement>(null);

  // teléfono nuevo por sesión = lead fresco (estado/memoria del motor desde cero)
  useEffect(() => {
    setTel("play-" + Math.random().toString(36).slice(2, 9));
  }, []);

  // programas disponibles para simular "llegó por plantilla" (mapa de pre-seed)
  useEffect(() => {
    fetch(`/api/agentes/${id}/preseed`)
      .then((r) => (r.ok ? r.json() : { programas: [] }))
      .then((d) => setProgramas(d.programas ?? []))
      .catch(() => setProgramas([]));
  }, [id]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, escribiendo]);

  // Arranca un lead nuevo simulando el flujo real: le "llega" la plantilla saliente y,
  // si hay programa elegido, se pre-siembra en el motor (como el POST de Neotel en paralelo).
  async function nuevoLead(codigo: string) {
    const nuevoTel = "play-" + Math.random().toString(36).slice(2, 9);
    setTel(nuevoTel);
    setProgCodigo(codigo);
    const plantilla: Msg = {
      rol: "sys",
      texto: `📤 Plantilla enviada al lead: «${PLANTILLA_SALIENTE}»`,
      hora: hora(),
    };
    if (!codigo) {
      setMsgs([
        plantilla,
        {
          rol: "sys",
          texto:
            "⚠️ Fallback: sin programa pre-cargado. Carmen debería mencionar los 3 posgrados y preguntar cuál. Respondé como el lead (ej: «sí, dale»).",
          hora: hora(),
        },
      ]);
      show("Lead nuevo — fallback (sin programa)");
      return;
    }
    try {
      const r = await fetch(`/api/agentes/${id}/preseed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ telefono: nuevoTel, codigo }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "no se pudo pre-sembrar");
      setMsgs([
        plantilla,
        {
          rol: "sys",
          texto: `🎓 Programa pre-cargado: "${data.programa}". Carmen ya lo sabe — respondé como el lead (ej: «sí, por favor»).`,
          hora: hora(),
        },
      ]);
      show("Simulación lista: " + data.programa);
    } catch (e) {
      show((e as Error).message, true);
    }
  }

  function reiniciar() {
    nuevoLead(progCodigo); // respeta el programa elegido (o frío si está en "")
  }

  async function llamarMotor(telefono: string, mensaje: string): Promise<{ respuesta: string; partes: string[]; pdf?: string | null; transbordo: boolean; razon: string }> {
    const r = await fetch("/api/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agente_id: id, telefono, mensaje }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error del motor");
    const respuesta = data.respuesta ?? "";
    // el motor devuelve el split REAL que saldría por WhatsApp; fallback: por párrafos
    const partes: string[] =
      Array.isArray(data.mensajes) && data.mensajes.length
        ? data.mensajes
        : String(respuesta).split(/\n\s*\n/).map((s: string) => s.trim()).filter(Boolean);
    return { respuesta, partes, pdf: data.pdf_a_enviar || null, transbordo: !!data.just_handed, razon: String(data.razon || "") };
  }

  async function enviar() {
    const mensaje = texto.trim();
    if (!mensaje || escribiendo) return;
    setTexto("");
    setMsgs((m) => [...m, { rol: "user", texto: mensaje, hora: hora() }]);
    setEscribiendo(true);
    try {
      const { partes: partesMotor, pdf, transbordo, razon } = await llamarMotor(tel, mensaje);
      const partes = partesMotor.length ? partesMotor : ["(sin respuesta)"];
      for (let i = 0; i < partes.length; i++) {
        if (i > 0) await new Promise((res) => setTimeout(res, 600));
        const esUltima = i === partes.length - 1;
        setMsgs((m) => [...m, { rol: "bot", texto: partes[i], hora: hora(), pdf: esUltima ? pdf : null }]);
      }
      if (transbordo) setMsgs((m) => [...m, { rol: "sys", texto: "🔁 Transbordo disparado — acá el lead pasa a la cola de asesores", hora: hora() }]);
      if (modoQA && razon) setMsgs((m) => [...m, { rol: "sys", texto: "🧭 " + razon, hora: hora() }]);
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setEscribiendo(false);
    }
  }

  // ── Batería de tests ───────────────────────────────────────────────────────
  const [bateria, setBateria] = useState(BATERIA_DEFAULT);
  const [corriendo, setCorriendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [resultados, setResultados] = useState<TestRow[]>([]);

  async function correrBateria() {
    const preguntas = bateria.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!preguntas.length) return;
    setCorriendo(true);
    setResultados([]);
    setProgreso(0);
    // teléfono propio para la batería: una sola conversación que evoluciona (como un lead real)
    const telTest = "test-" + Math.random().toString(36).slice(2, 9);
    const filas: TestRow[] = [];
    for (let i = 0; i < preguntas.length; i++) {
      const t0 = Date.now();
      try {
        const { respuesta } = await llamarMotor(telTest, preguntas[i]);
        filas.push({
          pregunta: preguntas[i],
          respuesta: respuesta || "",
          ms: Date.now() - t0,
          estado: respuesta && respuesta.trim() ? "ok" : "vacia",
        });
      } catch (e) {
        filas.push({ pregunta: preguntas[i], respuesta: (e as Error).message, ms: Date.now() - t0, estado: "error" });
      }
      setResultados([...filas]);
      setProgreso(i + 1);
    }
    setCorriendo(false);
    const ok = filas.filter((f) => f.estado === "ok").length;
    show(`Batería completa: ${ok}/${filas.length} respondidas`);
  }

  const okCount = resultados.filter((r) => r.estado === "ok").length;

  // ── Playground REAL: enviar la plantilla de bienvenida por WhatsApp ──
  const [telPlantilla, setTelPlantilla] = useState("");
  const [progPlantilla, setProgPlantilla] = useState(""); // código del programa con el que "entra"
  const [enviandoPlantilla, setEnviandoPlantilla] = useState(false);

  async function enviarPlantilla() {
    const tel = telPlantilla.replace(/\D+/g, "");
    if (tel.length < 8) {
      show("Poné el número con código de país, sin +", true);
      return;
    }
    if (!progPlantilla) {
      show("Elegí el programa con el que entra el lead", true);
      return;
    }
    setEnviandoPlantilla(true);
    try {
      const r = await fetch(`/api/agentes/${id}/enviar-plantilla`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ telefono: tel, codigo: progPlantilla }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detalle || data.error || "no se pudo enviar");
      const prog = programas.find((p) => p.codigo === progPlantilla)?.programa_nombre ?? progPlantilla;
      show(`✅ Plantilla enviada a +${tel} (${prog}). Revisá tu WhatsApp y respondé — Carmen ya sabe tu programa.`);
      setTelPlantilla("");
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setEnviandoPlantilla(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Play className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Playground</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Simulá ser un lead contra el motor real (mismo router, RAG, guardrails y estado) sin
              gastar WhatsApp. Cada reinicio es un lead nuevo.
            </p>
          </div>
        </div>
        <div className="flex-shrink-0 flex items-center gap-3">
          {programas.length > 0 && (
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground select-none">
              Llega por plantilla:
              <select
                value={progCodigo}
                onChange={(e) => nuevoLead(e.target.value)}
                className="px-2 py-1.5 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 max-w-[220px]"
                title="Simula que el lead respondió la plantilla de ese programa (Carmen ya lo sabe)"
              >
                <option value="">— Arranque en frío —</option>
                {programas.map((p) => (
                  <option key={p.codigo} value={p.codigo}>{p.programa_nombre}</option>
                ))}
              </select>
            </label>
          )}
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={modoQA} onChange={(e) => setModoQA(e.target.checked)} className="accent-current" />
            Modo QA (ver etapa/razón)
          </label>
          <button
            onClick={reiniciar}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background text-sm font-medium hover:bg-muted transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reiniciar
          </button>
        </div>
      </div>

      {/* ── Playground REAL: enviar la plantilla por WhatsApp ── */}
      <div className="rounded-xl border border-primary/40 bg-primary/5 p-5 shadow-card">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#25D366]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Smartphone className="w-5 h-5 text-[#25D366]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-base text-foreground">Probar en tu WhatsApp real</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Elegí el programa con el que entra el lead y poné tu número: te llega la plantilla de
              bienvenida a WhatsApp y, como en producción, Carmen ya sabe con qué programa entrás.
              Respondela y hablás con el bot como un lead real. (Envía un WhatsApp de verdad.)
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              <select
                value={progPlantilla}
                onChange={(e) => setProgPlantilla(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 max-w-[240px]"
                title="Programa con el que el CRM daría de alta al lead (código de mapeo)"
              >
                <option value="">— Programa del lead —</option>
                {programas.map((p) => (
                  <option key={p.codigo} value={p.codigo}>{p.programa_nombre}</option>
                ))}
              </select>
              <input
                value={telPlantilla}
                onChange={(e) => setTelPlantilla(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enviarPlantilla()}
                placeholder="Número con código de país, sin + (ej. 573001234567)"
                className="flex-1 min-w-[220px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
              <button
                onClick={enviarPlantilla}
                disabled={enviandoPlantilla || telPlantilla.replace(/\D+/g, "").length < 8 || !progPlantilla}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#25D366] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
                {enviandoPlantilla ? "Enviando…" : "Enviar plantilla"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Chat estilo WhatsApp (simulación, sin gastar WhatsApp) ── */}
      <div className="rounded-xl overflow-hidden border border-border shadow-card">
        {/* Header del chat */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ background: "#202c33" }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-sm" style={{ background: "#00a884" }}>
            G
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white">Agente (motor real)</div>
            <div className="text-[11px]" style={{ color: "#8696a0" }}>
              {escribiendo ? "escribiendo…" : "en línea"} · lead: {tel}
            </div>
          </div>
        </div>

        {/* Mensajes */}
        <div
          ref={chatRef}
          className="h-[440px] overflow-y-auto px-4 py-4 space-y-1.5"
          style={{
            background: "#0b141a",
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.028) 1.5px, transparent 1.5px)",
            backgroundSize: "22px 22px",
          }}
        >
          {msgs.length === 0 && (
            <div className="flex justify-center pt-6">
              <span className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "#182229", color: "#8696a0" }}>
                🔒 Simulación — escribí como si fueras el lead
              </span>
            </div>
          )}
          {msgs.map((m, i) => (
            m.rol === "sys" ? (
              <div key={i} className="flex justify-center py-0.5">
                <span className="text-[11px] px-3 py-1 rounded-lg text-center" style={{ background: "#182229", color: "#8696a0" }}>
                  {m.texto}
                </span>
              </div>
            ) : (
            <div key={i} className={`flex ${m.rol === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[78%] rounded-lg px-3 py-1.5 text-[13.5px] leading-snug whitespace-pre-wrap break-words shadow"
                style={m.rol === "user"
                  ? { background: "#005c4b", color: "#e9edef", borderTopRightRadius: i > 0 && msgs[i - 1].rol === "user" ? 8 : 0 }
                  : { background: "#202c33", color: "#e9edef", borderTopLeftRadius: i > 0 && msgs[i - 1].rol === "bot" ? 8 : 0 }}
              >
                {m.texto}
                {m.pdf && (
                  <a
                    href={m.pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 mt-2 p-2 rounded-md"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    <FileText className="w-6 h-6" style={{ color: "#f15746" }} />
                    <span className="text-xs underline" style={{ color: "#53bdeb" }}>{nombrePdf(m.pdf)}</span>
                  </a>
                )}
                <span className="inline-flex items-center gap-1 float-right ml-2 mt-1.5 text-[10px]" style={{ color: "#8696a0" }}>
                  {m.hora}
                  {m.rol === "user" && <CheckCheck className="w-3.5 h-3.5" style={{ color: "#53bdeb" }} />}
                  {m.rol === "bot" && <Check className="w-3 h-3 opacity-0" />}
                </span>
              </div>
            </div>
            )
          ))}
          {escribiendo && (
            <div className="flex justify-start">
              <div className="rounded-lg px-4 py-2.5" style={{ background: "#202c33" }}>
                <span className="inline-flex gap-1">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#8696a0", animationDelay: `${d * 150}ms` }} />
                  ))}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "#202c33" }}>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviar()}
            placeholder="Escribí un mensaje"
            className="flex-1 rounded-lg px-4 py-2.5 text-sm outline-none"
            style={{ background: "#2a3942", color: "#e9edef" }}
          />
          <button
            onClick={enviar}
            disabled={escribiendo || !texto.trim()}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity disabled:opacity-40"
            style={{ background: "#00a884" }}
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* ── Tests automáticos ── */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <FlaskConical className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Tests automáticos</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Una pregunta por línea. Se ejecutan en secuencia como UNA conversación real (el lead
                evoluciona por el embudo). Editá la batería a gusto.
              </p>
            </div>
          </div>
          <button
            onClick={correrBateria}
            disabled={corriendo}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            <Play className="w-4 h-4" />
            {corriendo ? `Corriendo ${progreso}/${bateria.split("\n").filter((s) => s.trim()).length}…` : "Correr batería"}
          </button>
        </div>

        <textarea
          value={bateria}
          onChange={(e) => setBateria(e.target.value)}
          rows={6}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-vertical"
        />

        {resultados.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold">
              Resultado: <span className="text-success">{okCount} ok</span>
              {resultados.some((r) => r.estado !== "ok") && (
                <span className="text-destructive"> · {resultados.length - okCount} con problema</span>
              )}
              <span className="text-muted-foreground font-normal"> · {Math.round(resultados.reduce((a, r) => a + r.ms, 0) / 1000)}s total</span>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              {resultados.map((r, i) => (
                <div key={i} className={`px-4 py-3 text-sm ${i !== resultados.length - 1 ? "border-b border-border" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{i + 1}. {r.pregunta}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${r.estado === "ok" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}>
                      {r.estado} · {(r.ms / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-4">{r.respuesta}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {node}
    </>
  );
}
