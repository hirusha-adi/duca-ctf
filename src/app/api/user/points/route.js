import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUserPointsSummary } from "@/lib/scoring";

export async function GET() {
  try {
    const user = await requireAuth();
    const summary = await getUserPointsSummary(user.id);
    return NextResponse.json(summary);
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load points" }, { status: 500 });
  }
}
