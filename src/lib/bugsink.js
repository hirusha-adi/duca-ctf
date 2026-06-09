import * as Sentry from "@sentry/nextjs";

export function getBugsinkDsn() {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_BUGSINK_DSN || "";
  }

  return process.env.BUGSINK_DSN || process.env.NEXT_PUBLIC_BUGSINK_DSN || "";
}

export function getBugsinkRelease() {
  return `duca-ctf@${process.env.npm_package_version || "0.0.0"}`;
}

export function initBugsink() {
  const dsn = getBugsinkDsn();
  if (!dsn) return false;

  Sentry.init({
    dsn,
    release: getBugsinkRelease(),
    environment: process.env.NODE_ENV || "development",
    integrations: [],
    tracesSampleRate: 0,
  });

  return true;
}
