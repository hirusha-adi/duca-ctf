export const SYSTEM_PAGE_SLUGS = ["rules", "terms", "privacy"];

/** Top-level app routes and reserved paths — custom page slugs must not collide. */
export const RESERVED_ROUTE_SLUGS = [
  "admin",
  "api",
  "challenges",
  "competitions",
  "leaderboard",
  "login",
  "onboarding",
  "privacy",
  "rules",
  "solves",
  "terms",
  "writeups",
  "pages",
  "_next",
  "favicon.ico",
  "uploads",
];

export function isSystemPageSlug(slug) {
  return SYSTEM_PAGE_SLUGS.includes(slug);
}

export function normalizePageSlug(input) {
  return input.trim().toLowerCase().replace(/\s+/g, "-");
}

export function validatePageSlugFormat(slug) {
  if (!slug) return "Slug is required";
  if (slug.length < 2 || slug.length > 64) {
    return "Slug must be 2–64 characters";
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "Use lowercase letters, numbers, and hyphens only";
  }
  if (isSystemPageSlug(slug)) {
    return "This slug is reserved for a main legal page";
  }
  if (RESERVED_ROUTE_SLUGS.includes(slug)) {
    return "This URL path is already used by the app";
  }
  return null;
}
