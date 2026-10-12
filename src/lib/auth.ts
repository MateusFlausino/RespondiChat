import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { equal, secret, sign, verify } from "./security";
export function appUrl(): string {
  const configured = process.env.APP_URL;
  if (!configured) throw new Error("Configure APP_URL com a URL do painel.");
  const url = new URL(configured);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new Error("APP_URL deve usar HTTPS em produção.");
  return url.origin;
}
export function demoEnabled(): boolean {
  return (
    process.env.DEMO_MODE === "true" && process.env.NODE_ENV === "development"
  );
}
export async function authenticated(): Promise<boolean> {
  if (!process.env.SESSION_SECRET) return false;
  const token = (await cookies()).get("respondi_session")?.value;
  const value = verify<{ exp: number; user: string; purpose: string }>(
    token,
    secret("SESSION_SECRET"),
  );
  return (
    !!value &&
    value.purpose === "session" &&
    value.user === (process.env.ADMIN_USERNAME || "admin")
  );
}
export async function requireAdmin(request?: Request): Promise<void> {
  if (!(await authenticated()))
    throw new HttpError(401, "Faça login para continuar.");
  if (
    request &&
    request.method !== "GET" &&
    request.headers.get("origin") !== appUrl()
  )
    throw new HttpError(403, "Origem da solicitação inválida.");
}
export async function createSession() {
  const value = sign(
    {
      purpose: "session",
      user: process.env.ADMIN_USERNAME || "admin",
      nonce: randomBytes(16).toString("hex"),
      exp: Date.now() + 12 * 3600_000,
    },
    secret("SESSION_SECRET"),
  );
  (await cookies()).set("respondi_session", value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 3600,
  });
}
export function cronAuthorized(request: Request): boolean {
  const key = process.env.CRON_SECRET;
  return (
    !!key &&
    key.length >= 32 &&
    equal(request.headers.get("authorization") ?? "", `Bearer ${key}`)
  );
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function apiError(error: unknown): Response {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  // Never return SQL diagnostics, provider payloads, or environment values.
  console.error(
    "RespondiChat request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    {
      error:
        "Não foi possível concluir. Verifique a configuração e tente novamente.",
    },
    { status: 500 },
  );
}
