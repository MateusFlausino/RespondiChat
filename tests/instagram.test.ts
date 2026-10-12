import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exchangeCode,
  graph,
  MetaError,
  privateReply,
  providerJson,
  singleObject,
  InstagramAuthorizationError,
  authorizationFailureReason,
} from "../src/lib/instagram";
test("diagnóstico da Meta retorna categorias fixas e nunca mensagens com segredos", () => {
  assert.equal(authorizationFailureReason({ error: { message: "Unsupported request - method type: get" } }), "unsupported_get_method");
  assert.equal(authorizationFailureReason({ error: { message: "Invalid client secret: private-secret" } }), "client_credentials");
  assert.equal(authorizationFailureReason({ error: { message: "Invalid OAuth access token: private-token" } }), "invalid_token");
  assert.equal(authorizationFailureReason({ error: { message: "Unsupported get request for private-id" } }), "unsupported_request");
  assert.equal(authorizationFailureReason({ error: { message: "private-secret private-token" } }), "unknown");
});
test("troca de token tenta POST uma vez para rejeições de GET com código 100", async () => {
  const original = globalThis.fetch;
  process.env.APP_URL = "https://example.com";
  process.env.INSTAGRAM_APP_ID = "123";
  process.env.INSTAGRAM_APP_SECRET = "secret";
  try {
    for (const rejectGet of [true, false]) {
      let exchangeCalls = 0;
      globalThis.fetch = async (input, options) => {
        const url = String(input);
        if (url.includes("api.instagram.com")) return Response.json({ access_token: "short", user_id: "123" });
        if (url.includes("/access_token")) {
          exchangeCalls++;
          if (options?.method !== "POST") return Response.json({ error: { code: 100, message: rejectGet ? "Unsupported request - method type: get" : "Unsupported get request. Object does not exist." } }, { status: 400 });
          assert.equal(String(input), "https://graph.instagram.com/access_token");
          const params = new URLSearchParams(String(options.body));
          assert.equal(params.get("grant_type"), "ig_exchange_token");
          assert.equal(params.get("access_token"), "short");
          assert.equal(params.get("client_secret"), "secret");
          return Response.json({ access_token: "long", expires_in: 5184000 });
        }
        return Response.json({ user_id: "123", username: "michellefmkt" });
      };
      assert.equal((await exchangeCode("code")).token, "long");
      assert.equal(exchangeCalls, 2);
    }
  } finally { globalThis.fetch = original; }
});
test("troca não repete falhas de credencial, permissão, servidor ou a rejeição do POST", async () => {
  const original = globalThis.fetch;
  process.env.APP_URL = "https://example.com";
  process.env.INSTAGRAM_APP_ID = "123";
  process.env.INSTAGRAM_APP_SECRET = "secret";
  try {
    for (const failure of [
      { code: 100, status: 400, message: "Invalid client secret", calls: 1 },
      { code: 10, status: 400, message: "Permission denied", calls: 1 },
      { code: 100, status: 503, message: "Unsupported get request", calls: 1 },
      { code: 100, status: 400, message: "Unsupported get request", calls: 2 },
    ]) {
      let calls = 0;
      globalThis.fetch = async (input) => {
        if (String(input).includes("api.instagram.com")) return Response.json({ access_token: "short", user_id: "123" });
        calls++;
        return Response.json({ error: { code: failure.code, message: failure.message } }, { status: failure.status });
      };
      await assert.rejects(() => exchangeCode("code"), InstagramAuthorizationError);
      assert.equal(calls, failure.calls);
    }
  } finally { globalThis.fetch = original; }
});
test("OAuth identifica a etapa e o código sem expor dados do provedor", async () => {
  const original = globalThis.fetch;
  process.env.APP_URL = "https://example.com";
  process.env.INSTAGRAM_APP_ID = "123";
  process.env.INSTAGRAM_APP_SECRET = "private-secret";
  try {
    for (const stage of ["short_token", "long_token", "profile"] as const) {
      globalThis.fetch = async (input) => {
        const url = String(input);
        const current = url.includes("api.instagram.com") ? "short_token" : url.includes("/access_token") ? "long_token" : "profile";
        if (current === stage) return Response.json({ error: { code: 190, message: "private-secret private-token" } }, { status: 400 });
        return Response.json(current === "short_token" ? { access_token: "private-token", user_id: "123" } : { access_token: "long", expires_in: 5184000 });
      };
      await assert.rejects(() => exchangeCode("private-auth-code"), (error) => error instanceof InstagramAuthorizationError && error.stage === stage && error.code === 190 && error.status === 400 && !error.message.includes("private"));
    }
  } finally { globalThis.fetch = original; }
});
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
