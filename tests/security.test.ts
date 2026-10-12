import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, scryptSync } from "node:crypto";
import {
  encrypt,
  decrypt,
  sign,
  verify,
  validWebhook,
  validInstagramWebhook,
  verifyPassword,
} from "../src/lib/security";
import { parseSignedRequest } from "../src/lib/deletion";
test("sessões assinadas rejeitam adulteração e expiração", () => {
  const key = randomBytes(32).toString("hex");
  const token = sign({ user: "admin", exp: Date.now() + 1000 }, key);
  assert.equal(
    verify<{ user: string; exp: number }>(token, key)?.user,
    "admin",
  );
  assert.equal(verify(token + "x", key), null);
  assert.equal(verify(token, "other"), null);
  assert.equal(verify(sign({ exp: Date.now() - 1 }, key), key), null);
});
test("AES-GCM protege o token e detecta adulteração", () => {
  const key = randomBytes(32).toString("hex");
  const token = "secret-instagram-token";
  const encrypted = encrypt(token, key);
  assert.equal(encrypted.includes(token), false);
  assert.equal(decrypt(encrypted, key), token);
  assert.throws(() => decrypt(encrypted, randomBytes(32).toString("hex")));
  assert.notEqual(encrypt(token, key), encrypted);
});
test("webhooks validam o corpo bruto e nunca aceitam assinatura ausente", () => {
  const body = '{"object":"instagram"}';
  const key = "app-secret";
  const signature = `sha256=${createHmac("sha256", key).update(body).digest("hex")}`;
  assert.equal(validWebhook(body, signature, key), true);
  assert.equal(validWebhook(body + " ", signature, key), false);
  assert.equal(validWebhook(body, null, key), false);
  assert.equal(validWebhook(body, signature, ""), false);
});
test("Instagram aceita as duas chaves configuradas e rejeita assinaturas inválidas", () => {
  const body = '{"object":"instagram"}';
  const secrets = { instagram: "instagram-product-secret", meta: "meta-root-secret" };
  const signature = (key: string) => `sha256=${createHmac("sha256", key).update(body).digest("hex")}`;
  for (const key of Object.values(secrets)) {
    assert.equal(validInstagramWebhook(body, signature(key), secrets), true);
    assert.equal(validInstagramWebhook(body + " ", signature(key), secrets), false);
  }
  assert.equal(validInstagramWebhook(body, signature(secrets.instagram), { instagram: secrets.instagram }), true);
  assert.equal(validInstagramWebhook(body, signature("unrelated-app"), secrets), false);
  assert.equal(validInstagramWebhook(body, null, secrets), false);
  assert.equal(validInstagramWebhook(body, "sha256=invalid", secrets), false);
  assert.equal(validInstagramWebhook(body, signature(secrets.meta), {}), false);
});
test("a senha usa scrypt e rejeita hashes inválidos", () => {
  const salt = randomBytes(16).toString("hex");
  const hash = `scrypt:${salt}:${scryptSync("correct-password", salt, 64).toString("hex")}`;
  assert.equal(verifyPassword("correct-password", hash), true);
  assert.equal(verifyPassword("wrong", hash), false);
  assert.equal(verifyPassword("wrong", "malformed"), false);
});
test("exclusão de dados só aceita solicitações assinadas pela Meta", () => {
  const key = "secret";
  const body = Buffer.from(
    JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "12345" }),
  ).toString("base64url");
  const sig = createHmac("sha256", key).update(body).digest("base64url");
  assert.equal(parseSignedRequest(`${sig}.${body}`, key)?.user_id, "12345");
  assert.equal(parseSignedRequest(`${sig}.${body}`, "wrong"), null);
  assert.equal(parseSignedRequest(`${sig}.${body}x`, key), null);
});
