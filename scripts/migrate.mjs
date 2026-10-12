import { readFile } from "node:fs/promises";
import pg from "pg";
if (!process.env.DATABASE_URL)
  throw new Error("Configure DATABASE_URL em .env.local ou no ambiente.");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(
    await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"),
  );
  await client.query("COMMIT");
  console.log("Migração concluída.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Falha na migração:", error.code ?? "conexão/esquema");
  process.exitCode = 1;
} finally {
  await client.end();
}
