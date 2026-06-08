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

function SitePageEditor({ editorKey, content, onChange }) {
  return (
    <RichTextEditor
      key={editorKey}
      content={content}
      onChange={onChange}
      placeholder="Start writing… paste images with Ctrl+V"
      variant="embedded"
    />
  );
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

function SidebarPageButton({ page, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(page.slug)}
      className={cn(
        "w-full rounded-md border border-border bg-background p-3 text-left transition-colors hover:border-primary/50",
        selected && "border-primary ring-1 ring-primary"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium">{page.title}</div>
        {!page.isSystem && page.hidden && (
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Hidden
          </span>
        )}
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground">
        {getSitePagePath(page)}
      </div>
    </button>
  );
}

export function AdminSitePagesManager({ systemPages, customPages: initialCustomPages }) {
  const router = useRouter();
  const [customPages, setCustomPages] = useState(initialCustomPages);
  const [selectedSlug, setSelectedSlug] = useState(() => systemPages[0]?.slug || "");

  const [content, setContent] = useState(() => getPageHtml(systemPages[0]));
  const [title, setTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [hidden, setHidden] = useState(false);
  const [togglingHidden, setTogglingHidden] = useState(false);

  const [saveState, setSaveState] = useState(systemPages[0] ? "saved" : "idle");
  const [error, setError] = useState(null);

  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [createError, setCreateError] = useState(null);
  const [creating, setCreating] = useState(false);

  const saveTimerRef = useRef(null);
  const latestContentRef = useRef(getPageHtml(systemPages[0]));
  const skipSaveRef = useRef(false);

  const selectedPage = useMemo(() => {
    const system = systemPages.find((p) => p.slug === selectedSlug);
    if (system) return system;
    return customPages.find((p) => p.slug === selectedSlug) || null;
  }, [systemPages, customPages, selectedSlug]);

  const isSystemPage = Boolean(selectedPage?.isSystem);

  const loadPage = useCallback((page) => {
    skipSaveRef.current = true;
    if (!page) {
      setContent("");
      latestContentRef.current = "";
      return;
    }
    const html = getPageHtml(page);
    setContent(html);
    latestContentRef.current = html;
    if (!page.isSystem) {
      setTitle(page.title);
      setEditSlug(page.slug);
      setHidden(Boolean(page.hidden));
    }
    setSaveState("saved");
    setError(null);
  }, []);

  function selectPage(slug) {
    setSelectedSlug(slug);
    const page =
      systemPages.find((p) => p.slug === slug) ||
      customPages.find((p) => p.slug === slug);
    loadPage(page);
  }

  const savePage = useCallback(
    async (html, { includeMetadata = false } = {}) => {
      if (!selectedSlug || !selectedPage) return;

      if (!isSystemPage && includeMetadata) {
        const normalized = normalizePageSlug(editSlug);
        const formatError = validatePageSlugFormat(normalized);
        if (formatError) {
          setSaveState("error");
          setError(formatError);
          return;
        }
        if (!title.trim()) {
          setSaveState("error");
          setError("Title is required");
          return;
        }
      }

      setSaveState("saving");
      setError(null);

      const body = {
        content: html,
        contentFormat: "RICHTEXT",
      };

      if (!isSystemPage && includeMetadata) {
        body.title = title.trim();
        body.slug = normalizePageSlug(editSlug);
        body.hidden = hidden;
      }

      try {
        const res = await fetch(`/api/admin/pages/${selectedSlug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          setSaveState("error");
          setError(data.error || "Save failed");
          return;
        }
        if (!isSystemPage && data.page) {
          const slugChanged = data.page.slug !== selectedPage.slug;
          if (includeMetadata && slugChanged) {
            setCustomPages((prev) => {
              const next = prev.filter((p) => p.slug !== selectedPage.slug);
              next.push(data.page);
              next.sort((a, b) => a.title.localeCompare(b.title));
              return next;
            });
            setSelectedSlug(data.page.slug);
            setEditSlug(data.page.slug);
            setTitle(data.page.title);
            router.refresh();
          } else {
            setCustomPages((prev) =>
              prev.map((p) => (p.slug === selectedSlug ? data.page : p))
            );
            if (includeMetadata) {
              setTitle(data.page.title);
              setEditSlug(data.page.slug);
              router.refresh();
            }
          }
        }
        setSaveState("saved");
      } catch {
        setSaveState("error");
        setError("Save failed");
      }
    },
    [selectedSlug, selectedPage, isSystemPage, title, editSlug, hidden, router]
  );

  async function toggleHidden(checked) {
    if (!selectedPage || isSystemPage) return;

    setHidden(checked);
    setTogglingHidden(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/pages/${selectedSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: checked }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHidden(!checked);
        setError(data.error || "Update failed");
        return;
      }
      setCustomPages((prev) =>
        prev.map((p) => (p.slug === selectedSlug ? data.page : p))
      );
      setSaveState("saved");
      router.refresh();
    } catch {
      setHidden(!checked);
      setError("Update failed");
    } finally {
      setTogglingHidden(false);
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
      selectPage(data.page.slug);
      router.refresh();
    } catch {
      setCreateError("Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function deleteSelectedPage() {
    if (!selectedPage || isSystemPage) return;
    if (!confirm(`Delete "${selectedPage.title}"? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/pages/${selectedPage.slug}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Delete failed");
        return;
      }

      setCustomPages((prev) => prev.filter((p) => p.slug !== selectedPage.slug));
      if (systemPages[0]) {
        selectPage(systemPages[0].slug);
      } else {
        setSelectedSlug("");
        setContent("");
        latestContentRef.current = "";
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

    if (!selectedSlug) return;

    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      savePage(latestContentRef.current);
    }, 5000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [content, selectedSlug, savePage]);

  const newSlugPreview = normalizePageSlug(newSlug);
  const newSlugFormatError = newSlugPreview
    ? validatePageSlugFormat(newSlugPreview)
    : null;

  return (
    <section className="flex h-[min(88vh,68rem)] flex-col gap-4">
      <div className="shrink-0">
        <p className="text-sm text-muted-foreground">
          Main legal pages use fixed root URLs. Custom pages are published under{" "}
          <code className="text-xs">/pages/your-slug</code>.
        </p>
      </div>

      <form
        onSubmit={createCustomPage}
        className="grid shrink-0 gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_1fr_auto]"
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

      <div className="grid min-h-[28rem] flex-1 gap-4 lg:grid-cols-[minmax(12rem,16rem)_1fr]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="shrink-0 border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pages
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 space-y-2 border-b border-border bg-card p-2">
              {systemPages.map((page) => (
                <SidebarPageButton
                  key={page.slug}
                  page={page}
                  selected={selectedSlug === page.slug}
                  onSelect={selectPage}
                />
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {customPages.length > 0 ? (
                <div className="space-y-2">
                  {customPages.map((page) => (
                    <SidebarPageButton
                      key={page.id}
                      page={page}
                      selected={selectedSlug === page.slug}
                      onSelect={selectPage}
                    />
                  ))}
                </div>
              ) : (
                <p className="p-2 text-sm text-muted-foreground">No custom pages yet.</p>
              )}
            </div>
          </div>
        </div>

        {selectedPage ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden rounded-lg border border-border bg-card p-4">
            <PageEditorToolbar
              page={
                isSystemPage
                  ? selectedPage
                  : { ...selectedPage, title: title || selectedPage.title }
              }
              saveState={saveState}
              error={error}
              onSaveNow={() => savePage(content, { includeMetadata: !isSystemPage })}
              extraActions={
                !isSystemPage ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={deleteSelectedPage}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                ) : null
              }
            />

            {!isSystemPage && (
              <div className="shrink-0 grid gap-4 border-b border-border pb-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-page-title">Title</Label>
                  <Input
                    id="edit-page-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-page-slug">Slug</Label>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-sm text-muted-foreground">/pages/</span>
                    <Input
                      id="edit-page-slug"
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 md:col-span-2">
                  <input
                    type="checkbox"
                    id="edit-page-hidden"
                    checked={hidden}
                    disabled={togglingHidden}
                    onChange={(e) => toggleHidden(e.target.checked)}
                    className="h-4 w-4 rounded border border-border bg-background accent-primary"
                  />
                  <Label htmlFor="edit-page-hidden" className="cursor-pointer">
                    Hidden
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    Not listed publicly; only admins can open this page.
                  </span>
                </div>
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <SitePageEditor
                editorKey={`page-${selectedPage.slug}`}
                content={content}
                onChange={setContent}
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-[12rem] items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
            Select a page to edit, or create a custom page above.
          </div>
        )}
      </div>
    </section>
  );
}
