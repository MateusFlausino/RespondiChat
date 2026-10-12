import { after } from "next/server";
import { equal, validInstagramWebhook } from "@/lib/security";
import { extractComments } from "@/lib/domain";
import { enqueueComment } from "@/lib/repository";
import { processQueue } from "@/lib/worker";
import { providerJson } from "@/lib/instagram";
import { profileDatabases } from "@/lib/db";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (
    !expected ||
    query.get("hub.mode") !== "subscribe" ||
    !equal(query.get("hub.verify_token") ?? "", expected)
  )
    return new Response("Forbidden", { status: 403 });
  const challenge = query.get("hub.challenge");
  return challenge
    ? new Response(challenge, { headers: { "Content-Type": "text/plain" } })
    : new Response("Bad request", { status: 400 });
}
export async function POST(request: Request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 1_000_000)
    return new Response("Payload too large", { status: 413 });
  if (
    !validInstagramWebhook(
      raw,
      request.headers.get("x-hub-signature-256"),
      {
        instagram: process.env.INSTAGRAM_APP_SECRET,
        meta: process.env.META_APP_SECRET,
      },
    )
  )
    return new Response("Forbidden", { status: 403 });
  let payload: unknown;
  try {
    payload = providerJson(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  try {
    // Persist before acknowledgment. A failed DB write returns 503 so Meta can redeliver.
    const databases = profileDatabases();
    for (const event of extractComments(payload)) {
      for (const database of databases) await enqueueComment(event, database);
    }
    after(async () => {
      try {
        await Promise.all(databases.map((database) => processQueue(database)));
      } catch {
        console.error("Webhook queue processing failed");
      }
    });
    return Response.json({ received: true });
  } catch {
    console.error("Webhook persistence failed");
    return new Response("Try again", { status: 503 });
  }
}
