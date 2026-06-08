import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getCachedPublicCustomSitePage,
  getCustomSitePage,
} from "@/lib/site-pages";
import { SitePageContent } from "@/components/site/site-page-content";

export const revalidate = 60;

async function resolveCustomSitePage(slug, isAdmin) {
  if (isAdmin) {
    return getCustomSitePage(slug, { isAdmin: true });
  }
  return getCachedPublicCustomSitePage(slug);
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";
  const page = await resolveCustomSitePage(slug, isAdmin);
  if (!page) return { title: "Page not found · DUCA CTF" };
  return { title: `${page.title} · DUCA CTF` };
}

export default async function CustomSitePage({ params }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";
  const page = await resolveCustomSitePage(slug, isAdmin);

  if (!page) {
    notFound();
  }

  return <SitePageContent page={page} showHiddenBanner={page.hidden && isAdmin} />;
}
