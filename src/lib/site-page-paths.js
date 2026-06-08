export function getSitePagePath(slug) {
  if (slug === "rules") return "/rules";
  if (slug === "terms") return "/terms";
  if (slug === "privacy") return "/privacy";
  return `/${slug}`;
}
