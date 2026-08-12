"use client";

import { useState, useCallback } from "react";

// ---------- Toggle ----------
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <span className="switch" onClick={() => onChange(!on)}>
      <span className={"track" + (on ? " on" : "")}><span className="knob" /></span>
      {label && <span>{label}</span>}
    </span>
  );
}

// ---------- Pills (single-select cards, ej. persona/tono) ----------
export function Pills<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string; desc?: string }[] }) {
  return (
    <div className="pills">
      {options.map((o) => (
        <div key={o.value} className={"pill" + (value === o.value ? " active" : "")} onClick={() => onChange(o.value)}>
          <strong>{o.label}</strong>
          {o.desc && <span>{o.desc}</span>}
        </div>
      ))}
    </div>
  );
}

// ---------- Toast ----------
export function useToast() {
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const show = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 2600);
  }, []);
  const node = toast ? <div className={"toast" + (toast.err ? " err" : "")}>{toast.msg}</div> : null;
  return { show, node };
}

// ---------- Field wrapper ----------
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {hint && <div className="hint">{hint}</div>}
      {children}
    </div>
  );
}

// ---------- fetch helpers ----------
export async function api(url: string, method: string, body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `HTTP ${r.status}`);
  }
  return r.status === 204 ? null : r.json();
}
