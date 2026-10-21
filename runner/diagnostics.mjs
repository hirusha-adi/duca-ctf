export function sanitizedOperationError(error, instance, extraSecrets = []) {
  const secretValues = [
    ...extraSecrets,
    ...Object.entries(process.env).filter(([key]) => /SECRET|TOKEN|PASSWORD|DATABASE_URL/i.test(key)).map(([, value]) => value),
    ...(instance.template?.services || []).flatMap((service) => Object.values(service.environment || {})),
  ].filter((value) => typeof value === "string" && value.length).sort((a, b) => b.length - a.length);
  let detail = String(error?.message || "Unknown runner failure");
  for (const value of secretValues) {
    for (const representation of new Set([value, JSON.stringify(value).slice(1, -1), encodeURIComponent(value)])) detail = detail.split(representation).join("[redacted]");
  }
  detail = detail.replace(/(Bearer\s+)[^\s,;]+/gi, "$1[redacted]").replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@");
  return {
    reason: String(error?.name || "Error").slice(0, 80),
    detail: detail.slice(0, 1200),
    ...(Number.isInteger(error?.status) ? { status: error.status } : {}),
    phase: String(instance.operationPhase || "reconcile").slice(0, 120),
  };
}
