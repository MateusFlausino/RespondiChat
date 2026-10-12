import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { db } from "./db";
export function parseSignedRequest(
  value: string,
  key: string,
): { user_id: string } | null {
  const [signature, payload, extra] = value.split(".");
  if (!key || extra || !signature || !payload || value.length > 10_000)
    return null;
  const expected = createHmac("sha256", key).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      parsed.algorithm?.toUpperCase() !== "HMAC-SHA256" ||
      !/^\d+$/.test(String(parsed.user_id))
    )
      return null;
    return { user_id: String(parsed.user_id) };
  } catch {
    return null;
  }
}
export function platformSignedRequest(value: string) {
  return (
    parseSignedRequest(value, process.env.INSTAGRAM_APP_SECRET ?? "") ??
    parseSignedRequest(value, process.env.META_APP_SECRET ?? "")
  );
}
export async function deleteConnection(userId: string) {
  const matches = await db().query<{ id: string }>(
    "SELECT id FROM instagram_accounts WHERE id=$1 OR oauth_user_id=$1",
    [userId],
  );
  if (matches.rows.length) {
    await db().query("UPDATE automations SET active=false");
    await db().query("DELETE FROM instagram_accounts WHERE id=$1", [
      matches.rows[0].id,
    ]);
  }
  const code = randomUUID();
  await db().query("INSERT INTO deletion_receipts(id) VALUES($1)", [code]);
  return code;
}
