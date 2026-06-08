import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { listPublicSitePages } from "@/lib/site-pages";
import { getSitePagePath } from "@/lib/site-page-paths";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = {
  title: "Pages · DUCA CTF",
};

export default async function SitePagesIndexPage() {
  const pages = await listPublicSitePages();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Pages</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Site information and resources published on DUCA CTF.
      </p>

      {pages.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pages available.</p>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>URL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map((page) => {
                const href = getSitePagePath(page);
                return (
                  <TableRow key={page.id}>
                    <TableCell className="font-medium">{page.title}</TableCell>
                    <TableCell>
                      <Link
                        href={href}
                        className="inline-flex items-center gap-1.5 text-primary hover:underline"
                      >
                        {href}
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
