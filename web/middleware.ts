import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Solo la config edge-safe: el middleware valida el JWT y no toca la base.
// El gate ya no es opcional — antes se desactivaba solo si faltaban las
// credenciales de Google, y eso dejaba el panel entero abierto.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    // todo salvo: endpoints de auth, el pre-seed (machine-to-machine, protegido por
    // secreto propio), la página de login, assets de Next y archivos estáticos
    "/((?!api/auth|api/preseed|login|_next/static|_next/image|fonts|favicon.ico|icon.svg|.*\\.(?:png|jpe?g|gif|svg|otf|ttf|woff2?|css|js)$).*)",
  ],
};
