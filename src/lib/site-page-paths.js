import { isSystemPageSlug } from "@/lib/site-page-slug";

export function getSitePagePath(pageOrSlug, isSystem) {
  const slug = typeof pageOrSlug === "string" ? pageOrSlug : pageOrSlug.slug;
  const system =
    typeof pageOrSlug === "object"
      ? pageOrSlug.isSystem
      : isSystem ?? isSystemPageSlug(slug);

  if (system) return `/${slug}`;
  return `/pages/${slug}`;
}
