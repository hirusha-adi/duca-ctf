"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "@/components/ui/button";
import { uploadImageFile } from "@/lib/upload-image";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
  Code,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  Quote,
} from "lucide-react";
import { cn } from "@/lib/utils";

async function insertImageFile(editor, file) {
  const url = await uploadImageFile(file);
  editor.chain().focus().setImage({ src: url, alt: file.name }).run();
}

export function WriteupEditor({
  content,
  onChange,
  disabled = false,
  placeholder = "Start writing… paste images with Ctrl+V",
  variant = "full",
}) {
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: content || "",
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getHTML());
    },
    onCreate: ({ editor: e }) => {
      editorRef.current = e;
    },
    editorProps: {
      attributes: {
        class: "writeup-editor-content focus:outline-none",
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        const imageItems = Array.from(items).filter((item) =>
          item.type.startsWith("image/")
        );
        if (imageItems.length === 0) return false;

        event.preventDefault();
        setUploading(true);
        Promise.all(
          imageItems.map(async (item) => {
            const file = item.getAsFile();
            if (file && editorRef.current) {
              await insertImageFile(editorRef.current, file);
            }
          })
        ).finally(() => setUploading(false));

        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved || !event.dataTransfer?.files?.length) return false;

        const files = Array.from(event.dataTransfer.files).filter((f) =>
          f.type.startsWith("image/")
        );
        if (files.length === 0) return false;

        event.preventDefault();
        setUploading(true);
        Promise.all(
          files.map(async (file) => {
            if (editorRef.current) {
              await insertImageFile(editorRef.current, file);
            }
          })
        ).finally(() => setUploading(false));

        return true;
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  async function handleFilePick(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !editor) return;

    setUploading(true);
    try {
      for (const file of files) {
        await insertImageFile(editor, file);
      }
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  if (!editor) return null;

  const tools = [
    { icon: Heading1, action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive("heading", { level: 1 }) },
    { icon: Heading2, action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive("heading", { level: 2 }) },
    { icon: Heading3, action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: editor.isActive("heading", { level: 3 }) },
    { icon: Bold, action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold") },
    { icon: Italic, action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic") },
    { icon: List, action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive("bulletList") },
    { icon: ListOrdered, action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive("orderedList") },
    { icon: Quote, action: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive("blockquote") },
    { icon: Code, action: () => editor.chain().focus().toggleCodeBlock().run(), active: editor.isActive("codeBlock") },
    {
      icon: LinkIcon,
      action: () => {
        const url = window.prompt("URL");
        if (url) editor.chain().focus().setLink({ href: url }).run();
      },
      active: editor.isActive("link"),
    },
    { icon: ImageIcon, action: () => fileInputRef.current?.click(), active: false },
  ];

  const isCompact = variant === "compact";
  const isEmbedded = variant === "embedded";

  return (
    <div
      className={cn(
        "writeup-editor",
        isEmbedded && "flex min-h-0 flex-1 flex-col overflow-hidden"
      )}
    >
      <div
        className={cn(
          "z-10 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card/95 p-1.5 backdrop-blur",
          isEmbedded ? "mb-3 shrink-0" : "mb-3",
          !isEmbedded && (isCompact ? "sticky top-0" : "sticky top-14")
        )}
      >
        {tools.map(({ icon: Icon, action, active }, i) => (
          <Button
            key={i}
            type="button"
            size="sm"
            variant="ghost"
            onClick={action}
            className={cn("h-8 w-8 p-0", active && "bg-secondary text-foreground")}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
        {uploading && (
          <span className="ml-2 text-xs text-muted-foreground">Uploading image…</span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFilePick}
        />
      </div>

      <div
        className={cn(
          "rounded-lg border border-border bg-card",
          isEmbedded && "min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-12",
          isCompact && !isEmbedded && "min-h-[240px] px-4 py-5",
          !isCompact && !isEmbedded && "min-h-[60vh] px-6 py-8 md:px-12"
        )}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
