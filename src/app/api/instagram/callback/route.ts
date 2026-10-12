import { cookies } from "next/headers";
import { appUrl, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { exchangeCode, subscribe, InstagramAuthorizationError, MetaError } from "@/lib/instagram";
import { encrypt, equal, secret, verify } from "@/lib/security";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const origin = appUrl();
  const jar = await cookies();
  const token = jar.get("respondi_oauth")?.value;
  jar.delete("respondi_oauth");
  let stage = "session";
  try {
    await requireUser();
    const url = new URL(request.url);
    const state = verify<{ state: string; purpose: string; exp: number }>(
      token,
      secret("SESSION_SECRET"),
    );
    if (
      !state ||
      state.purpose !== "oauth" ||
      !equal(state.state, url.searchParams.get("state") ?? "")
    )
      return Response.redirect(`${origin}/?connection=invalid_state`, 302);
    if (url.searchParams.has("error"))
      return Response.redirect(`${origin}/?connection=denied`, 302);
    const code = url.searchParams.get("code");
    if (!code)
      return Response.redirect(`${origin}/?connection=missing_code`, 302);
    stage = "exchange";
    const profile = await exchangeCode(code.replace(/#_$/, ""));
    const allowed = (process.env.ALLOWED_INSTAGRAM_USERNAME ?? "michellefmkt")
      .replace(/^@/, "")
      .toLowerCase();
    if (profile.username.toLowerCase() !== allowed)
      return Response.redirect(`${origin}/?connection=wrong_profile`, 302);
    stage = "save_account";
    const existing = await db().query<{ id: string }>(
      "SELECT id FROM instagram_accounts LIMIT 1",
    );
    if (existing.rows[0] && existing.rows[0].id !== profile.accountId)
      return Response.redirect(`${origin}/?connection=disconnect_first`, 302);
    const encrypted = encrypt(profile.token);
    await db().query(
      `INSERT INTO instagram_accounts(id,username,encrypted_token,expires_at,subscribed,oauth_user_id)
      VALUES($1,$2,$3,$4,false,$5) ON CONFLICT(id) DO UPDATE SET username=$2,encrypted_token=$3,expires_at=$4,subscribed=false,oauth_user_id=$5,connected_at=now()`,
      [
        profile.accountId,
        profile.username,
        encrypted,
        new Date(Date.now() + profile.expiresIn * 1000),
        profile.oauthUserId,
      ],
    );
    stage = "subscribe";
    await subscribe(profile.accountId, profile.token);
    stage = "save_subscription";
    await db().query(
      "UPDATE instagram_accounts SET subscribed=true WHERE id=$1",
      [profile.accountId],
    );
    return Response.redirect(`${origin}/?connection=success`, 302);
  } catch (error) {
    if (error instanceof InstagramAuthorizationError) stage = error.stage;
    // Log only fixed stage names and numeric codes; never provider bodies, URLs, codes or tokens.
    const provider = error instanceof InstagramAuthorizationError || error instanceof MetaError ? error : null;
    console.error("Instagram authorization failed", {
      stage,
      providerCode: provider?.code ?? 0,
      providerStatus: provider?.status ?? 0,
    });
    const target = new URL(origin);
    target.searchParams.set("connection", "failed");
    target.searchParams.set("stage", stage);
    return Response.redirect(target, 302);
  }
}
