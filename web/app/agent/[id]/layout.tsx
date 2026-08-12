import Link from "next/link";
import { ArrowLeft, Bot } from "lucide-react";
import { db } from "@/lib/db";
import { Sidebar } from "./Sidebar";
import TopBar from "./TopBar";
import { ContentShell } from "./ContentShell";

export const dynamic = "force-dynamic";

export type SeccionData = {
  slug: string;
  label: string;
  iconName: string;
  done: boolean | null;
};

export default async function AgentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [agRes, varRes, grRes, horRes, etRes, fuRes, kbRes, canRes, curRes, crmRes] = await Promise.all([
    db.query("SELECT nombre, rol FROM agentes WHERE id=$1", [id]),
    db.query("SELECT COUNT(*)::int AS c FROM agente_variables WHERE agente_id=$1", [id]),
    db.query("SELECT COUNT(*)::int AS c FROM guardrails WHERE agente_id=$1", [id]),
    db.query("SELECT COUNT(*)::int AS c FROM horarios_atencion WHERE agente_id=$1", [id]),
    db.query("SELECT COUNT(*)::int AS c FROM etapas WHERE agente_id=$1", [id]),
    db.query("SELECT COUNT(*)::int AS c FROM follow_ups WHERE agente_id=$1", [id]),
    db.query("SELECT COUNT(*)::int AS c FROM bases_conocimiento WHERE agente_id=$1", [id]),
    db.query("SELECT COUNT(*)::int AS c FROM canales WHERE agente_id=$1 AND activo", [id]),
    db.query("SELECT COUNT(*)::int AS c FROM cursos WHERE agente_id=$1 AND activo", [id]),
    // tolerante: la tabla puede no existir hasta correr la migración 09-crm.sql
    db.query("SELECT COUNT(*)::int AS c FROM crm_integraciones WHERE agente_id=$1 AND activo", [id]).catch(() => ({ rows: [{ c: 0 }] })),
  ]);

  const ag = agRes.rows[0];
  const nombre: string = ag?.nombre ?? "Agente";

  const identidadDone = !!(ag?.nombre && ag?.rol);
  const variablesDone = ((varRes.rows[0]?.c as number) ?? 0) > 0;
  const guardrailsDone = ((grRes.rows[0]?.c as number) ?? 0) > 0;
  const horariosDone = ((horRes.rows[0]?.c as number) ?? 0) > 0;
  const stagesDone = ((etRes.rows[0]?.c as number) ?? 0) > 0;
  const followUpsDone = ((fuRes.rows[0]?.c as number) ?? 0) > 0;
  const knowledgeDone = ((kbRes.rows[0]?.c as number) ?? 0) > 0;
  const canalesDone = ((canRes.rows[0]?.c as number) ?? 0) > 0;
  const cursosDone = ((curRes.rows[0]?.c as number) ?? 0) > 0;
  const crmDone = ((crmRes.rows[0]?.c as number) ?? 0) > 0;

  const secciones: SeccionData[] = [
    { slug: "summary", label: "Resumen", iconName: "LayoutDashboard", done: null },
    { slug: "identidad", label: "Identidad y Comportamiento", iconName: "User", done: identidadDone },
    { slug: "variables", label: "Variables del Agente", iconName: "Variable", done: variablesDone },
    { slug: "guardrails", label: "Guardrails", iconName: "Shield", done: guardrailsDone },
    { slug: "channels", label: "Canal de Conexión", iconName: "Radio", done: canalesDone },
    { slug: "horarios", label: "Horario de Atención", iconName: "Clock", done: horariosDone },
    { slug: "stages", label: "Etapas de Conversación", iconName: "Layers", done: stagesDone },
    { slug: "orquestador", label: "Orquestador", iconName: "Brain", done: null },
    { slug: "cursos", label: "Cursos", iconName: "GraduationCap", done: cursosDone },
    { slug: "follow-ups", label: "Follow-ups", iconName: "Send", done: followUpsDone },
    { slug: "knowledge", label: "Bases de Conocimiento", iconName: "BookOpen", done: knowledgeDone },
    { slug: "crm", label: "Integración CRM", iconName: "Plug", done: crmDone },
    { slug: "agenda", label: "Agenda", iconName: "CalendarClock", done: null },
    { slug: "conversaciones", label: "Conversaciones", iconName: "MessageSquare", done: null },
    { slug: "funnel", label: "Funnel de Leads", iconName: "Filter", done: null },
    { slug: "observability", label: "Observabilidad", iconName: "Activity", done: null },
    { slug: "insights", label: "Insights", iconName: "TrendingUp", done: null },
    { slug: "pulido", label: "Pulido IA", iconName: "Sparkles", done: null },
  ];

  const contables = secciones.filter((s) => s.done !== null);
  const completadas = contables.filter((s) => s.done === true).length;
  const total = contables.length;
  const pct = total > 0 ? Math.round((completadas / total) * 100) : 0;

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Sidebar */}
      <aside className="w-72 flex-shrink-0 bg-sidebar border-r border-sidebar-border sticky top-0 h-screen overflow-y-auto flex flex-col">
        {/* Brand + volver */}
        <div className="p-4 border-b border-sidebar-border space-y-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #1946E3, #0F2FA0)" }}
            >
              N
            </div>
            <div className="text-sm font-semibold text-foreground">Sales AI</div>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver al dashboard
          </Link>
        </div>

        {/* Agent + progreso (compacto) */}
        <div className="px-4 py-3 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="w-[18px] h-[18px] text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm text-foreground truncate leading-tight">{nombre}</div>
              <div className="flex items-center gap-1.5 mt-1" title={`${completadas} de ${total} secciones configuradas`}>
                <div className="h-1 flex-1 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">{completadas}/{total}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <Sidebar id={id} secciones={secciones} />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <ContentShell>
          <TopBar nombre={nombre} />
          <div className="space-y-6">{children}</div>
        </ContentShell>
      </main>
    </div>
  );
}
