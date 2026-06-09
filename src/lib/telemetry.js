import { prisma } from "./db";

export async function logActivity({
  userId = null,
  ip,
  userAgent = "",
  action,
  metadata = {},
}) {
  try {
    await prisma.activityLog.create({
      data: {
        userId,
        ip: ip || "unknown",
        userAgent: userAgent || "",
        action,
        metadata,
      },
    });
  } catch (err) {
    console.error("Failed to log activity:", err);
  }
}

export function getClientIpFromHeaders(headerStore) {
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = headerStore.get("x-real-ip");
  if (realIp) return realIp.trim();

  const cfConnectingIp = headerStore.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();

  return "127.0.0.1";
}

export function getClientIp(request) {
  return getClientIpFromHeaders(request.headers);
}

export function getUserAgent(request) {
  return request.headers.get("user-agent") || "";
}
