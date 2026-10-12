import { z } from "zod";
import type { Automation, CommentEvent, Product } from "./types";

const safeUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }, "Use um link http ou https sem credenciais.");
export const productSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  url: safeUrl,
  price: z.string().trim().max(40).default(""),
  category: z.string().trim().max(60).default(""),
  emoji: z.string().max(12).default("🛍️"),
});
export const automationSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  mediaId: z
    .string()
    .regex(/^\d{5,40}$/, "Selecione um post sincronizado do Instagram."),
  postUrl: safeUrl.refine((value) => {
    const url = new URL(value);
    return (
      ["instagram.com", "www.instagram.com"].includes(url.hostname) &&
      /^\/(p|reel)\//.test(url.pathname)
    );
  }, "Use o link de um post ou Reel do Instagram."),
  postLabel: z.string().trim().min(1).max(180),
  keywords: z.array(z.string().trim().min(1).max(60)).min(1).max(15),
  matchMode: z.enum(["word", "exact"]),
  message: z.string().trim().min(1).max(850),
  productIds: z
    .array(z.string().uuid())
    .max(10)
    .refine((ids) => new Set(ids).size === ids.length),
  active: z.boolean(),
});
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
export function matches(
  text: string,
  keywords: string[],
  mode: Automation["matchMode"],
): boolean {
  const value = normalize(text);
  return keywords.some((keyword) => {
    const key = normalize(keyword);
    return (
      key.length > 0 &&
      (mode === "exact" ? value === key : ` ${value} `.includes(` ${key} `))
    );
  });
}
export function renderMessage(
  template: string,
  username: string,
  products: Product[],
): string {
  const links = products
    .map(
      (product) =>
        `${product.name}${product.price ? ` • ${product.price}` : ""}\n${product.url}`,
    )
    .join("\n\n");
  const message = template
    .replaceAll("{{nome}}", username || "😊")
    .replaceAll("{{produtos}}", links);
  return products.length && !template.includes("{{produtos}}")
    ? `${message}\n\n${links}`
    : message;
}
export function withinReplyWindow(date: Date, now = new Date()): boolean {
  const age = now.getTime() - date.getTime();
  return (
    Number.isFinite(age) && age >= -60_000 && age < 7 * 24 * 60 * 60 * 1000
  );
}
const webhookSchema = z.object({
  object: z.literal("instagram"),
  entry: z
    .array(
      z.object({
        id: z.string(),
        time: z.number().optional(),
        changes: z
          .array(z.object({ field: z.string(), value: z.unknown() }))
          .optional(),
      }),
    )
    .max(100),
});
const commentSchema = z.object({
  id: z.string().regex(/^\d+$/),
  text: z.string().max(5000),
  from: z.object({
    id: z.string().regex(/^\d+$/),
    username: z.string().max(120).optional(),
  }),
  media: z.object({
    id: z.string().regex(/^\d+$/),
    media_product_type: z.string().optional(),
  }),
  timestamp: z.union([z.string(), z.number()]).optional(),
});
export function extractComments(
  input: unknown,
  receivedAt = new Date(),
): CommentEvent[] {
  const payload = webhookSchema.safeParse(input);
  if (!payload.success) return [];
  const events: CommentEvent[] = [];
  for (const entry of payload.data.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const parsed = commentSchema.safeParse(change.value);
      if (!parsed.success || parsed.data.media.media_product_type === "LIVE")
        continue;
      const value = parsed.data;
      const stamp = value.timestamp ?? entry.time;
      let date = receivedAt;
      if (stamp !== undefined) {
        date =
          typeof stamp === "number" || /^\d+$/.test(stamp)
            ? new Date(Number(stamp) * (Number(stamp) < 1e12 ? 1000 : 1))
            : new Date(stamp);
      }
      events.push({
        accountId: entry.id,
        commentId: value.id,
        mediaId: value.media.id,
        senderId: value.from.id,
        username: value.from.username ?? "",
        text: value.text,
        occurredAt: date,
      });
    }
  }
  return events;
}
