import { notFound } from "next/navigation";
import { getSitePage } from "@/lib/site-pages";
import { ContentRenderer } from "@/components/challenge/content-renderer";
import { formatInAEST } from "@/lib/timezone";

export async function SitePageContent({ slug, page: pageProp }) {
  const page = pageProp ?? (slug ? await getSitePage(slug) : null);

  if (!page) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated {formatInAEST(page.updatedAt)}
        </p>
      </header>
      <ContentRenderer content={page.content} format={page.contentFormat} />
    </div>
  );
}
