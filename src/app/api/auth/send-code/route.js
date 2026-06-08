import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  checkOtpRateLimit,
  createLoginCode,
  generateOtp,
} from "@/lib/auth";
import { sendLoginCode } from "@/lib/mail";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";

export async function POST(request) {
  try {
    const { email } = await request.json();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!checkOtpRateLimit(normalizedEmail)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait 15 minutes." },
        { status: 429 }
      );
    }

    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    const isNew = !user;

    if (!user) {
      user = await prisma.user.create({
        data: { email: normalizedEmail },
      });
      await logActivity({
        userId: user.id,
        ip,
        userAgent,
        action: TELEMETRY_ACTIONS.REGISTER,
        metadata: { email: normalizedEmail },
      });
    }

    if (user.disabled) {
      return NextResponse.json(
        { error: "This account has been disabled." },
        { status: 403 }
      );
    }

    const code = generateOtp();
    await createLoginCode(user.id, code);
    await sendLoginCode(normalizedEmail, code);

    await logActivity({
      userId: user.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.LOGIN_CODE_SENT,
      metadata: { email: normalizedEmail },
    });

    return NextResponse.json({
      success: true,
      message: "Login code sent to your email.",
      isNew,
    });
  } catch (err) {
    console.error("Send code error:", err);
    return NextResponse.json({ error: "Failed to send login code" }, { status: 500 });
  }
}
