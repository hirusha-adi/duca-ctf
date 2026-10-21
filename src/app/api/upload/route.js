import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { storeUpload } from "@/lib/upload-storage.mjs";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const { url } = await storeUpload(file, {
      folder: "writeups", maxSize: 5 * 1024 * 1024, imagesOnly: true,
    });

    await logActivity({
      userId: admin.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.ADMIN_ACTION,
      metadata: { action: "upload_image", url },
    });

    return NextResponse.json({ url });
  } catch (err) {
    if (err.message === "INVALID_TYPE") {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }
    if (err.message === "FILE_TOO_LARGE") {
      return NextResponse.json({ error: "File must be between 1 byte and 5MB" }, { status: 400 });
    }
    if (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
