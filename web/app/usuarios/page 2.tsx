import { redirect } from "next/navigation";
import { auth } from "@/auth";
import UsuariosClient from "./UsuariosClient";

export const metadata = { title: "Usuarios · IA-AGENT" };

export default async function UsuariosPage() {
  const session = await auth();
  // El middleware ya garantiza sesión; acá se filtra por rol.
  if (session?.user?.rol !== "admin") redirect("/");
  return <UsuariosClient miId={session.user.id} />;
}
