import { test } from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { credentialVersion, matchPanelUser, panelUsers, validSessionUser } from "../src/lib/panel-users";
function hash(password: string, salt = "a".repeat(32)) {
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
const users = panelUsers({ ADMIN_PASSWORD_HASH: hash("admin-test-password"), MICHELLE_PASSWORD_HASH: hash("michelle-test-password") });
test("Mateus usa senha própria sem compartilhar o acesso da Michelle", () => {
  const allUsers = panelUsers({ ADMIN_PASSWORD_HASH: users[0].passwordHash, MICHELLE_PASSWORD_HASH: users[1].passwordHash, MATEUS_PASSWORD_HASH: hash("mateus-test-password") });
  assert.equal(matchPanelUser("mateus", "mateus-test-password", allUsers)?.username, "mateus");
  assert.equal(matchPanelUser("mateus", "michelle-test-password", allUsers), null);
  assert.equal(matchPanelUser("michelle", "mateus-test-password", allUsers), null);
  const user = allUsers.find((entry) => entry.username === "mateus")!;
  assert.equal(validSessionUser({ user: "mateus", purpose: "session", credentialVersion: credentialVersion(user) }, users), false);
});
test("Michelle entra com sua própria senha e nunca com a senha do admin", () => {
  assert.equal(matchPanelUser("michelle", "michelle-test-password", users)?.username, "michelle");
  assert.equal(matchPanelUser("admin", "admin-test-password", users)?.username, "admin");
  assert.equal(matchPanelUser("michelle", "admin-test-password", users), null);
  assert.equal(matchPanelUser("admin", "michelle-test-password", users), null);
  assert.equal(matchPanelUser("unknown", "michelle-test-password", users), null);
});
test("desativar o acesso ou mudar a senha invalida a sessão da Michelle", () => {
  const owner = users.find((user) => user.username === "michelle")!;
  const session = { user: owner.username, purpose: "session", credentialVersion: credentialVersion(owner) };
  assert.equal(validSessionUser(session, users), true);
  assert.equal(validSessionUser(session, [users[0]]), false);
  assert.equal(validSessionUser(session, [{ ...owner, passwordHash: hash("new-password") }]), false);
  assert.equal(validSessionUser({ ...session, purpose: "oauth" }, users), false);
  assert.equal(validSessionUser({ user: "michelle", purpose: "session" }, users), false);
});
test("o acesso da Michelle é opcional e não pode colidir com o admin", () => {
  assert.equal(panelUsers({}).length, 0);
  assert.deepEqual(panelUsers({ ADMIN_PASSWORD_HASH: "hash" }).map((user) => user.username), ["admin"]);
  assert.deepEqual(panelUsers({ ADMIN_USERNAME: "michelle", ADMIN_PASSWORD_HASH: "hash", MICHELLE_PASSWORD_HASH: "other" }).map((user) => user.username), ["michelle"]);
});
