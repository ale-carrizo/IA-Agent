"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  User,
  Variable,
  Shield,
  Clock,
  Layers,
  Send,
  BookOpen,
  CalendarClock,
  Activity,
  MessageSquare,
  Radio,
  GraduationCap,
  Check,
  Circle,
  Play,
  Sparkles,
  Brain,
  TrendingUp,
  Plug,
  Filter,
} from "lucide-react";
import type { SeccionData } from "./layout";

type IconComponent = React.ComponentType<{ className?: string }>;

const ICON_MAP: Record<string, IconComponent> = {
  LayoutDashboard,
  User,
  Variable,
  Shield,
  Clock,
  Layers,
  Send,
  BookOpen,
  CalendarClock,
  Activity,
  MessageSquare,
  Radio,
  GraduationCap,
  Sparkles,
  Brain,
  TrendingUp,
  Plug,
  Filter,
};

export function Sidebar({ id, secciones }: { id: string; secciones: SeccionData[] }) {
  const path = usePathname();

  return (
    <div className="flex flex-col gap-0.5">
      {secciones.map((s) => {
        const href = `/agent/${id}/${s.slug}`;
        const active = path === href || path.startsWith(href + "/");
        const Icon: IconComponent = ICON_MAP[s.iconName] ?? LayoutDashboard;

        return (
          <Link
            key={s.slug}
            href={href}
            className={[
              "flex items-center gap-2.5 px-2.5 py-[7px] rounded-[10px] text-[13px] font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            ].join(" ")}
          >
            <Icon className="w-[18px] h-[18px] flex-shrink-0" />
            <span className="flex-1 truncate">{s.label}</span>
            {s.done === true && (
              <span className="w-4 h-4 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
                <Check className="w-2.5 h-2.5 text-success" />
              </span>
            )}
            {s.done === false && (
              <Circle className="w-2 h-2 text-muted-foreground/30 flex-shrink-0" />
            )}
          </Link>
        );
      })}

      {/* Playground button (simulador estilo WhatsApp contra el motor real) */}
      <div className="mt-2 pt-2 border-t border-sidebar-border">
        <Link
          href={`/agent/${id}/playground`}
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-[10px] text-[13px] font-semibold bg-success text-white hover:bg-success/90 transition-colors"
        >
          <Play className="w-4 h-4" />
          Playground
        </Link>
      </div>
    </div>
  );
}
