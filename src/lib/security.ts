import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
export function secret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32)
    throw new Error(`Configure ${name} com pelo menos 32 caracteres.`);
  return value;
}
export function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function sign(value: object, key: string): string {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}
export function verify<T extends { exp: number }>(
  token: string | undefined,
  key: string,
): T | null {
  if (!token || token.length > 4096) return null;
  const [body, sig, extra] = token.split(".");
  if (
    extra ||
    !body ||
    !sig ||
    !equal(sig, createHmac("sha256", key).update(body).digest("base64url"))
  )
    return null;
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString()) as T;
    return Number.isFinite(value.exp) && value.exp > Date.now() ? value : null;
  } catch {
    return null;
  }
}
export function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, salt, hash, extra] = encoded.split(":");
  if (
    extra ||
    algorithm !== "scrypt" ||
    !/^[a-f0-9]{32}$/.test(salt ?? "") ||
    !/^[a-f0-9]{128}$/.test(hash ?? "")
  )
    return false;
  return equal(scryptSync(password, salt, 64).toString("hex"), hash);
}
export function encrypt(
  value: string,
  keyHex = process.env.TOKEN_ENCRYPTION_KEY ?? "",
): string {
  if (!/^[a-f0-9]{64}$/i.test(keyHex))
    throw new Error(
      "TOKEN_ENCRYPTION_KEY deve conter 64 caracteres hexadecimais.",
    );
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((buffer) => buffer.toString("base64url"))
    .join(".");
}
export function decrypt(
  value: string,
  keyHex = process.env.TOKEN_ENCRYPTION_KEY ?? "",
): string {
  if (!/^[a-f0-9]{64}$/i.test(keyHex))
    throw new Error("Chave de criptografia não configurada.");
  const [iv, tag, data] = value
    .split(".")
    .map((part) => Buffer.from(part, "base64url"));
  const cipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(keyHex, "hex"),
    iv,
  );
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}
export function validWebhook(
  raw: string,
  signature: string | null,
  appSecret: string,
): boolean {
  if (!appSecret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature))
    return false;
  return equal(
    signature,
    `sha256=${createHmac("sha256", appSecret).update(raw).digest("hex")}`,
  );
}
export function validInstagramWebhook(
  raw: string,
  signature: string | null,
  secrets: { instagram?: string; meta?: string },
): boolean {
  return [secrets.instagram, secrets.meta].some(
    (key) => Boolean(key) && validWebhook(raw, signature, key!),
  );
}
