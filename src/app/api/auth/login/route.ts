import { z } from "zod";
import { appUrl, apiError, createSession, HttpError } from "@/lib/auth";
import { db } from "@/lib/db";
import { equal, secret, verifyPassword } from "@/lib/security";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== appUrl())
      throw new HttpError(403, "Origem inválida.");
    secret("SESSION_SECRET");
    if (!process.env.ADMIN_PASSWORD_HASH || !process.env.DATABASE_URL)
      throw new HttpError(
        503,
        "Configure o banco e o acesso do administrador antes de entrar.",
      );
    const parsed = z
      .object({ username: z.string().max(120), password: z.string().max(1024) })
      .safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Dados de acesso inválidos.");
    const attempts = await db().query<{
      attempts: number;
    }>(`INSERT INTO login_attempts(key,window_start,attempts) VALUES('admin',now(),1)
      ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END,
      window_start=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE login_attempts.window_start END RETURNING attempts`);
    if (attempts.rows[0].attempts > 10)
      throw new HttpError(429, "Muitas tentativas. Aguarde 15 minutos.");
    // Always perform password verification, including for an incorrect username.
    const validPassword = verifyPassword(
      parsed.data.password,
      process.env.ADMIN_PASSWORD_HASH,
    );
    const validUser = equal(
      parsed.data.username,
      process.env.ADMIN_USERNAME || "admin",
    );
    if (!validPassword || !validUser)
      throw new HttpError(401, "Usuário ou senha incorretos.");
    await createSession();
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
