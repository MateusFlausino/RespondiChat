import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exchangeCode,
  graph,
  MetaError,
  privateReply,
  providerJson,
  singleObject,
} from "../src/lib/instagram";
test("respostas preservam identificadores numéricos grandes", () => {
  const value = providerJson(
    '{"user_id":17841400000000001,"expires_in":5184000}',
  ) as { user_id: string; expires_in: number };
  assert.equal(value.user_id, "17841400000000001");
  assert.equal(value.expires_in, 5184000);
  assert.equal(
    singleObject<{ access_token: string }>({ data: [{ access_token: "one" }] })
      .access_token,
    "one",
  );
  assert.throws(() => singleObject({ data: [{}, {}] }));
});
test("OAuth aceita resposta plana ou envelopada e guarda ID para desautorização", async () => {
  const original = globalThis.fetch;
  process.env.APP_URL = "https://example.com";
  process.env.INSTAGRAM_APP_ID = "123";
  process.env.INSTAGRAM_APP_SECRET = "secret";
  try {
    for (const wrapped of [false, true]) {
      const calls: { url: string; options?: RequestInit }[] = [];
      globalThis.fetch = async (input, options) => {
        const url = String(input);
        calls.push({ url, options });
        if (url.includes("api.instagram.com"))
          return Response.json(
            wrapped
              ? {
                  data: [
                    { access_token: "short", user_id: "17841400000000001" },
                  ],
                }
              : { access_token: "short", user_id: "17841400000000001" },
          );
        if (url.includes("/access_token"))
          return Response.json({ access_token: "long", expires_in: 5184000 });
        return Response.json({
          user_id: "17841400000000001",
          username: "michellefmkt",
        });
      };
      const result = await exchangeCode("auth-code");
      assert.equal(result.accountId, "17841400000000001");
      assert.equal(result.oauthUserId, result.accountId);
      assert.equal(result.token, "long");
      assert.equal(calls.length, 3);
      assert.ok(
        String(calls[0].options?.body).includes(
          "redirect_uri=https%3A%2F%2Fexample.com%2Fapi%2Finstagram%2Fcallback",
        ),
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});
test("a resposta privada endereça o comentário, não uma DM arbitrária", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (input, options) => {
      assert.ok(String(input).endsWith("/123/messages"));
      assert.equal(options?.method, "POST");
      assert.deepEqual(JSON.parse(String(options?.body)), {
        recipient: { comment_id: "456" },
        message: { text: "Oi!" },
      });
      assert.equal(
        new Headers(options?.headers).get("authorization"),
        "Bearer token",
      );
      return Response.json({ message_id: "meta-message" });
    };
    assert.equal(
      await privateReply("123", "456", "Oi!", "token"),
      "meta-message",
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("erros do provedor não expõem o token; respostas 5xx são ambíguas", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json(
        { error: { code: 2, message: "sensitive-provider-details" } },
        { status: 503 },
      );
    await assert.rejects(
      () => graph("123/messages", "secret-token", { method: "POST" }),
      (error) =>
        error instanceof MetaError &&
        error.ambiguous &&
        !error.message.includes("sensitive"),
    );
  } finally {
    globalThis.fetch = original;
  }
});
