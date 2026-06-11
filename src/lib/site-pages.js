import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { SITE_PAGE_DEFINITIONS } from "@/lib/default-site-pages";
import { SITE_PAGE_REVALIDATE } from "@/lib/cache-config";
import {
  SITE_PAGES_CACHE_TAG,
  sitePageCacheTag,
} from "@/lib/revalidate-site-pages";
import {
  SYSTEM_PAGE_SLUGS,
  validatePageSlugFormat,
} from "@/lib/site-page-slug";

export const SITE_PAGE_SLUGS = SYSTEM_PAGE_SLUGS;

export async function ensureDefaultSitePages() {
  for (const page of SITE_PAGE_DEFINITIONS) {
    await prisma.sitePage.upsert({
      where: { slug: page.slug },
      update: { isSystem: true },
      create: {
        slug: page.slug,
        title: page.title,
        content: page.content,
        contentFormat: "RICHTEXT",
        isSystem: true,
      },
    });
  }
}

export async function validateCustomPageSlug(slug, { excludeSlug } = {}) {
  const formatError = validatePageSlugFormat(slug);
  if (formatError) return formatError;

  if (slug !== excludeSlug) {
    const existing = await prisma.sitePage.findUnique({ where: { slug } });
    if (existing) return "A page with this slug already exists";
  }

  return null;
}

export async function listSystemSitePages() {
  await ensureDefaultSitePages();
  const pages = await prisma.sitePage.findMany({
    where: { isSystem: true },
  });
  return SYSTEM_PAGE_SLUGS.map((slug) => pages.find((p) => p.slug === slug)).filter(
    Boolean
  );
}

export async function listCustomSitePages() {
  await ensureDefaultSitePages();
  return prisma.sitePage.findMany({
    where: { isSystem: false },
    orderBy: { title: "asc" },
  });
}

export async function listAllSitePages() {
  const [systemPages, customPages] = await Promise.all([
    listSystemSitePages(),
    listCustomSitePages(),
  ]);
  return { systemPages, customPages };
}

export async function listPublicSitePages() {
  const { systemPages, customPages } = await listAllSitePages();
  return [...systemPages, ...customPages.filter((page) => !page.hidden)];
}

export async function getSitePage(slug) {
  await ensureDefaultSitePages();
  return prisma.sitePage.findUnique({ where: { slug } });
}

async function fetchPublicSitePages() {
  await ensureDefaultSitePages();

  const pages = await prisma.sitePage.findMany({
    where: {
      OR: [{ isSystem: true }, { isSystem: false, hidden: false }],
    },
  });

  const systemPages = SYSTEM_PAGE_SLUGS.map((slug) =>
    pages.find((page) => page.slug === slug)
  ).filter(Boolean);
  const customPages = pages
    .filter((page) => !page.isSystem)
    .sort((a, b) => a.title.localeCompare(b.title));

  return [...systemPages, ...customPages];
}

async function fetchPublicSitePage(slug) {
  await ensureDefaultSitePages();

  const page = await prisma.sitePage.findUnique({ where: { slug } });
  if (!page) return null;
  if (!page.isSystem && page.hidden) return null;
  return page;
}

async function fetchPublicCustomSitePage(slug) {
  const page = await prisma.sitePage.findUnique({ where: { slug } });
  if (!page || page.isSystem || page.hidden) return null;
  return page;
}

export const getCachedSitePage = (slug) =>
  unstable_cache(
    async () => fetchPublicSitePage(slug),
    ["site-page", slug],
    {
      revalidate: SITE_PAGE_REVALIDATE,
      tags: [SITE_PAGES_CACHE_TAG, sitePageCacheTag(slug)],
    }
  )();

export const getCachedPublicSitePages = () =>
  unstable_cache(fetchPublicSitePages, ["site-pages-public"], {
    revalidate: SITE_PAGE_REVALIDATE,
    tags: [SITE_PAGES_CACHE_TAG],
  })();

export const getCachedPublicCustomSitePage = (slug) =>
  unstable_cache(
    async () => fetchPublicCustomSitePage(slug),
    ["site-page-custom", slug],
    {
      revalidate: SITE_PAGE_REVALIDATE,
      tags: [SITE_PAGES_CACHE_TAG, sitePageCacheTag(slug)],
    }
  )();

export async function getCustomSitePage(slug, { isAdmin = false } = {}) {
  const page = await getSitePage(slug);
  if (!page || page.isSystem) return null;
  if (page.hidden && !isAdmin) return null;
  return page;
}
