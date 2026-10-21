import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { saveSupportUpload } from "@/lib/support-upload";
import { createSupportUploadToken } from "@/lib/support-upload-claims.mjs";

export async function POST(request) {
  try {
    const user = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file");
    const attachment = await saveSupportUpload(file);

    return NextResponse.json({
      ...attachment,
      uploadToken: createSupportUploadToken(user.id, attachment.url, process.env.SESSION_SECRET),
    });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_FILE") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (err.message === "INVALID_TYPE") {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }
    if (err.message === "FILE_TOO_LARGE") {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }
    console.error("Support upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
