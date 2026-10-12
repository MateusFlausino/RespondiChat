import { Pool } from "pg";
import { schemaForUser } from "./panel-users";
import { schemaSql } from "./schema";
export type Db = {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};
const globalDb = globalThis as unknown as { respondiDatabases?: Map<string, Db> };
export function db(schema: "public" | "mf_luminarias3d" = "public"): Db {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "Banco não configurado. Defina DATABASE_URL e execute a migração.",
    );
  if (schema !== "public" && schema !== "mf_luminarias3d") throw new Error("Perfil inválido.");
  globalDb.respondiDatabases ??= new Map();
  const existing = globalDb.respondiDatabases.get(schema);
  if (existing) return existing;
  const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 15_000,
      connectionTimeoutMillis: 10_000,
    });
  let initializing: Promise<void> | undefined;
  async function initialize() {
    if (schema === "public") return;
    if (!initializing) initializing = (async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('respondichat_mf_schema'))");
        await client.query("CREATE SCHEMA IF NOT EXISTS mf_luminarias3d");
        await client.query("SET LOCAL search_path TO mf_luminarias3d");
        await client.query(schemaSql);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    })().catch((error) => { initializing = undefined; throw error; });
    await initializing;
  }
  const database: Db = {
    async query<T>(text: string, values?: unknown[]) {
      await initialize();
      const client = await pool.connect();
      try {
        return await queryInSchema(client, schema, text, values) as unknown as { rows: T[]; rowCount: number | null };
      } finally { client.release(); }
    },
  };
  globalDb.respondiDatabases.set(schema, database);
  return database;
}
type QueryClient = { query(text: string, values?: unknown[]): Promise<unknown> };
export async function queryInSchema(client: QueryClient, schema: "public" | "mf_luminarias3d", text: string, values?: unknown[]) {
  if (schema !== "public" && schema !== "mf_luminarias3d") throw new Error("Perfil inválido.");
  await client.query("BEGIN");
  try {
    // SET LOCAL stays inside this transaction, including with Neon transaction pooling.
    await client.query(`SET LOCAL search_path TO ${schema}`);
    const result = await client.query(text, values);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
export function dbForUser(username: string): Db { return db(schemaForUser(username)); }
export function profileDatabases(): Db[] {
  return process.env.MATEUS_PASSWORD_HASH ? [db(), db("mf_luminarias3d")] : [db()];
}
