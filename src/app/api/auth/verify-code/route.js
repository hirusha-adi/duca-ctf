import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyLoginCode, setSessionUser } from "@/lib/auth";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";

export async function POST(request) {
  try {
    const { email, code } = await request.json();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    if (!email || !code) {
      return NextResponse.json({ error: "Email and code required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (user.disabled) {
      return NextResponse.json({ error: "Account disabled" }, { status: 403 });
    }

    const result = await verifyLoginCode(user.id, String(code).trim());

    if (!result.success) {
      await logActivity({
        userId: user.id,
        ip,
        userAgent,
        action: TELEMETRY_ACTIONS.LOGIN_FAILED,
        metadata: { reason: result.reason },
      });

      const messages = {
        expired: "Code expired. Please request a new one.",
        max_attempts: "Too many attempts. Please request a new code.",
        invalid: "Invalid code.",
      };

      return NextResponse.json(
        { error: messages[result.reason] || "Invalid code" },
        { status: 401 }
      );
    }

    await setSessionUser(user.id);

    await logActivity({
      userId: user.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.LOGIN_SUCCESS,
    });

    return NextResponse.json({
      success: true,
      profileComplete: user.profileComplete,
    });
  } catch (err) {
    console.error("Verify code error:", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
