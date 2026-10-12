import { appUrl } from "./auth";
export const scopes = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
];
export function graphBase() {
  const version = process.env.META_GRAPH_VERSION ?? "v25.0";
  if (!/^v\d+\.0$/.test(version))
    throw new Error("META_GRAPH_VERSION inválida.");
  return `https://graph.instagram.com/${version}`;
}
export function callbackUrl() {
  return `${appUrl()}/api/instagram/callback`;
}
export function authorizationUrl(state: string) {
  if (!process.env.INSTAGRAM_APP_ID)
    throw new Error("Configure INSTAGRAM_APP_ID.");
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.search = new URLSearchParams({
    enable_fb_login: "0",
    force_authentication: "1",
    client_id: process.env.INSTAGRAM_APP_ID,
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope: scopes.join(","),
    state,
  }).toString();
  return url.toString();
}
export class MetaError extends Error {
  constructor(
    public code: number,
    public status: number,
    public ambiguous = false,
  ) {
    super(`Meta retornou código ${code} (HTTP ${status}).`);
  }
}
export class InstagramAuthorizationError extends Error {
  constructor(public stage: "short_token" | "long_token" | "profile", public code: number, public status: number, public reason = "unknown") {
    super(`Instagram authorization failed at ${stage} (HTTP ${status}, code ${code}).`);
  }
}
export function authorizationFailureReason(value: unknown): string {
  if (!value || typeof value !== "object") return "unknown";
  const data = value as { error?: { message?: unknown }; error_message?: unknown };
  const raw = data.error?.message ?? data.error_message;
  if (typeof raw !== "string") return "unknown";
  // Match only fixed categories. Never return or log the provider's message.
  if (/client.?secret|app.?secret|invalid client|client id/i.test(raw)) return "client_credentials";
  if (/invalid.*access token|cannot parse.*access token|malformed.*token|invalid oauth access token/i.test(raw)) return "invalid_token";
  if (/expired|session has been invalidated/i.test(raw)) return "expired_token";
  if (/different app|another app|app.*mismatch|does not match.*app/i.test(raw)) return "app_mismatch";
  if (/permission|insufficient.*role|not authorized/i.test(raw)) return "permissions";
  if (/grant.type|missing.*parameter|required.*parameter/i.test(raw)) return "request_parameters";
  if (/unsupported request\s*-\s*method type:\s*get|method\s+get\s+(?:is\s+)?not supported/i.test(raw)) return "unsupported_get_method";
  if (/unsupported.*request|unsupported.*get/i.test(raw)) return "unsupported_request";
  return "unknown";
}
export function providerJson(text: string): unknown {
  // Preserve large numeric identifiers, which cannot safely pass through a JS Number.
  const parse = JSON.parse as (
    text: string,
    reviver: (
      key: string,
      value: unknown,
      context?: { source?: string },
    ) => unknown,
  ) => unknown;
  return parse(text, (key, value, context) => {
    if (
      ["id", "user_id", "message_id", "recipient_id"].includes(key) &&
      typeof value === "number"
    ) {
      if (context?.source && /^\d+$/.test(context.source))
        return context.source;
      if (!Number.isSafeInteger(value))
        throw new Error(
          "Identificador numérico não pode ser lido com segurança.",
        );
      return String(value);
    }
    return value;
  });
}
export function singleObject<T>(value: T | { data: T[] }): T {
  if (value && typeof value === "object" && "data" in value) {
    const list = (value as { data: T[] }).data;
    if (!Array.isArray(list) || list.length !== 1 || "access_token" in value)
      throw new Error("Resposta de autorização ambígua.");
    return list[0];
  }
  return value as T;
}
export async function graph<T>(
  path: string,
  token: string,
  options: {
    method?: string;
    body?: object;
    params?: Record<string, string>;
  } = {},
): Promise<T> {
  const url = new URL(`${graphBase()}/${path}`);
  if (options.params)
    url.search = new URLSearchParams(options.params).toString();
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new MetaError(0, 0, true);
  }
  let result: { error?: { code: number } };
  try {
    result = providerJson(await response.text()) as typeof result;
  } catch {
    throw new MetaError(0, response.status, true);
  }
  if (!response.ok || result.error)
    throw new MetaError(
      result.error?.code ?? 0,
      response.status,
      response.status >= 500,
    );
  return result as T;
}
export async function exchangeCode(
  code: string,
): Promise<{
  token: string;
  expiresIn: number;
  accountId: string;
  oauthUserId: string;
  username: string;
}> {
  const id = process.env.INSTAGRAM_APP_ID;
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!id || !secret)
    throw new Error("Credenciais do Instagram não configuradas.");
  const response = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl(),
      code,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  type Short = { access_token?: string; user_id?: string };
  const short = singleObject<Short>(
    providerJson(await response.text()) as Short | { data: Short[] },
  );
  if (!response.ok || !short.access_token) {
    const failure = short as Short & { code?: number; error?: { code?: number } };
    throw new InstagramAuthorizationError("short_token", Number(failure.error?.code ?? failure.code) || 0, response.status, authorizationFailureReason(short));
  }
  const url = new URL("https://graph.instagram.com/access_token");
  url.search = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: secret,
    access_token: short.access_token,
  }).toString();
  let longResponse = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  type LongToken = {
    access_token?: string;
    expires_in?: number;
    error?: { code?: number };
  };
  let long = (await longResponse.json()) as LongToken;
  // Meta can reject GET with either an explicit method error or generic code
  // 100. Retry this definitive 400 once with the same token and credentials.
  // Credential, permission and transient failures must not trigger this retry.
  const exchangeReason = authorizationFailureReason(long);
  if (longResponse.status === 400 && long.error?.code === 100 &&
      ["unsupported_get_method", "unsupported_request"].includes(exchangeReason)) {
    longResponse = await fetch("https://graph.instagram.com/access_token", {
      method: "POST",
      body: new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: secret, access_token: short.access_token }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    long = (await longResponse.json()) as LongToken;
  }
  if (!longResponse.ok || !long.access_token || !long.expires_in)
    throw new InstagramAuthorizationError("long_token", Number(long.error?.code) || 0, longResponse.status, authorizationFailureReason(long));
  type Profile = { id?: string; user_id: string; username: string };
  const profile = singleObject<Profile>(
    await graph<Profile | { data: Profile[] }>("me", long.access_token, {
      params: { fields: "user_id,username" },
    }).catch((error: unknown) => {
      throw new InstagramAuthorizationError("profile", error instanceof MetaError ? error.code : 0, error instanceof MetaError ? error.status : 0);
    }),
  );
  const accountId = String(profile.user_id ?? profile.id ?? "");
  if (!/^\d+$/.test(accountId) || !profile.username)
    throw new Error("Perfil inválido.");
  return {
    token: long.access_token,
    expiresIn: long.expires_in,
    accountId,
    oauthUserId: short.user_id ?? accountId,
    username: profile.username,
  };
}
export async function subscribe(
  accountId: string,
  token: string,
): Promise<void> {
  const result = await graph<{ success: boolean }>(
    `${accountId}/subscribed_apps`,
    token,
    { method: "POST", params: { subscribed_fields: "comments" } },
  );
  if (!result.success)
    throw new Error("Não foi possível ativar os eventos de comentários.");
}
export type InstagramMedia = {
  id: string;
  caption?: string;
  media_type: string;
  permalink: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
};
export async function mediaPage(
  accountId: string,
  token: string,
  after?: string,
) {
  return graph<{
    data: InstagramMedia[];
    paging?: { cursors?: { after?: string }; next?: string };
  }>(`${accountId}/media`, token, {
    params: {
      fields:
        "id,caption,media_type,permalink,media_url,thumbnail_url,timestamp",
      limit: "50",
      ...(after ? { after } : {}),
    },
  });
}
export async function privateReply(
  accountId: string,
  commentId: string,
  text: string,
  token: string,
): Promise<string> {
  const result = await graph<{ message_id?: string }>(
    `${accountId}/messages`,
    token,
    {
      method: "POST",
      body: { recipient: { comment_id: commentId }, message: { text } },
    },
  );
  if (!result.message_id) throw new MetaError(0, 200, true);
  return result.message_id;
}
