"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Field, useToast } from "@/lib/ui";

type Usuario = {
  id: string;
  email: string;
  nombre: string;
  rol: "admin" | "usuario";
  activo: boolean;
  ultimo_ingreso: string | null;
  creado_en: string;
  tiene_password: boolean;
};

const inputCls =
  "w-full px-3 py-2 rounded-md border border-border bg-background text-sm outline-none focus:border-primary";

function fecha(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

export default function UsuariosClient({ miId }: { miId: string }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [migrado, setMigrado] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [alta, setAlta] = useState(false);
  const [claveDe, setClaveDe] = useState<Usuario | null>(null);
  const { show, node } = useToast();

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/usuarios", { cache: "no-store" });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setUsuarios(j.usuarios ?? []);
      setMigrado(j.migrado !== false);
    } catch (e) {
      show(e instanceof Error ? e.message : "no se pudo cargar", true);
    } finally {
      setCargando(false);
    }
  }, [show]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const patch = async (u: Usuario, cambios: Partial<Usuario> & { password?: string }) => {
    const r = await fetch(`/api/usuarios/${u.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cambios),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return show(j.error ?? "no se pudo guardar", true);
    show("Guardado.");
    void cargar();
  };

  const borrar = async (u: Usuario) => {
    const r = await fetch(`/api/usuarios/${u.id}`, { method: "DELETE" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return show(j.error ?? "no se pudo borrar", true);
    }
    show("Usuario eliminado.");
    void cargar();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {node}

      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="text-[11px] font-semibold flex items-center gap-1.5 text-muted-foreground">
          <Link href="/" className="text-primary hover:underline flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> IA-AGENT
          </Link>
          <span>/</span>
          <span className="text-primary">Usuarios</span>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => void cargar()}>
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
          <button className="btn primary" onClick={() => setAlta(true)}>
            <Plus className="w-4 h-4" /> Nuevo usuario
          </button>
        </div>
      </div>

      {!migrado && (
        <div className="badge amber mb-4">
          Falta correr <code>db/22-usuarios.sql</code> en esta base.
        </div>
      )}

      {cargando ? (
        <div className="empty">Cargando…</div>
      ) : usuarios.length === 0 ? (
        <div className="empty">No hay usuarios cargados.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground text-xs">
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Nombre</th>
                <th className="py-2 pr-3">Rol</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Último ingreso</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="py-2 pr-3">
                    {u.email}
                    {u.id === miId && <span className="badge blue ml-2">vos</span>}
                    {!u.tiene_password && <span className="badge ml-2">solo Google</span>}
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className={inputCls}
                      defaultValue={u.nombre}
                      onBlur={(e) => {
                        if (e.target.value !== u.nombre) void patch(u, { nombre: e.target.value });
                      }}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      className={inputCls}
                      value={u.rol}
                      onChange={(e) => void patch(u, { rol: e.target.value as Usuario["rol"] })}
                    >
                      <option value="usuario">usuario</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      className={"badge " + (u.activo ? "green" : "")}
                      onClick={() => void patch(u, { activo: !u.activo })}
                    >
                      {u.activo ? "activo" : "inactivo"}
                    </button>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{fecha(u.ultimo_ingreso)}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button className="btn" title="Cambiar contraseña" onClick={() => setClaveDe(u)}>
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                      className="btn danger ml-1"
                      title="Eliminar"
                      disabled={u.id === miId}
                      onClick={() => void borrar(u)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {alta && (
        <ModalAlta
          onClose={() => setAlta(false)}
          onHecho={() => {
            setAlta(false);
            void cargar();
          }}
          show={show}
        />
      )}

      {claveDe && (
        <ModalClave
          usuario={claveDe}
          onClose={() => setClaveDe(null)}
          onHecho={() => {
            setClaveDe(null);
            void cargar();
          }}
          show={show}
        />
      )}
    </div>
  );
}

function Modal({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(10,12,20,0.55)" }}>
      <div className="bg-background border border-border rounded-lg p-5 w-full max-w-md">
        <h2 className="text-base font-semibold mb-4">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

function ModalAlta({
  onClose, onHecho, show,
}: { onClose: () => void; onHecho: () => void; show: (m: string, e?: boolean) => void }) {
  const [form, setForm] = useState({ email: "", nombre: "", password: "", rol: "usuario" });
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    const r = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const j = await r.json().catch(() => ({}));
    setGuardando(false);
    if (!r.ok) return show(j.error ?? "no se pudo crear", true);
    show("Usuario creado.");
    onHecho();
  };

  return (
    <Modal titulo="Nuevo usuario">
      <Field label="Email">
        <input className={inputCls} type="email" value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
      </Field>
      <Field label="Nombre">
        <input className={inputCls} value={form.nombre}
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
      </Field>
      <Field label="Contraseña" hint="Mínimo 10 caracteres, con letras y números. Vacío = la cuenta solo entra por Google.">
        <input className={inputCls} type="password" value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
      </Field>
      <Field label="Rol">
        <select className={inputCls} value={form.rol}
          onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}>
          <option value="usuario">usuario</option>
          <option value="admin">admin</option>
        </select>
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={guardando} onClick={() => void guardar()}>
          {guardando ? "Creando…" : "Crear"}
        </button>
      </div>
    </Modal>
  );
}

function ModalClave({
  usuario, onClose, onHecho, show,
}: { usuario: Usuario; onClose: () => void; onHecho: () => void; show: (m: string, e?: boolean) => void }) {
  const [password, setPassword] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    const r = await fetch(`/api/usuarios/${usuario.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const j = await r.json().catch(() => ({}));
    setGuardando(false);
    if (!r.ok) return show(j.error ?? "no se pudo cambiar", true);
    show("Contraseña actualizada.");
    onHecho();
  };

  return (
    <Modal titulo={`Contraseña de ${usuario.email}`}>
      <Field label="Nueva contraseña" hint="Mínimo 10 caracteres, con letras y números.">
        <input className={inputCls} type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={guardando || !password} onClick={() => void guardar()}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}
