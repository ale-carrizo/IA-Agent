import { Pool } from "pg";

// Pool único reutilizado entre requests (evita agotar conexiones en dev con hot-reload)
const globalForPg = globalThis as unknown as { _pgPool?: Pool };

export const db =
  globalForPg._pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") globalForPg._pgPool = db;
