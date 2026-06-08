import { revalidatePath, revalidateTag } from "next/cache";
import { isSystemPageSlug } from "@/lib/site-page-slug";

export const SITE_PAGES_CACHE_TAG = "site-pages";

export function sitePageCacheTag(slug) {
  return `site-page:${slug}`;
}

export function revalidateSitePages({ slug, previousSlug } = {}) {
  revalidateTag(SITE_PAGES_CACHE_TAG);

  for (const value of [slug, previousSlug]) {
    if (!value) continue;
    revalidateTag(sitePageCacheTag(value));
    revalidatePath(isSystemPageSlug(value) ? `/${value}` : `/pages/${value}`);
  }

  revalidatePath("/pages");
}
