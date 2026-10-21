/** Validate the complete replacement before retiring or updating any flag. */
export function prepareFlagChanges(flags, existingFlags = []) {
  if (!Array.isArray(flags)) throw new Error("INVALID_FLAGS");
  if (flags.length === 0) throw new Error("AT_LEAST_ONE_FLAG");
  if (flags.length > 20) throw new Error("TOO_MANY_FLAGS");

  const existing = new Map(existingFlags.map((flag) => [flag.id, flag]));
  const submittedIds = new Set();
  const values = new Set();
  const normalized = flags.map((flag, order) => {
    if (!flag || typeof flag !== "object" || Array.isArray(flag)) {
      throw new Error("INVALID_FLAGS");
    }
    const id = flag.id ?? null;
    if (id !== null) {
      if (typeof id !== "string" || !existing.has(id) || existing.get(id).retired) {
        throw new Error("INVALID_FLAG_ID");
      }
      if (submittedIds.has(id)) throw new Error("DUPLICATE_FLAG");
      submittedIds.add(id);
    }
    if (typeof flag.value !== "string" || !flag.value.trim()) {
      throw new Error("FLAG_VALUE_REQUIRED");
    }
    const value = flag.value.trim();
    if (value.length > 4096) throw new Error("FLAG_VALUE_TOO_LONG");
    if (values.has(value)) throw new Error("DUPLICATE_FLAG_VALUE");
    values.add(value);
    if (flag.label != null && (typeof flag.label !== "string" || flag.label.length > 200)) {
      throw new Error("INVALID_FLAG_LABEL");
    }
    return { id, value, label: flag.label ?? "", order };
  });

  return {
    flags: normalized,
    retiredIds: existingFlags
      .filter((flag) => !flag.retired && !submittedIds.has(flag.id))
      .map((flag) => flag.id),
  };
}
