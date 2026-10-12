import { cronAuthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/security";
import { processQueue } from "@/lib/worker";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!cronAuthorized(request))
    return new Response("Forbidden", { status: 403 });
  try {
    const accounts = await db().query<{
      id: string;
      encrypted_token: string;
    }>(`SELECT id,encrypted_token FROM instagram_accounts
      WHERE expires_at>now() AND expires_at<now()+interval '10 days' AND connected_at<now()-interval '1 day'`);
    for (const account of accounts.rows) {
      try {
        const url = new URL("https://graph.instagram.com/refresh_access_token");
        url.search = new URLSearchParams({
          grant_type: "ig_refresh_token",
          access_token: decrypt(account.encrypted_token),
        }).toString();
        const response = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        const value = (await response.json()) as {
          access_token?: string;
          expires_in?: number;
        };
        if (response.ok && value.access_token && value.expires_in)
          await db().query(
            "UPDATE instagram_accounts SET encrypted_token=$2,expires_at=$3 WHERE id=$1",
            [
              account.id,
              encrypt(value.access_token),
              new Date(Date.now() + value.expires_in * 1000),
            ],
          );
      } catch {
        console.error("Token renewal failed");
      }
    }
    await db().query(
      "DELETE FROM deliveries WHERE created_at<now()-interval '30 days' AND status NOT IN ('queued','sending')",
    );
    await db().query(
      "DELETE FROM rate_buckets WHERE bucket<now()-interval '2 days'",
    );
    await db().query(
      "DELETE FROM login_attempts WHERE window_start<now()-interval '1 day'",
    );
    await db().query(
      "DELETE FROM deletion_receipts WHERE completed_at<now()-interval '30 days'",
    );
    return Response.json(
      await processQueue(undefined, undefined, undefined, 30_000),
    );
  } catch {
    console.error("Scheduled maintenance failed");
    return new Response("Failed", { status: 503 });
  }
}
