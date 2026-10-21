export function challengeConfigurationError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function normalizePrerequisiteIds(value) {
  if (!Array.isArray(value) || value.length > 50 || value.some((id) => typeof id !== "string" || !id.trim())) {
    throw challengeConfigurationError("Choose up to 50 valid prerequisite challenges.");
  }
  return [...new Set(value.map((id) => id.trim()))];
}

export function getPrerequisiteProgress(requiredIds, solvedIds) {
  const solved = requiredIds.filter((id) => solvedIds.has(id)).length;
  return { total: requiredIds.length, solved, unlocked: solved === requiredIds.length };
}

// An edge points from a challenge to the challenge it requires.
export function wouldCreatePrerequisiteCycle(challengeId, requiredIds, edges) {
  if (!challengeId) return false;
  const graph = new Map();
  for (const edge of edges) {
    if (edge.challengeId === challengeId) continue;
    const targets = graph.get(edge.challengeId) || [];
    targets.push(edge.requiredChallengeId);
    graph.set(edge.challengeId, targets);
  }
  const pending = [...requiredIds];
  const visited = new Set();
  while (pending.length) {
    const id = pending.pop();
    if (id === challengeId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...(graph.get(id) || []));
  }
  return false;
}

export function normalizeHints(value) {
  if (!Array.isArray(value) || value.length > 50) {
    throw challengeConfigurationError("A challenge can have up to 50 hints.");
  }
  const seen = new Set();
  return value.map((hint, order) => {
    if (!hint || typeof hint !== "object" || Array.isArray(hint)) {
      throw challengeConfigurationError("Every hint must have valid content and a cost.");
    }
    const id = hint.id || null;
    if (id && (typeof id !== "string" || seen.has(id))) {
      throw challengeConfigurationError("Hint IDs must be unique.");
    }
    if (id) seen.add(id);
    const title = typeof hint.title === "string" ? hint.title.trim() : "";
    const content = typeof hint.content === "string" ? hint.content.trim() : "";
    const cost = Number(hint.cost ?? 0);
    const contentFormat = hint.contentFormat || "MARKDOWN";
    if (!content || content.length > 100000 || title.length > 200) {
      throw challengeConfigurationError("Every hint needs content (up to 100,000 characters) and a title under 200 characters.");
    }
    if (!Number.isSafeInteger(cost) || cost < 0 || cost > 1000000) {
      throw challengeConfigurationError("Hint costs must be whole numbers from 0 to 1,000,000.");
    }
    if (!["MARKDOWN", "RICHTEXT"].includes(contentFormat)) {
      throw challengeConfigurationError("Invalid hint content format.");
    }
    return { id, title: title || `Hint ${order + 1}`, content, contentFormat, cost, order };
  });
}

export function serializePlayerHint(hint, unlock, { preview = false } = {}) {
  const result = {
    id: hint.id,
    title: hint.title,
    cost: hint.cost,
    unlocked: !!unlock || preview,
    costPaid: unlock?.costPaid ?? null,
  };
  if (result.unlocked) {
    result.content = hint.content;
    result.contentFormat = hint.contentFormat;
  }
  return result;
}

export function serializePlayerHints(hints, { preview = false } = {}) {
  return hints
    .filter((hint) => !hint.retired || (!preview && hint.unlocks?.length))
    .map((hint) => serializePlayerHint(hint, hint.unlocks?.[0], { preview }));
}
