import { notFound } from "next/navigation";
import { getCustomSitePage } from "@/lib/site-pages";
import { SitePageContent } from "@/components/site/site-page-content";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = await getCustomSitePage(slug);
  if (!page) return { title: "Page not found · DUCA CTF" };
  return { title: `${page.title} · DUCA CTF` };
}

export default async function CustomSitePage({ params }) {
  const { slug } = await params;
  const page = await getCustomSitePage(slug);

  if (!page) {
    notFound();
  }

  return <SitePageContent page={page} />;
}
