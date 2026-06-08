"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { toEditorHtml } from "@/lib/content-format";
import { getSitePagePath } from "@/lib/site-page-paths";
import {
  normalizePageSlug,
  validatePageSlugFormat,
} from "@/lib/site-page-slug";
import { cn } from "@/lib/utils";
import { ExternalLink, Plus, Trash2 } from "lucide-react";

function getPageHtml(page) {
  return page ? toEditorHtml(page.content, page.contentFormat) : "";
}

function PageEditorToolbar({
  page,
  saveState,
  error,
  onSaveNow,
  extraActions,
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <div>
        <h2 className="text-xl font-semibold">{page.title}</h2>
        <p className="text-sm text-muted-foreground">
          Public URL:{" "}
          <Link
            href={getSitePagePath(page)}
            className="text-primary hover:underline"
            target="_blank"
          >
            {getSitePagePath(page)}
          </Link>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {saveState === "saving" && (
          <span className="text-xs text-muted-foreground">Saving…</span>
        )}
        {saveState === "saved" && (
          <span className="text-xs text-primary">Saved</span>
        )}
        {saveState === "error" && (
          <span className="text-xs text-destructive">{error || "Save failed"}</span>
        )}
        {extraActions}
        <Button type="button" size="sm" variant="outline" asChild>
          <Link
            href={getSitePagePath(page)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Preview
          </Link>
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onSaveNow}>
          Save now
        </Button>
      </div>
    </div>
  );
}

