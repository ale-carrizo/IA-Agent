"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { ChevronRight, ChevronDown, LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "@/app/providers";

export default function TopBar({ nombre }: { nombre: string }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-6">
      <div className="text-[11px] font-semibold flex items-center gap-1.5 text-muted-foreground min-w-0">
        <Link href="/" className="text-primary hover:underline shrink-0">IA Agent</Link>
        <ChevronRight className="w-3 h-3 shrink-0" />
        <span className="text-primary truncate">{nombre}</span>
      </div>
      <UserMenu />
    </div>
  );
}

function Avatar({ image, inicial, size }: { image?: string | null; inicial: string; size: number }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" width={size} height={size} referrerPolicy="no-referrer"
        className="rounded-full object-cover" style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center text-white font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.42, background: "linear-gradient(135deg, #1946E3, #0F2FA0)" }}>
      {inicial}
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span className={`relative inline-block w-9 h-5 rounded-full transition-colors flex-shrink-0 ${on ? "bg-primary" : "bg-secondary"}`}>
      <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform" style={{ transform: on ? "translateX(16px)" : "none" }} />
    </span>
  );
}

function UserMenu() {
  const { data: session } = useSession();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const u = session?.user;
  if (!u) return null;
  const nombre = u.name || u.email || "Usuario";
  const inicial = (nombre.trim()[0] || "U").toUpperCase();
  return (
    <div className="relative flex-shrink-0">
      <button onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 h-10 pl-1 pr-2 sm:pr-3 rounded-full border bg-card shadow-sm transition-colors ${open ? "border-primary/40" : "border-border hover:border-primary/40"}`}>
        <Avatar image={u.image} inicial={inicial} size={30} />
        <span className="text-sm font-medium max-w-[160px] truncate hidden sm:block text-foreground">{nombre}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-64 rounded-2xl z-50 overflow-hidden bg-card border border-border shadow-xl">
            <div className="p-4 flex items-center gap-3 border-b border-border">
              <Avatar image={u.image} inicial={inicial} size={44} />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate text-foreground">{nombre}</div>
                <div className="text-xs truncate text-muted-foreground">{u.email}</div>
              </div>
            </div>
            <button onClick={toggle}
              className="w-full flex items-center justify-between gap-2.5 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors">
              <span className="flex items-center gap-2.5">
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />} Modo oscuro
              </span>
              <Switch on={theme === "dark"} />
            </button>
            <button onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors border-t border-border">
              <LogOut className="w-4 h-4" /> Cerrar sesión
            </button>
          </div>
        </>
      )}
    </div>
  );
}
