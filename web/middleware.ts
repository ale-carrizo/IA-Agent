import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";

// El gate se activa SOLO cuando la auth está configurada (AUTH_SECRET + credenciales
// de Google). Antes de eso pasa de largo, para no bloquear producción mientras
// todavía no cargaste las credenciales. Apenas las cargás, protege todo.
const AUTH_ENABLED = Boolean(
  process.env.AUTH_SECRET && (process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID)
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const middleware: any = AUTH_ENABLED ? auth : (_req: NextRequest) => NextResponse.next();

export const config = {
  matcher: [
    // todo salvo: endpoints de auth, el pre-seed (machine-to-machine, protegido por
    // secreto propio), la página de login, assets de Next y archivos estáticos
    "/((?!api/auth|api/preseed|login|_next/static|_next/image|fonts|favicon.ico|icon.svg|.*\\.(?:png|jpe?g|gif|svg|otf|ttf|woff2?|css|js)$).*)",
  ],
};
