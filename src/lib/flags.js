import bcrypt from "bcryptjs";

export async function hashFlag(flag) {
  const normalized = normalizeFlag(flag);
  return bcrypt.hash(normalized, 10);
}

export async function verifyFlag(flag, hash) {
  const normalized = normalizeFlag(flag);
  return bcrypt.compare(normalized, hash);
}

export function normalizeFlag(flag) {
  return flag.trim();
}
