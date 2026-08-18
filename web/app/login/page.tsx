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
  return <LoginScreen error={sp.error} callbackUrl={sp.callbackUrl || "/"} />;
}
