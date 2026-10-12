import { z } from "zod";
import { after } from "next/server";
import { apiError, appUrl, HttpError, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  automationSchema,
  matches,
  productSchema,
  renderMessage,
} from "@/lib/domain";
import { readDashboard, saveAutomation, saveProduct } from "@/lib/repository";
import { decrypt } from "@/lib/security";
import { graph, mediaPage } from "@/lib/instagram";
import { processQueue } from "@/lib/worker";
import type { Product } from "@/lib/types";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ resource: string }> };
export async function GET(request: Request, context: Context) {
  try {
    await requireAdmin();
    const { resource } = await context.params;
    if (resource !== "dashboard")
      throw new HttpError(404, "Recurso não encontrado.");
    const data = await readDashboard();
    return Response.json(
      {
        ...data,
        config: {
          database: !!process.env.DATABASE_URL,
          instagram:
            !!process.env.INSTAGRAM_APP_ID &&
            !!process.env.INSTAGRAM_APP_SECRET &&
            /^[a-f0-9]{64}$/i.test(process.env.TOKEN_ENCRYPTION_KEY ?? ""),
          webhook:
            !!process.env.META_WEBHOOK_VERIFY_TOKEN &&
            !!process.env.META_APP_SECRET,
          appUrl: appUrl(),
          demo: false,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    await requireAdmin(request);
    const { resource } = await context.params;
    if (resource === "queue") {
      after(async () => {
        try {
          await processQueue();
        } catch {
          console.error("Queue processing failed");
        }
      });
      return Response.json({ ok: true });
    }
    if (resource === "disconnect") {
      const accounts = await db().query<{
        id: string;
        encrypted_token: string;
      }>("SELECT id,encrypted_token FROM instagram_accounts LIMIT 1");
      const account = accounts.rows[0];
      if (account) {
        // Local disconnection succeeds even if the provider is unreachable.
        await graph(
          `${account.id}/permissions`,
          decrypt(account.encrypted_token),
          { method: "DELETE" },
        ).catch(() => {});
        await db().query("UPDATE automations SET active=false");
        await db().query("DELETE FROM instagram_accounts WHERE id=$1", [
          account.id,
        ]);
      }
      return Response.json({ ok: true });
    }
    const body = await request.json();
    if (resource === "products") {
      const result = productSchema.safeParse(body);
      if (!result.success)
        throw new HttpError(400, result.error.issues[0].message);
      return Response.json({ id: await saveProduct(result.data) });
    }
    if (resource === "automations") {
      const result = automationSchema.safeParse(body);
      if (!result.success)
        throw new HttpError(400, result.error.issues[0].message);
      return Response.json({ id: await saveAutomation(result.data) });
    }
    if (resource === "simulate") {
      const parsed = z
        .object({
          id: z.string().uuid(),
          comment: z.string().max(5000),
          username: z.string().max(30).default("visitante"),
        })
        .safeParse(body);
      if (!parsed.success)
        throw new HttpError(400, "Dados de teste inválidos.");
      const data = await readDashboard();
      const rule = data.automations.find((rule) => rule.id === parsed.data.id);
      if (!rule) throw new HttpError(404, "Automação não encontrada.");
      return Response.json({
        matches: matches(parsed.data.comment, rule.keywords, rule.matchMode),
        message: renderMessage(
          rule.message,
          parsed.data.username,
          rule.productIds
            .map((id) => data.products.find((p) => p.id === id))
            .filter((p): p is Product => !!p),
        ),
        simulated: true,
      });
    }
    if (resource === "media") {
      const parsed = z
        .object({ cursor: z.string().max(2000).optional() })
        .safeParse(body);
      if (!parsed.success) throw new HttpError(400, "Cursor inválido.");
      const accounts = await db().query<{
        id: string;
        encrypted_token: string;
        expires_at: Date;
      }>(
        "SELECT id,encrypted_token,expires_at FROM instagram_accounts LIMIT 1",
      );
      const account = accounts.rows[0];
      if (!account || new Date(account.expires_at).getTime() <= Date.now())
        throw new HttpError(400, "Conecte o Instagram primeiro.");
      const result = await mediaPage(
        account.id,
        decrypt(account.encrypted_token),
        parsed.data.cursor,
      );
      for (const media of result.data) {
        await db().query(
          `INSERT INTO instagram_media(id,account_id,caption,permalink,media_type,thumbnail_url,published_at)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET caption=$3,permalink=$4,media_type=$5,thumbnail_url=$6,published_at=$7,synced_at=now()`,
          [
            media.id,
            account.id,
            media.caption ?? "",
            media.permalink,
            media.media_type,
            media.thumbnail_url ??
              (media.media_type === "IMAGE" ? media.media_url : null),
            media.timestamp,
          ],
        );
      }
      const stored = await db().query(
        'SELECT id,caption,permalink,media_type AS "mediaType",thumbnail_url AS "thumbnailUrl",published_at AS "publishedAt" FROM instagram_media WHERE account_id=$1 ORDER BY published_at DESC LIMIT 500',
        [account.id],
      );
      return Response.json({
        media: stored.rows,
        cursor: result.paging?.next ? result.paging.cursors?.after : null,
      });
    }
    throw new HttpError(404, "Recurso não encontrado.");
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    await requireAdmin(request);
    const { resource } = await context.params;
    const parsed = z
      .object({ id: z.string().uuid() })
      .safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Identificador inválido.");
    if (resource === "products") {
      const used = await db().query(
        "SELECT id FROM automations WHERE product_ids @> $1::jsonb",
        [JSON.stringify([parsed.data.id])],
      );
      if (used.rows.length)
        throw new HttpError(
          409,
          "Remova o produto das automações antes de excluí-lo.",
        );
      await db().query("DELETE FROM products WHERE id=$1", [parsed.data.id]);
    } else if (resource === "automations") {
      await db().query("DELETE FROM automations WHERE id=$1", [parsed.data.id]);
    } else throw new HttpError(404, "Recurso não encontrado.");
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
