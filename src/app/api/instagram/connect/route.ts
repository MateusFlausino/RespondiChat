import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { apiError, appUrl, requireUser } from "@/lib/auth";
import { authorizationUrl } from "@/lib/instagram";
import { secret, sign } from "@/lib/security";
export async function GET() {
  try {
    await requireUser();
    const state = randomBytes(32).toString("hex");
    (await cookies()).set(
      "respondi_oauth",
      sign(
        { state, purpose: "oauth", exp: Date.now() + 10 * 60_000 },
        secret("SESSION_SECRET"),
      ),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      },
    );
    return Response.redirect(authorizationUrl(state), 302);
  } catch (error) {
    if ((error as { status?: number }).status === 401)
      return Response.redirect(`${appUrl()}/login`, 302);
    return apiError(error);
  }
}
