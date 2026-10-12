import { createHash } from "node:crypto";
import { equal, verifyPassword } from "./security";

export type PanelUser = { username: string; passwordHash: string };
export function panelUsers(env: Record<string, string | undefined> = process.env): PanelUser[] {
  const users: PanelUser[] = [];
  if (env.ADMIN_PASSWORD_HASH)
    users.push({ username: env.ADMIN_USERNAME || "admin", passwordHash: env.ADMIN_PASSWORD_HASH });
  if (env.MICHELLE_PASSWORD_HASH && !users.some((user) => user.username === "michelle"))
    users.push({ username: "michelle", passwordHash: env.MICHELLE_PASSWORD_HASH });
  return users;
}
export function credentialVersion(user: PanelUser): string {
  return createHash("sha256").update(user.passwordHash).digest("hex");
}
export function matchPanelUser(username: string, password: string, users = panelUsers()): PanelUser | null {
  // Verify all configured hashes, even when the supplied username is unknown.
  let match: PanelUser | null = null;
  for (const user of users) {
    const validPassword = verifyPassword(password, user.passwordHash);
    if (equal(username, user.username) && validPassword) match = user;
  }
  return match;
}
export function validSessionUser(value: { user: string; purpose: string; credentialVersion?: string }, users = panelUsers()): boolean {
  const user = users.find((entry) => entry.username === value.user);
  return !!user && value.purpose === "session" &&
    typeof value.credentialVersion === "string" && equal(value.credentialVersion, credentialVersion(user));
}
