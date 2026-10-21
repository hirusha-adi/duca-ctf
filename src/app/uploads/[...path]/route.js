import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { getStoredUpload } from "@/lib/upload-storage.mjs";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { path: parts } = await params;
  const file = await getStoredUpload(parts);
  if (!file) return new NextResponse("Not found", { status: 404 });

  // Support attachments use the ticket's access policy, including direct URLs.
  if (parts[0] === "support") {
    const user = await getCurrentUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const url = `/uploads/${parts.join("/")}`;
    const message = await prisma.supportMessage.findFirst({
      where: {
        ...(user.role === "ADMIN" ? {} : { ticket: { userId: user.id } }),
        attachments: { array_contains: [{ url }] },
      },
      select: { id: true },
    });
    if (!message) return new NextResponse("Not found", { status: 404 });
  }

  const headers = {
    "Content-Type": file.contentType || "application/octet-stream",
    "Content-Length": String(file.size),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": parts[0] === "support" ? "private, no-store" : "public, max-age=31536000, immutable",
    "Content-Disposition": `${file.contentType?.startsWith("image/") ? "inline" : "attachment"}; filename="${parts[1]}"`,
  };
  return new NextResponse(await readFile(file.path), { headers });
}

export async function HEAD(request, context) {
  const response = await GET(request, context);
  return new NextResponse(null, { status: response.status, headers: response.headers });
}
