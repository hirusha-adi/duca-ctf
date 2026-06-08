import { prisma } from "@/lib/db";
import { SITE_PAGE_DEFINITIONS } from "@/lib/default-site-pages";

export const SITE_PAGE_SLUGS = SITE_PAGE_DEFINITIONS.map((p) => p.slug);

export async function ensureDefaultSitePages() {
  for (const page of SITE_PAGE_DEFINITIONS) {
    await prisma.sitePage.upsert({
      where: { slug: page.slug },
      update: {},
      create: {
        slug: page.slug,
        title: page.title,
        content: page.content,
        contentFormat: "RICHTEXT",
      },
    });
  }
}

export async function listSitePages() {
  await ensureDefaultSitePages();
  return prisma.sitePage.findMany({
    where: { slug: { in: SITE_PAGE_SLUGS } },
    orderBy: { slug: "asc" },
  });
}

export async function getSitePage(slug) {
  await ensureDefaultSitePages();
  return prisma.sitePage.findUnique({ where: { slug } });
}
