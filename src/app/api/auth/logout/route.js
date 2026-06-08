import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";

export async function POST(request) {
  const user = await getCurrentUser();
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  if (user) {
    await logActivity({
      userId: user.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.LOGOUT,
    });
  }

  await destroySession();
  return NextResponse.redirect(new URL("/", request.url));
}
