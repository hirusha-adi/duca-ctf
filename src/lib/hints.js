import { prisma } from "./db";
import { sanitizeHtml } from "./sanitize";
import { isChallengeAvailable } from "./competitions";
import { getChallengePrerequisiteStatus } from "./challenge-access";
import { normalizeHints, challengeConfigurationError } from "./challenge-rules.mjs";
import { purchaseHintWithClient } from "./hint-purchase.mjs";

export async function validateChallengeHints(tx, challengeId, hints) {
  if (hints === undefined) return undefined;
  const normalized = normalizeHints(hints).map((hint) => ({ ...hint, content: hint.contentFormat === "RICHTEXT" ? sanitizeHtml(hint.content) : hint.content }));
  const ids = normalized.filter((hint) => hint.id).map((hint) => hint.id);
  const existing = ids.length ? await tx.hint.findMany({ where: { challengeId, id: { in: ids }, retired: false }, select: { id: true } }) : [];
  if (existing.length !== ids.length || (!challengeId && ids.length)) {
    throw challengeConfigurationError("A hint does not belong to this challenge.");
  }
  return normalized;
}

export async function syncChallengeHints(tx, challengeId, hints) {
  if (hints === undefined) return;
  const retainedIds = hints.filter((hint) => hint.id).map((hint) => hint.id);
  await tx.hint.updateMany({ where: { challengeId, retired: false, ...(retainedIds.length ? { id: { notIn: retainedIds } } : {}) }, data: { retired: true } });
  for (const hint of hints) {
    const { id, ...data } = hint;
    if (id) await tx.hint.update({ where: { id }, data });
    else await tx.hint.create({ data: { ...data, challengeId } });
  }
}

export function unlockHint(userId, challengeId, hintId, expectedCost) {
  return purchaseHintWithClient(prisma, { userId, challengeId, hintId, expectedCost }, { isChallengeAvailable, getChallengePrerequisiteStatus });
}
