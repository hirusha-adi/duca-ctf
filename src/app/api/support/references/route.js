import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fetchReferenceData } from "@/lib/support";

export async function GET() {
  try {
    await requireAuth();
    const data = await fetchReferenceData();
    return NextResponse.json(data);
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Support references error:", err);
    return NextResponse.json({ error: "Failed to load references" }, { status: 500 });
  }
}
