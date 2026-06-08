"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { toEditorHtml } from "@/lib/content-format";
import { getSitePagePath } from "@/lib/site-page-paths";
import { ExternalLink } from "lucide-react";

function getPageHtml(page) {
  return page ? toEditorHtml(page.content, page.contentFormat) : "";
}

export function AdminSitePagesManager({ pages }) {
  const initialHtml = getPageHtml(pages[0]);
  const [slug, setSlug] = useState(() => pages[0]?.slug || "");
  const [content, setContent] = useState(initialHtml);
  const [saveState, setSaveState] = useState(pages[0] ? "saved" : "idle");
  const [error, setError] = useState(null);
  const saveTimerRef = useRef(null);
  const latestContentRef = useRef(initialHtml);
  const skipSaveRef = useRef(false);

  const selectedPage = useMemo(
    () => pages.find((p) => p.slug === slug),
    [pages, slug]
  );

  const loadPage = useCallback((page) => {
    skipSaveRef.current = true;
    if (!page) {
      setContent("");
      latestContentRef.current = "";
      return;
    }
    const html = toEditorHtml(page.content, page.contentFormat);
    setContent(html);
    latestContentRef.current = html;
    setSaveState("saved");
    setError(null);
  }, []);

  function handlePageChange(nextSlug) {
    setSlug(nextSlug);
    const page = pages.find((p) => p.slug === nextSlug);
    loadPage(page);
  }

  const savePage = useCallback(
    async (html) => {
      if (!slug) return;

      setSaveState("saving");
      setError(null);

      try {
        const res = await fetch(`/api/admin/pages/${slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: html,
            contentFormat: "RICHTEXT",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setSaveState("error");
          setError(data.error || "Save failed");
          return;
        }
        setSaveState("saved");
      } catch {
        setSaveState("error");
        setError("Save failed");
      }
    },
    [slug]
  );

  useEffect(() => {
    latestContentRef.current = content;

    if (!slug) return;

    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      if (latestContentRef.current !== undefined) {
        savePage(latestContentRef.current);
      }
    }, 1200);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [content, slug, savePage]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="space-y-2">
          <Label>Page</Label>
          <Select value={slug} onValueChange={handlePageChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select a page" />
            </SelectTrigger>
            <SelectContent>
              {pages.map((page) => (
                <SelectItem key={page.slug} value={page.slug}>
                  {page.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedPage && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h2 className="text-xl font-semibold">{selectedPage.title}</h2>
              <p className="text-sm text-muted-foreground">
                Public URL:{" "}
                <Link
                  href={getSitePagePath(selectedPage.slug)}
                  className="text-primary hover:underline"
                  target="_blank"
                >
                  {getSitePagePath(selectedPage.slug)}
                </Link>
              </p>
            </div>
            <div className="flex items-center gap-3">
              {saveState === "saving" && (
                <span className="text-xs text-muted-foreground">Saving…</span>
              )}
              {saveState === "saved" && (
                <span className="text-xs text-primary">Saved</span>
              )}
              {saveState === "error" && (
                <span className="text-xs text-destructive">{error || "Save failed"}</span>
              )}
              <Button type="button" size="sm" variant="outline" asChild>
                <Link
                  href={getSitePagePath(selectedPage.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Preview
                </Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => savePage(content)}
              >
                Save now
              </Button>
            </div>
          </div>

          <RichTextEditor key={slug} content={content} onChange={setContent} />
        </div>
      )}
    </div>
  );
}
