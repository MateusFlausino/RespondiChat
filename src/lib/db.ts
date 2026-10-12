import { Pool } from "pg";
export type Db = {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};
const globalDb = globalThis as unknown as { respondiPool?: Pool };
export function db(): Db {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "Banco não configurado. Defina DATABASE_URL e execute a migração.",
    );
  if (!globalDb.respondiPool)
    globalDb.respondiPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 15_000,
      connectionTimeoutMillis: 10_000,
    });
  return globalDb.respondiPool as unknown as Db;
}
