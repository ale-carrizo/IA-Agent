"use client";

import { usePathname } from "next/navigation";

// Ancho por tipo de contenido (patrón "content-appropriate width"):
// - Formularios/config: max-w-4xl (896px) → líneas de lectura y campos cómodos.
// - Vistas de datos (tablas de registros): anchas → sin scroll horizontal.
const SECCIONES_ANCHAS = new Set([
  "conversaciones",
  "observability",
  "agenda",
  "insights",
]);

export function ContentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // /agent/<id>/<seccion>  → la sección es el 3er segmento (vacío en el resumen)
  const seccion = pathname?.split("/")[3] ?? "";
  const ancha = SECCIONES_ANCHAS.has(seccion);
  return (
    <div
      className={`${ancha ? "max-w-[1440px]" : "max-w-4xl"} mx-auto py-7 px-8 transition-[max-width] duration-200`}
    >
      {children}
    </div>
  );
}
