import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { sessionOptions } from "./session";

export { sessionOptions };

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession(cookieStore, sessionOptions);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session.userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      studentId: true,
      role: true,
      disabled: true,
      profileComplete: true,
      createdAt: true,
    },
  });

  if (!user || user.disabled) {
    session.destroy();
    return null;
  }

  return user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export function loginPath(nextPath) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/login";
  }
  return `/login?${new URLSearchParams({ next: nextPath })}`;
}

export async function requirePageAuth(nextPath) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(loginPath(nextPath));
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createLoginCode(userId, code) {
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.loginCode.create({
    data: { userId, codeHash, expiresAt },
  });
}

export async function verifyLoginCode(userId, code) {
  const loginCode = await prisma.loginCode.findFirst({
    where: {
      userId,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!loginCode) return { success: false, reason: "expired" };
  if (loginCode.attempts >= 5) return { success: false, reason: "max_attempts" };

  const valid = await bcrypt.compare(code, loginCode.codeHash);

  if (!valid) {
    await prisma.loginCode.update({
      where: { id: loginCode.id },
      data: { attempts: { increment: 1 } },
    });
    return { success: false, reason: "invalid" };
  }

  await prisma.loginCode.update({
    where: { id: loginCode.id },
    data: { usedAt: new Date() },
  });

  return { success: true };
}

const otpRateLimit = new Map();

export function checkOtpRateLimit(email) {
  const now = Date.now();
  const key = email.toLowerCase();
  const entry = otpRateLimit.get(key) || { count: 0, resetAt: now + 15 * 60 * 1000 };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + 15 * 60 * 1000;
  }

  if (entry.count >= 3) {
    return false;
  }

  entry.count += 1;
  otpRateLimit.set(key, entry);
  return true;
}

export async function setSessionUser(userId) {
  const session = await getSession();
  session.userId = userId;
  await session.save();
}

export async function destroySession() {
  const session = await getSession();
  session.destroy();
}
