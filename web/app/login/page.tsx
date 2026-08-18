import { redirect } from "next/navigation";
import { auth } from "@/auth";
import LoginScreen from "./LoginScreen";

export const metadata = { title: "Ingresar · IA-AGENT" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (session?.user) redirect(sp.callbackUrl || "/");
  // Google es opcional: si no hay credenciales cargadas, el botón ni aparece.
  const conGoogle = Boolean(
    (process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID) &&
    (process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET),
  );
  return <LoginScreen error={sp.error} callbackUrl={sp.callbackUrl || "/"} conGoogle={conGoogle} />;
}
