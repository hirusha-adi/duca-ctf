import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PortabilityError } from "@/lib/portability-schema.mjs";
import { portabilityAdmin, logPortability } from "@/lib/portability-http";

export async function GET(request, { params }) {
  return portabilityAdmin(request, async () => {
    const { id } = await params;
    const entry = await prisma.challengeBankEntry.findUnique({ where: { id } });
    if (!entry) throw new PortabilityError("Challenge bank entry not found", 404);
    return NextResponse.json({ entry }, { headers: { "Cache-Control": "private, no-store" } });
  });
}

export async function DELETE(request, { params }) {
  return portabilityAdmin(request, async (admin) => {
    const { id } = await params;
    await prisma.challengeBankEntry.delete({ where: { id } });
    await logPortability(request, admin, "delete_challenge_bank_entry", { entryId: id });
    return NextResponse.json({ success: true });
  });
}
