import type { NextAuthConfig } from "next-auth";

/**
 * Config que SÍ puede correr en el edge: sin `pg`, sin node:crypto, sin tocar
 * la base. El middleware la usa para validar el JWT en cada request.
 *
 * Lo que necesita la base (verificar contraseña, buscar el usuario) vive en
 * auth.ts, que solo se carga en el route handler de /api/auth (runtime Node).
 */
export const authConfig = {
  providers: [],
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8 horas
  trustHost: true,
  callbacks: {
    // El middleware protege todas las rutas del matcher con esto.
    authorized({ auth }) {
      return !!auth?.user;
    },
    // El rol viaja en el token para que el middleware y las páginas no tengan
    // que ir a la base en cada request.
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.rol = (user as { rol?: string }).rol ?? "usuario";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? "";
        session.user.rol = (token.rol as "admin" | "usuario") ?? "usuario";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
