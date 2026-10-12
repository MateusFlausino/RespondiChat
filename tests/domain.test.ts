import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractComments,
  matches,
  renderMessage,
  withinReplyWindow,
  productSchema,
} from "../src/lib/domain";
test("palavras ignoram acentos e caixa, respeitando limites de palavras", () => {
  assert.equal(matches("Eu QUÉRO o link! 😍", ["quero"], "word"), true);
  assert.equal(matches("quero!!!", ["QUERO"], "exact"), true);
  assert.equal(matches("eu quero", ["quero"], "exact"), false);
  assert.equal(matches("linkado", ["link"], "word"), false);
  assert.equal(matches("", ["🔥"], "word"), false);
  assert.equal(
    matches("manda o link por favor", ["manda o link"], "word"),
    true,
  );
});
test("cada post recebe seus produtos na ordem selecionada", () => {
  const result = renderMessage("Oi, {{nome}}!\n{{produtos}}", "ana", [
    {
      id: "1",
      name: "Bolsa",
      url: "https://example.com/bolsa",
      price: "R$ 10",
      category: "",
      emoji: "👜",
    },
  ]);
  assert.equal(result, "Oi, ana!\nBolsa • R$ 10\nhttps://example.com/bolsa");
  assert.equal(renderMessage("Oi!", "ana", []), "Oi!");
  assert.ok(
    renderMessage("Oi!", "ana", [
      {
        id: "1",
        name: "Bolsa",
        url: "https://example.com/bolsa",
        price: "",
        category: "",
        emoji: "👜",
      },
    ]).includes("\n\nBolsa"),
  );
});
test("links rejeitam protocolos executáveis e credenciais", () => {
  const product = { name: "Teste", url: "javascript:alert(1)" };
  assert.equal(productSchema.safeParse(product).success, false);
  assert.equal(
    productSchema.safeParse({
      ...product,
      url: "https://admin:pass@example.com",
    }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({ ...product, url: "https://example.com" }).success,
    true,
  );
});
test("comentários usam a data do evento e ignoram payloads de live ou malformados", () => {
  const now = Date.now();
  const value = {
    id: "1234",
    text: "quero",
    from: { id: "333", username: "ana" },
    media: { id: "111" },
  };
  const events = extractComments({
    object: "instagram",
    entry: [
      {
        id: "222",
        time: Math.floor(now / 1000),
        changes: [
          { field: "comments", value },
          { field: "messages", value },
        ],
      },
    ],
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].mediaId, "111");
  assert.ok(Math.abs(events[0].occurredAt.getTime() - now) < 1000);
  assert.equal(
    extractComments({
      object: "instagram",
      entry: [
        {
          id: "222",
          changes: [
            {
              field: "comments",
              value: {
                ...value,
                media: { id: "111", media_product_type: "LIVE" },
              },
            },
          ],
        },
      ],
    }).length,
    0,
  );
  assert.equal(extractComments({ entry: [] }).length, 0);
  assert.equal(withinReplyWindow(new Date(now - 8 * 86400_000)), false);
  assert.equal(withinReplyWindow(new Date("invalid")), false);
  assert.equal(withinReplyWindow(new Date(now + 120_000)), false);
});
