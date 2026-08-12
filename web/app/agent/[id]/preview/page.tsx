"use client";

import { use, useState } from "react";
import Link from "next/link";

type Msg = { rol: "user" | "bot"; texto: string };

export default function Preview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // teléfono fijo por sesión de preview, así n8n mantiene la memoria del chat
  const telefono = "preview-web";

  async function enviar() {
    const mensaje = texto.trim();
    if (!mensaje || cargando) return;
    setTexto("");
    setError(null);
    setMsgs((m) => [...m, { rol: "user", texto: mensaje }]);
    setCargando(true);
    try {
      const r = await fetch("/api/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agente_id: id, telefono, mensaje }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "error");
      setMsgs((m) => [...m, { rol: "bot", texto: data.respuesta ?? JSON.stringify(data) }]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <main>
      <Link href={`/agent/${id}/stages`} style={{ opacity: 0.7, fontSize: 14 }}>
        ← Volver a Etapas
      </Link>
      <h1>Preview del agente</h1>
      <p style={{ opacity: 0.7, fontSize: 14 }}>
        Dispara el motor de n8n (webhook). El estado/etapa lo decide el motor según la conversación.
      </p>

      <div style={chatBox}>
        {msgs.length === 0 && <p style={{ opacity: 0.4 }}>Escribí un mensaje para empezar…</p>}
        {msgs.map((m, i) => (
          <div key={i} style={{ textAlign: m.rol === "user" ? "right" : "left", margin: "8px 0" }}>
            <span style={m.rol === "user" ? bubbleUser : bubbleBot}>{m.texto}</span>
          </div>
        ))}
        {cargando && <div style={{ opacity: 0.5 }}>escribiendo…</div>}
      </div>

      {error && <p style={{ color: "#f87171", fontSize: 13 }}>⚠ {error}</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder="Hola, quiero info…"
          style={input}
        />
        <button onClick={enviar} disabled={cargando} style={btn}>
          Enviar
        </button>
      </div>
    </main>
  );
}

const chatBox: React.CSSProperties = {
  background: "#0e131a", border: "1px solid #222b36", borderRadius: 10,
  padding: 16, minHeight: 280, marginTop: 12,
};
const bubbleUser: React.CSSProperties = {
  background: "#2563eb", color: "white", padding: "8px 12px",
  borderRadius: 12, display: "inline-block", maxWidth: "75%",
};
const bubbleBot: React.CSSProperties = {
  background: "#1f2937", color: "#e6edf3", padding: "8px 12px",
  borderRadius: 12, display: "inline-block", maxWidth: "75%",
};
const input: React.CSSProperties = {
  flex: 1, padding: "10px 12px", borderRadius: 8,
  border: "1px solid #2b3543", background: "#0b0f14", color: "#e6edf3",
};
const btn: React.CSSProperties = {
  background: "#2563eb", color: "white", border: "none",
  padding: "10px 18px", borderRadius: 8, cursor: "pointer",
};
