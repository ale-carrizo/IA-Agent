import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Allowlist de acceso (fail-closed). Configurable por entorno:
//   ALLOWED_EMAIL_DOMAIN=gruponods.com        -> permite cualquier @gruponods.com
//   ALLOWED_EMAILS=juan@x.com,ana@y.com       -> además, mails sueltos
// Si NADA está configurado, NO se permite el ingreso a nadie.
const allowedDomain = (process.env.ALLOWED_EMAIL_DOMAIN || "").trim().toLowerCase();
const allowedEmails = (process.env.ALLOWED_EMAILS || "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

function emailPermitido(email: string | null | undefined): boolean {
  const e = (email || "").toLowerCase();
  if (!e) return false;
  if (!allowedDomain && allowedEmails.length === 0) return false; // fail-closed
  if (allowedEmails.includes(e)) return true;
  if (allowedDomain && e.endsWith("@" + allowedDomain)) return true;
  return false;
}

// Acepta los nombres de Auth.js (AUTH_GOOGLE_*) o los clásicos de Google (GOOGLE_CLIENT_*).
const googleId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID;
const googleSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({ clientId: googleId, clientSecret: googleSecret })],
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8 horas
  trustHost: true,
  callbacks: {
    // Gate de OAuth: solo entra quien pase la allowlist y tenga el mail verificado por Google.
    signIn({ profile, user }) {
      const email = profile?.email ?? user?.email;
      if (profile && (profile as { email_verified?: boolean }).email_verified === false) return false;
      return emailPermitido(email);
    },
    // Usado por el middleware para proteger todas las rutas.
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
});