export function AdminSitePagesManager({ systemPages, customPages: initialCustomPages }) {
  const router = useRouter();
  const [customPages, setCustomPages] = useState(initialCustomPages);

  const [systemSlug, setSystemSlug] = useState(() => systemPages[0]?.slug || "");
  const [customSlug, setCustomSlug] = useState("");

  const [content, setContent] = useState(() => getPageHtml(systemPages[0]));
  const [title, setTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");

  const [saveState, setSaveState] = useState(systemPages[0] ? "saved" : "idle");
  const [error, setError] = useState(null);

  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [createError, setCreateError] = useState(null);
  const [creating, setCreating] = useState(false);

  const [detailsState, setDetailsState] = useState("idle");
  const [detailsError, setDetailsError] = useState(null);

  const saveTimerRef = useRef(null);
  const latestContentRef = useRef(getPageHtml(systemPages[0]));
  const skipSaveRef = useRef(false);

  const selectedSystemPage = useMemo(
    () => systemPages.find((p) => p.slug === systemSlug),
    [systemPages, systemSlug]
  );

  const selectedCustomPage = useMemo(
    () => customPages.find((p) => p.slug === customSlug),
    [customPages, customSlug]
  );

  const activePage = selectedCustomPage || selectedSystemPage;
  const activeSlug = activePage?.slug;
  const isCustomActive = Boolean(selectedCustomPage);

  const loadPage = useCallback((page, { isCustom }) => {
    skipSaveRef.current = true;
    if (!page) {
      setContent("");
      latestContentRef.current = "";
      return;
    }
    const html = getPageHtml(page);
    setContent(html);
    latestContentRef.current = html;
    if (isCustom) {
      setTitle(page.title);
      setEditSlug(page.slug);
    }
    setSaveState("saved");
    setError(null);
    setDetailsState("idle");
    setDetailsError(null);
  }, []);

  function selectSystemPage(slug) {
    setCustomSlug("");
    setSystemSlug(slug);
    const page = systemPages.find((p) => p.slug === slug);
    loadPage(page, { isCustom: false });
  }

  function selectCustomPage(slug) {
    setSystemSlug("");
    setCustomSlug(slug);
    const page = customPages.find((p) => p.slug === slug);
    loadPage(page, { isCustom: true });
  }

  const saveContent = useCallback(
    async (html) => {
      if (!activeSlug) return;

      setSaveState("saving");
      setError(null);

      try {
        const res = await fetch(`/api/admin/pages/${activeSlug}`, {
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
        if (isCustomActive && data.page) {
          setCustomPages((prev) =>
            prev.map((p) => (p.slug === activeSlug ? data.page : p))
          );
          if (data.page.slug !== activeSlug) {
            setCustomSlug(data.page.slug);
          }
        }
        setSaveState("saved");
      } catch {
        setSaveState("error");
        setError("Save failed");
      }
    },
    [activeSlug, isCustomActive]
  );

  async function saveCustomDetails() {
    if (!selectedCustomPage) return;

    const normalized = normalizePageSlug(editSlug);
    const formatError = validatePageSlugFormat(normalized);
    if (formatError) {
      setDetailsState("error");
      setDetailsError(formatError);
      return;
    }
    if (!title.trim()) {
      setDetailsState("error");
      setDetailsError("Title is required");
      return;
    }

    setDetailsState("saving");
    setDetailsError(null);

    try {
      const res = await fetch(`/api/admin/pages/${selectedCustomPage.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          slug: normalized,
          content: latestContentRef.current,
          contentFormat: "RICHTEXT",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDetailsState("error");
        setDetailsError(data.error || "Save failed");
        return;
      }

      setCustomPages((prev) => {
        const next = prev.filter((p) => p.slug !== selectedCustomPage.slug);
        next.push(data.page);
        next.sort((a, b) => a.title.localeCompare(b.title));
        return next;
      });
      setCustomSlug(data.page.slug);
      setEditSlug(data.page.slug);
      setTitle(data.page.title);
      setDetailsState("saved");
      router.refresh();
    } catch {
      setDetailsState("error");
      setDetailsError("Save failed");
    }
  }

  async function createCustomPage(e) {
    e.preventDefault();
    const normalized = normalizePageSlug(newSlug);
    const formatError = validatePageSlugFormat(normalized);
    if (formatError) {
      setCreateError(formatError);
      return;
    }
    if (!newTitle.trim()) {
      setCreateError("Title is required");
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/admin/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: normalized,
          title: newTitle.trim(),
          content: "",
          contentFormat: "RICHTEXT",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "Create failed");
        return;
      }

      setCustomPages((prev) =>
        [...prev, data.page].sort((a, b) => a.title.localeCompare(b.title))
      );
      setNewSlug("");
      setNewTitle("");
      selectCustomPage(data.page.slug);
      router.refresh();
    } catch {
      setCreateError("Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function deleteCustomPage() {
    if (!selectedCustomPage) return;
    if (
      !confirm(`Delete "${selectedCustomPage.title}"? This cannot be undone.`)
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/pages/${selectedCustomPage.slug}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Delete failed");
        return;
      }

      setCustomPages((prev) =>
        prev.filter((p) => p.slug !== selectedCustomPage.slug)
      );
      setCustomSlug("");
      setContent("");
      latestContentRef.current = "";
      if (systemPages[0]) {
        selectSystemPage(systemPages[0].slug);
      }
      router.refresh();
    } catch {
      setError("Delete failed");
    }
  }

  useEffect(() => {
    setCustomPages(initialCustomPages);
  }, [initialCustomPages]);

  useEffect(() => {
    latestContentRef.current = content;

    if (!activeSlug) return;

    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      saveContent(latestContentRef.current);
    }, 1200);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [content, activeSlug, saveContent]);

  const newSlugPreview = normalizePageSlug(newSlug);
  const newSlugFormatError = newSlugPreview
    ? validatePageSlugFormat(newSlugPreview)
    : null;

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Main pages</h2>
          <p className="text-sm text-muted-foreground">
            General Rules, Terms of Service, and Privacy Policy use fixed URLs at the
            site root. Only the body content is editable here.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {systemPages.map((page) => (
            <button
              key={page.slug}
              type="button"
              onClick={() => selectSystemPage(page.slug)}
              className={cn(
                "rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50",
                systemSlug === page.slug && !customSlug && "border-primary ring-1 ring-primary"
              )}
            >
              <div className="font-medium">{page.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {getSitePagePath(page)}
              </div>
            </button>
          ))}
        </div>

        {selectedSystemPage && !customSlug && (
          <div className="space-y-4 rounded-lg border border-border bg-card p-4">
            <PageEditorToolbar
              page={selectedSystemPage}
              saveState={saveState}
              error={error}
              onSaveNow={() => saveContent(content)}
            />
            <RichTextEditor
              key={`system-${selectedSystemPage.slug}`}
              content={content}
              onChange={setContent}
            />
          </div>
        )}
      </section>

      <section className="space-y-4 border-t border-border pt-10">
        <div>
          <h2 className="text-lg font-semibold">Custom pages</h2>
          <p className="text-sm text-muted-foreground">
            Additional pages are published under{" "}
            <code className="text-xs">/pages/your-slug</code>. Slugs must not match an
            existing app route.
          </p>
        </div>

        <form
          onSubmit={createCustomPage}
          className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_1fr_auto]"
        >
          <div className="space-y-2">
            <Label htmlFor="new-page-slug">Slug</Label>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-muted-foreground">/pages/</span>
              <Input
                id="new-page-slug"
                value={newSlug}
                onChange={(e) => {
                  setNewSlug(e.target.value);
                  setCreateError(null);
                }}
                placeholder="about-duca"
                autoComplete="off"
              />
            </div>
            {newSlugPreview && newSlugFormatError && (
              <p className="text-xs text-destructive">{newSlugFormatError}</p>
            )}
            {newSlugPreview && !newSlugFormatError && (
              <p className="text-xs text-muted-foreground">
                Preview URL: /pages/{newSlugPreview}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-page-title">Title</Label>
            <Input
              id="new-page-title"
              value={newTitle}
              onChange={(e) => {
                setNewTitle(e.target.value);
                setCreateError(null);
              }}
              placeholder="About DUCA"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={creating}>
              <Plus className="mr-2 h-4 w-4" />
              {creating ? "Creating…" : "Add page"}
            </Button>
          </div>
          {createError && (
            <p className="text-sm text-destructive md:col-span-3">{createError}</p>
          )}
        </form>

        {customPages.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {customPages.map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={() => selectCustomPage(page.slug)}
                className={cn(
                  "rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50",
                  customSlug === page.slug && "border-primary ring-1 ring-primary"
                )}
              >
                <div className="font-medium">{page.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {getSitePagePath(page)}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No custom pages yet.</p>
        )}

        {selectedCustomPage && (
          <div className="space-y-4 rounded-lg border border-border bg-card p-4">
            <PageEditorToolbar
              page={{
                ...selectedCustomPage,
                title: title || selectedCustomPage.title,
              }}
              saveState={saveState}
              error={error}
              onSaveNow={() => saveContent(content)}
              extraActions={
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={deleteCustomPage}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              }
            />

            <div className="grid gap-4 border-b border-border pb-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-page-title">Title</Label>
                <Input
                  id="edit-page-title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setDetailsState("idle");
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-page-slug">Slug</Label>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-sm text-muted-foreground">/pages/</span>
                  <Input
                    id="edit-page-slug"
                    value={editSlug}
                    onChange={(e) => {
                      setEditSlug(e.target.value);
                      setDetailsState("idle");
                    }}
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                <Button type="button" size="sm" variant="secondary" onClick={saveCustomDetails}>
                  Save title &amp; slug
                </Button>
                {detailsState === "saving" && (
                  <span className="text-xs text-muted-foreground">Saving details…</span>
                )}
                {detailsState === "saved" && (
                  <span className="text-xs text-primary">Details saved</span>
                )}
                {detailsState === "error" && (
                  <span className="text-xs text-destructive">
                    {detailsError || "Save failed"}
                  </span>
                )}
              </div>
            </div>

            <RichTextEditor
              key={`custom-${selectedCustomPage.slug}`}
              content={content}
              onChange={setContent}
            />
          </div>
        )}
      </section>
    </div>
  );
}
