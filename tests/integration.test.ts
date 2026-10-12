import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/lib/db";
import { enqueueComment, saveAutomation } from "../src/lib/repository";
import { processQueue } from "../src/lib/worker";
import { MetaError } from "../src/lib/instagram";
import type { CommentEvent } from "../src/lib/types";
const database = new PGlite();
const db = database as unknown as Db;
const ruleId = "20000000-0000-4000-8000-000000000001";
const productId = "10000000-0000-4000-8000-000000000001";
const event: CommentEvent = {
  accountId: "22222",
  commentId: "33333",
  mediaId: "44444",
  senderId: "55555",
  username: "ana",
  text: "Quero o link",
  occurredAt: new Date(),
};
before(async () => {
  await database.exec(
    await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"),
  );
});
beforeEach(async () => {
  await database.exec(
    "TRUNCATE instagram_accounts,instagram_media,products,automations,deliveries,rate_buckets,login_attempts,deletion_receipts CASCADE",
  );
  await database.query(
    "INSERT INTO instagram_accounts(id,username,encrypted_token,expires_at,subscribed) VALUES('22222','michellefmkt','encrypted',now()+interval '1 day',true)",
  );
  await database.query(
    "INSERT INTO instagram_media(id,account_id,caption,permalink,media_type) VALUES('44444','22222','Post','https://www.instagram.com/reel/test/','VIDEO')",
  );
  await database.query(
    "INSERT INTO products(id,name,url,price,category,emoji) VALUES($1,'Bolsa','https://example.com/bolsa','R$ 10','Moda','👜')",
    [productId],
  );
  await database.query(
    `INSERT INTO automations(id,name,media_id,post_url,post_label,keywords,match_mode,message,product_ids,active)
    VALUES($1,'Post certo','44444','https://www.instagram.com/reel/test/','Post','["quero","link"]','word','Oi, {{nome}}! {{produtos}}',$2::jsonb,true)`,
    [ruleId, JSON.stringify([productId])],
  );
});
after(async () => {
  await database.close();
});
async function status() {
  return (
    await database.query<{ status: string; attempts: number; error: string }>(
      "SELECT status,attempts,error FROM deliveries LIMIT 1",
    )
  ).rows[0];
}
test("evento repetido gera uma única mensagem com os produtos do post", async () => {
  assert.equal(await enqueueComment(event, db), true);
  assert.equal(await enqueueComment(event, db), false);
  let calls = 0;
  await processQueue(
    db,
    async (account, comment, message, token) => {
      calls++;
      assert.equal(account, "22222");
      assert.equal(comment, "33333");
      assert.equal(token, "clear-token");
      assert.ok(message.includes("Bolsa • R$ 10"));
      return "meta-1";
    },
    () => "clear-token",
  );
  await processQueue(
    db,
    async () => {
      calls++;
      return "unexpected";
    },
    () => "clear-token",
  );
  assert.equal(calls, 1);
  assert.equal((await status()).status, "sent");
});
test("outro post, outra conta, autor e palavra incompatível não disparam", async () => {
  for (const override of [
    { mediaId: "99999" },
    { accountId: "99999" },
    { senderId: event.accountId },
    { text: "bonito" },
    { occurredAt: new Date(Date.now() - 8 * 86400_000) },
  ])
    assert.equal(await enqueueComment({ ...event, ...override }, db), false);
  assert.equal(
    (await database.query("SELECT id FROM deliveries")).rows.length,
    0,
  );
});
test("processadores concorrentes não reivindicam a mesma mensagem", async () => {
  await enqueueComment(event, db);
  let calls = 0;
  const send = async () => {
    calls++;
    return "meta";
  };
  await Promise.all([
    processQueue(db, send, () => "token"),
    processQueue(db, send, () => "token"),
  ]);
  assert.equal(calls, 1);
});
test("timeout ou resultado ambíguo não provoca reenvio automático", async () => {
  await enqueueComment(event, db);
  let calls = 0;
  await processQueue(
    db,
    async () => {
      calls++;
      throw new MetaError(0, 0, true);
    },
    () => "token",
  );
  assert.equal((await status()).status, "uncertain");
  await processQueue(
    db,
    async () => {
      calls++;
      return "meta";
    },
    () => "token",
  );
  assert.equal(calls, 1);
});
test("limite confirmado da Meta volta à fila; erro de permissão falha", async () => {
  await enqueueComment(event, db);
  await processQueue(
    db,
    async () => {
      throw new MetaError(4, 429);
    },
    () => "token",
  );
  assert.equal((await status()).status, "queued");
  await database.query("UPDATE deliveries SET next_attempt_at=now()");
  await processQueue(
    db,
    async () => {
      throw new MetaError(190, 400);
    },
    () => "token",
  );
  assert.equal((await status()).status, "failed");
});
test("fila respeita pausa da automação e validade do token", async () => {
  await enqueueComment(event, db);
  await database.query("UPDATE automations SET active=false");
  let calls = 0;
  await processQueue(
    db,
    async () => {
      calls++;
      return "meta";
    },
    () => "token",
  );
  assert.equal(calls, 0);
  assert.equal((await status()).status, "skipped");
  await database.query("UPDATE deliveries SET status='queued';");
  await database.query("UPDATE automations SET active=true");
  await database.query(
    "UPDATE instagram_accounts SET expires_at=now()-interval '1 hour'",
  );
  await processQueue(
    db,
    async () => {
      calls++;
      return "meta";
    },
    () => "token",
  );
  assert.equal(calls, 0);
  assert.equal((await status()).status, "failed");
});
test("quota local adia mensagem sem enviá-la", async () => {
  await enqueueComment(event, db);
  await database.query(
    "INSERT INTO rate_buckets(account_id,bucket,used) VALUES('22222',date_trunc('hour',now()),200)",
  );
  let calls = 0;
  await processQueue(
    db,
    async () => {
      calls++;
      return "meta";
    },
    () => "token",
  );
  assert.equal(calls, 0);
  assert.equal((await status()).status, "queued");
});
test("worker interrompido é marcado para revisão, sem reenvio", async () => {
  await enqueueComment(event, db);
  await database.query(
    "UPDATE deliveries SET status='sending',updated_at=now()-interval '10 minutes'",
  );
  let calls = 0;
  await processQueue(
    db,
    async () => {
      calls++;
      return "meta";
    },
    () => "token",
  );
  assert.equal(calls, 0);
  assert.equal((await status()).status, "uncertain");
});
test("configuração não permite post de outra conta ou duas regras ativas no mesmo post", async () => {
  const rule = {
    name: "Nova",
    mediaId: "44444",
    postUrl: "https://www.instagram.com/reel/test/",
    postLabel: "Post",
    keywords: ["quero"],
    matchMode: "word" as const,
    message: "Oi!",
    productIds: [productId],
    active: true,
  };
  await assert.rejects(
    () => saveAutomation({ ...rule, mediaId: "99999" }, db),
    /pertencer à conta/,
  );
  await assert.rejects(() => saveAutomation(rule, db), /Já existe/);
  await database.query("UPDATE automations SET active=false");
  assert.ok(await saveAutomation(rule, db));
});
