import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

function registryKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("SESSION_SECRET must have at least 32 characters");
  return createHash("sha256").update("duca-ctf:registry:v1\0").update(secret).digest();
}

export function encryptRegistryPassword(password, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", registryKey(secret), iv);
  cipher.setAAD(Buffer.from("duca-ctf:registry:v1"));
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptRegistryPassword(value, secret) {
  const [version, iv, tag, encrypted, extra] = String(value).split(".");
  if (version !== "v1" || !iv || !tag || !encrypted || extra !== undefined) throw new Error("Invalid registry credential encryption");
  const decipher = createDecipheriv("aes-256-gcm", registryKey(secret), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from("duca-ctf:registry:v1"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function hashTerminalSecret(secret) {
  return createHash("sha256").update(secret).digest("hex");
}

export function createTerminalToken() {
  const id = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  return { id, token: `${id}.${secret}`, tokenHash: hashTerminalSecret(secret) };
}

export function parseTerminalToken(token) {
  if (typeof token !== "string") return null;
  const match = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token);
  return match ? { id: match[1], secret: match[2] } : null;
}

export function verifyTerminalSecret(secret, tokenHash) {
  if (typeof tokenHash !== "string" || !/^[0-9a-f]{64}$/.test(tokenHash)) return false;
  return timingSafeEqual(Buffer.from(hashTerminalSecret(secret), "hex"), Buffer.from(tokenHash, "hex"));
}
