import test from "node:test";
import assert from "node:assert/strict";
import { createTerminalToken, decryptRegistryPassword, encryptRegistryPassword, parseTerminalToken, verifyTerminalSecret } from "../src/lib/hosting/secrets.mjs";
import { normalizeRegistryServer } from "../src/lib/hosting/control-plane.mjs";

const secret = "test-hosting-session-secret-longer-than-32-characters";

test("registry secrets use authenticated encryption and distinct nonces", () => {
  const first = encryptRegistryPassword("registry-password", secret);
  const second = encryptRegistryPassword("registry-password", secret);
  assert.notEqual(first, second);
  assert.equal(decryptRegistryPassword(first, secret), "registry-password");
  assert.ok(!first.includes("registry-password"));
  assert.throws(() => decryptRegistryPassword(first, `${secret}-wrong`));
  const parts = first.split(".");
  parts[2] = `${parts[2][0] === "a" ? "b" : "a"}${parts[2].slice(1)}`;
  assert.throws(() => decryptRegistryPassword(parts.join("."), secret));
});

test("terminal credentials store only a secret hash and have strict token parsing", () => {
  const ticket = createTerminalToken();
  const parsed = parseTerminalToken(ticket.token);
  assert.equal(parsed.id, ticket.id);
  assert.equal(verifyTerminalSecret(parsed.secret, ticket.tokenHash), true);
  assert.equal(verifyTerminalSecret(`${parsed.secret}x`, ticket.tokenHash), false);
  assert.ok(!ticket.tokenHash.includes(parsed.secret));
  assert.equal(parseTerminalToken("bad.token"), null);
  assert.equal(parseTerminalToken(`${ticket.token}.extra`), null);
});

test("registry servers normalize Docker Hub and reject URLs with credentials or paths", () => {
  assert.equal(normalizeRegistryServer("https://index.docker.io/v1/"), "docker.io");
  assert.equal(normalizeRegistryServer("ghcr.io"), "ghcr.io");
  assert.equal(normalizeRegistryServer("registry.example.test:5000"), "registry.example.test:5000");
  assert.throws(() => normalizeRegistryServer("https://user:password@example.test"), { status: 400 });
  assert.throws(() => normalizeRegistryServer("example.test/repository"), { status: 400 });
});
