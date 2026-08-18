import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { authConfig } from "./auth.config";
import { verificarPassword } from "@/lib/password";
import { buscarParaLogin, registrarIngreso } from "@/lib/usuarios";

// Google queda opcional: solo se registra el provider si hay credenciales
// cargadas. Sin ellas, el panel entra únicamente por email + contraseña.
const googleId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID;
const googleSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
const conGoogle = Boolean(googleId && googleSecret);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credenciales",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(cred) {
        const email = typeof cred?.email === "string" ? cred.email : "";
        const password = typeof cred?.password === "string" ? cred.password : "";
        if (!email || !password) return null;

        const fila = await buscarParaLogin(email);

        // Se verifica la contraseña incluso cuando el usuario no existe o está
        // inactivo, contra un hash que nunca valida. Así el tiempo de respuesta
        // no delata qué emails están dados de alta.
        const hash = fila?.activo ? fila.password_hash : null;
        const ok = await verificarPassword(password, hash);
        if (!ok || !fila) return null;

        await registrarIngreso(fila.id);
        return { id: fila.id, email: fila.email, name: fila.nombre || fila.email, rol: fila.rol };
      },
    }),
    ...(conGoogle ? [Google({ clientId: googleId, clientSecret: googleSecret })] : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Gate único para los dos caminos: la tabla `usuarios` decide quién entra.
     * Credentials ya validó en authorize(); acá se cubre Google, que de otro
     * modo dejaría pasar a cualquiera con cuenta.
     */
    async signIn({ account, profile, user }) {
      if (account?.provider !== "google") return true;

      if (profile && (profile as { email_verified?: boolean }).email_verified === false) return false;

      const fila = await buscarParaLogin(profile?.email ?? user?.email ?? "");
      if (!fila || !fila.activo) return false;

      // El rol lo manda la base, no el proveedor.
      user.id = fila.id;
      user.rol = fila.rol;
      await registrarIngreso(fila.id);
      return true;
    },
  },
});
