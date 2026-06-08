import { SUPPORT_MESSAGE_COOLDOWN_MS } from "./support-constants";

export async function getSupportMessageCooldownRemaining(prisma, userId) {
  const lastMessage = await prisma.supportMessage.findFirst({
    where: { authorId: userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (!lastMessage) return 0;

  const elapsed = Date.now() - lastMessage.createdAt.getTime();
  return Math.max(0, SUPPORT_MESSAGE_COOLDOWN_MS - elapsed);
}
