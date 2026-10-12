import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { queryInSchema, type Db } from "../src/lib/db";
import { schemaSql } from "../src/lib/schema";
import { instagramForUser, schemaForUser } from "../src/lib/panel-users";
import { readDashboard, enqueueComment } from "../src/lib/repository";
import { processQueue } from "../src/lib/worker";

test("Mateus e Michelle têm produtos, posts, histórico e tokens separados", async () => {
  const memory = new PGlite();
  await memory.exec(schemaSql);
  await memory.exec(`CREATE SCHEMA mf_luminarias3d; SET search_path TO mf_luminarias3d; ${schemaSql} SET search_path TO public;`);
  // Model a single shared backend connection; transaction ownership is held until commit.
  let pending = Promise.resolve();
  function scoped(schema: "public" | "mf_luminarias3d"): Db {
    return { async query<T>(text: string, values?: unknown[]) {
      let release!: () => void;
      const previous = pending;
      pending = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try { return await queryInSchema(memory, schema, text, values) as { rows: T[] }; }
      finally { release(); }
    } };
  }
  const michelle = scoped("public"), mateus = scoped("mf_luminarias3d");
  const productId = "10000000-0000-4000-8000-000000000001";
  const ruleId = "20000000-0000-4000-8000-000000000001";
  try {
    for (const [database, account, username, product] of [[michelle,"22222","michellefmkt","Bolsa"],[mateus,"88888","mf.luminarias3d","Luminária"]] as const) {
      await database.query("INSERT INTO instagram_accounts(id,username,encrypted_token,expires_at,subscribed) VALUES($1,$2,$3,now()+interval '1 day',true)",[account,username,`token-${username}`]);
      await database.query("INSERT INTO products(id,name,url) VALUES($1,$2,'https://example.com/produto')",[productId,product]);
      await database.query("INSERT INTO automations(id,name,media_id,post_url,post_label,keywords,match_mode,message,product_ids,active) VALUES($1,$2,'44444','https://www.instagram.com/p/test/','Post','[\"link\"]','word','{{produtos}}',$3::jsonb,true)",[ruleId,product,JSON.stringify([productId])]);
    }
    const [left,right] = await Promise.all([readDashboard(michelle),readDashboard(mateus,"mf.luminarias3d")]);
    assert.equal(left.account.username,"michellefmkt");
    assert.equal(right.account.username,"mf.luminarias3d");
    assert.equal(left.products[0].name,"Bolsa");
    assert.equal(right.products[0].name,"Luminária");
    const event = { accountId:"88888",commentId:"33333",mediaId:"44444",senderId:"55555",username:"ana",text:"link",occurredAt:new Date() };
    assert.equal(await enqueueComment(event,michelle),false);
    assert.equal(await enqueueComment(event,mateus),true);
    await processQueue(mateus,async (account,comment,message,token) => {
      assert.equal(account,"88888"); assert.equal(comment,"33333");
      assert.ok(message.includes("Luminária")); assert.ok(!message.includes("Bolsa"));
      assert.equal(token,"token-mf.luminarias3d"); return "meta-message";
    },value=>value);
    assert.equal((await readDashboard(michelle)).deliveries.length,0);
    assert.equal((await readDashboard(mateus)).deliveries[0].status,"sent");
    await mateus.query("DELETE FROM products WHERE id=$1",[productId]);
    assert.equal((await readDashboard(michelle)).products.length,1);
    await assert.rejects(()=>mateus.query("SELECT * FROM missing_table"));
    assert.equal((await readDashboard(michelle)).account.username,"michellefmkt");
    await assert.rejects(()=>queryInSchema(memory,"public; DROP SCHEMA public" as "public","SELECT 1"));
  } finally { await memory.close(); }
});
test("cada login autoriza somente o seu perfil de Instagram",()=>{
  assert.equal(instagramForUser("mateus"),"mf.luminarias3d");
  assert.equal(instagramForUser("michelle"),"michellefmkt");
  assert.equal(schemaForUser("mateus"),"mf_luminarias3d");
  assert.equal(schemaForUser("michelle"),"public");
});
