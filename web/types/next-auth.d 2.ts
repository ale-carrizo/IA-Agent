import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    rol?: "admin" | "usuario";
  }
  interface Session {
    user: {
      id: string;
      rol: "admin" | "usuario";
    } & DefaultSession["user"];
  }
}
