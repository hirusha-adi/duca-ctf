import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";

export async function POST(request) {
  try {
    const user = await requireAuth();
    const { name, studentId } = await request.json();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name.trim(),
        studentId: studentId?.trim() || null,
        profileComplete: true,
      },
    });

    await logActivity({
      userId: user.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.PROFILE_COMPLETED,
      metadata: { hasStudentId: !!studentId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
