import "./globals.css";
import { cookies } from "next/headers";
import Providers from "./providers";

export const metadata = { title: "Sales AI — Configuración de Agentes" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="es" className={theme === "dark" ? "dark" : ""}>
      <body>
        <Providers initialTheme={theme}>{children}</Providers>
      </body>
    </html>
  );
}
