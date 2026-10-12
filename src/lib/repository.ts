import { randomUUID } from "node:crypto";
import { db, type Db } from "./db";
import { matches, renderMessage, withinReplyWindow } from "./domain";
import type { Automation, CommentEvent, DashboardData, Product } from "./types";
import { HttpError } from "./auth";

type RuleRow = {
  id: string;
  name: string;
  media_id: string;
  post_url: string;
  post_label: string;
  keywords: string[];
  match_mode: Automation["matchMode"];
  message: string;
  product_ids: string[];
  active: boolean;
  created_at: Date;
};
export function ruleFromRow(row: RuleRow): Automation {
  return {
    id: row.id,
    name: row.name,
    mediaId: row.media_id,
    postUrl: row.post_url,
    postLabel: row.post_label,
    keywords: row.keywords,
    matchMode: row.match_mode,
    message: row.message,
    productIds: row.product_ids,
    active: row.active,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
export async function readDashboard(
  database: Db = db(),
  expectedUsername = "michellefmkt",
): Promise<Omit<DashboardData, "config">> {
  const [products, rules, deliveries, account, totals, days] =
    await Promise.all([
      database.query<Product>(
        "SELECT id,name,url,price,category,emoji FROM products ORDER BY created_at DESC",
      ),
      database.query<RuleRow>(
        "SELECT * FROM automations ORDER BY created_at DESC",
      ),
      database.query<{
        id: string;
        automation_id: string;
        automation_name: string;
        username: string;
        status: DashboardData["deliveries"][number]["status"];
        message: string;
        error: string | null;
        created_at: Date;
      }>(
        "SELECT id,automation_id,automation_name,username,status,message,error,created_at FROM deliveries ORDER BY created_at DESC LIMIT 100",
      ),
      database.query<{
        username: string;
        expires_at: Date;
        subscribed: boolean;
      }>(
        "SELECT username,expires_at,subscribed FROM instagram_accounts LIMIT 1",
      ),
      database.query<{
        sent: string;
        queued: string;
        failed: string;
        uncertain: string;
      }>(`SELECT
      count(*) FILTER (WHERE status='sent') AS sent,
      count(*) FILTER (WHERE status IN ('queued','sending')) AS queued,
      count(*) FILTER (WHERE status='failed') AS failed,
      count(*) FILTER (WHERE status='uncertain') AS uncertain FROM deliveries WHERE created_at >= now()-interval '30 days'`),
      database.query<{
        day: string;
        sent: string;
      }>(`SELECT to_char((created_at AT TIME ZONE 'America/Sao_Paulo')::date,'YYYY-MM-DD') AS day,count(*) AS sent
      FROM deliveries WHERE status='sent' AND created_at >= now()-interval '7 days' GROUP BY 1 ORDER BY 1`),
    ]);
  const connected = account.rows[0];
  return {
    products: products.rows,
    automations: rules.rows.map(ruleFromRow),
    deliveries: deliveries.rows.map((row) => ({
      id: row.id,
      automationId: row.automation_id,
      automationName: row.automation_name,
      username: row.username,
      status: row.status,
      message: row.message,
      error: row.error,
      createdAt: new Date(row.created_at).toISOString(),
    })),
    account: {
      username:
        connected?.username ??
        expectedUsername,
      connected: !!connected,
      expiresAt: connected
        ? new Date(connected.expires_at).toISOString()
        : null,
      subscribed: connected?.subscribed ?? false,
    },
    totals: {
      sent: Number(totals.rows[0]?.sent ?? 0),
      queued: Number(totals.rows[0]?.queued ?? 0),
      failed: Number(totals.rows[0]?.failed ?? 0),
      uncertain: Number(totals.rows[0]?.uncertain ?? 0),
    },
    daily: days.rows.map((row) => ({ day: row.day, sent: Number(row.sent) })),
  };
}
export async function saveProduct(
  product: Omit<Product, "id"> & { id?: string },
  database: Db = db(),
) {
  const id = product.id ?? randomUUID();
  // Product links may make existing private replies too long; validate affected rules before saving.
  const related = await database.query<RuleRow>(
    "SELECT * FROM automations WHERE product_ids @> $1::jsonb",
    [JSON.stringify([id])],
  );
  const all = await database.query<Product>(
    "SELECT id,name,url,price,category,emoji FROM products",
  );
  const nextProducts = [
    ...all.rows.filter((p) => p.id !== id),
    { ...product, id },
  ];
  for (const row of related.rows) {
    const selected = row.product_ids
      .map((pid) => nextProducts.find((p) => p.id === pid))
      .filter((p): p is Product => !!p);
    if (renderMessage(row.message, "x".repeat(30), selected).length > 1000)
      throw new HttpError(
        400,
        `O link deixa a mensagem de “${row.name}” acima de 1.000 caracteres. Encurte a mensagem ou o link.`,
      );
  }
  await database.query(
    `INSERT INTO products(id,name,url,price,category,emoji) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(id) DO UPDATE SET name=$2,url=$3,price=$4,category=$5,emoji=$6`,
    [
      id,
      product.name,
      product.url,
      product.price,
      product.category,
      product.emoji,
    ],
  );
  return id;
}
export async function saveAutomation(
  rule: Omit<Automation, "id" | "createdAt"> & { id?: string },
  database: Db = db(),
) {
  const account = await database.query<{
    id: string;
    expires_at: Date;
    subscribed: boolean;
  }>("SELECT id,expires_at,subscribed FROM instagram_accounts LIMIT 1");
  const connected = account.rows[0];
  if (!connected)
    throw new HttpError(
      400,
      "Conecte o Instagram e sincronize os posts primeiro.",
    );
  const media = await database.query<{ permalink: string }>(
    "SELECT permalink FROM instagram_media WHERE id=$1 AND account_id=$2",
    [rule.mediaId, connected.id],
  );
  if (!media.rows.length)
    throw new HttpError(
      400,
      "O post precisa pertencer à conta conectada. Sincronize os posts novamente.",
    );
  if (
    rule.active &&
    (!connected.subscribed ||
      new Date(connected.expires_at).getTime() <= Date.now())
  )
    throw new HttpError(
      400,
      "Reconecte o Instagram antes de ativar a automação.",
    );
  const products = await database.query<Product>(
    "SELECT id,name,url,price,category,emoji FROM products WHERE id=ANY($1::uuid[])",
    [rule.productIds],
  );
  if (products.rows.length !== rule.productIds.length)
    throw new HttpError(
      400,
      "Um dos produtos foi removido. Selecione os produtos novamente.",
    );
  const ordered = rule.productIds.map(
    (id) => products.rows.find((p) => p.id === id)!,
  );
  if (renderMessage(rule.message, "x".repeat(30), ordered).length > 1000)
    throw new HttpError(
      400,
      "A mensagem com os links deve ter até 1.000 caracteres.",
    );
  const id = rule.id ?? randomUUID();
  try {
    await database.query(
      `INSERT INTO automations(id,name,media_id,post_url,post_label,keywords,match_mode,message,product_ids,active)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb,$10)
      ON CONFLICT(id) DO UPDATE SET name=$2,media_id=$3,post_url=$4,post_label=$5,keywords=$6::jsonb,match_mode=$7,message=$8,product_ids=$9::jsonb,active=$10`,
      [
        id,
        rule.name,
        rule.mediaId,
        media.rows[0].permalink,
        rule.postLabel,
        JSON.stringify(rule.keywords),
        rule.matchMode,
        rule.message,
        JSON.stringify(rule.productIds),
        rule.active,
      ],
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      throw new HttpError(
        409,
        "Já existe uma automação ativa para esse post. Pause a anterior primeiro.",
      );
    throw error;
  }
  return id;
}
export async function enqueueComment(
  event: CommentEvent,
  database: Db = db(),
): Promise<boolean> {
  if (
    !withinReplyWindow(event.occurredAt) ||
    event.accountId === event.senderId
  )
    return false;
  const account = await database.query(
    "SELECT id FROM instagram_accounts WHERE id=$1 AND subscribed=true AND expires_at>now()",
    [event.accountId],
  );
  if (!account.rows.length) return false;
  const rules = await database.query<RuleRow>(
    "SELECT * FROM automations WHERE media_id=$1 AND active=true",
    [event.mediaId],
  );
  const row = rules.rows.find((row) =>
    matches(event.text, row.keywords, row.match_mode),
  );
  if (!row) return false;
  const all = await database.query<Product>(
    "SELECT id,name,url,price,category,emoji FROM products WHERE id=ANY($1::uuid[])",
    [row.product_ids],
  );
  const products = row.product_ids
    .map((id) => all.rows.find((p) => p.id === id))
    .filter((p): p is Product => !!p);
  const message = renderMessage(row.message, event.username, products);
  const result = await database.query(
    `INSERT INTO deliveries(id,account_id,comment_id,sender_id,media_id,automation_id,automation_name,username,message,status,occurred_at,error)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(account_id,comment_id) DO NOTHING RETURNING id`,
    [
      randomUUID(),
      event.accountId,
      event.commentId,
      event.senderId,
      event.mediaId,
      row.id,
      row.name,
      event.username,
      message,
      message.length > 1000 ? "failed" : "queued",
      event.occurredAt,
      message.length > 1000 ? "Mensagem acima de 1.000 caracteres." : null,
    ],
  );
  await database.query(
    "UPDATE instagram_accounts SET last_webhook_at=now() WHERE id=$1",
    [event.accountId],
  );
  return result.rows.length > 0;
}
