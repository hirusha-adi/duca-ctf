"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import "@uiw/react-md-editor/markdown-editor.css";
import TurndownService from "turndown";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "./rich-text-editor";
import { marked } from "marked";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

const turndown = new TurndownService();

export function DualEditor({ value, format, onChange, onFormatChange }) {
  const [currentFormat, setCurrentFormat] = useState(format || "MARKDOWN");

  function switchFormat(newFormat) {
    if (newFormat === currentFormat) return;

    let newContent = value;

    if (currentFormat === "MARKDOWN" && newFormat === "RICHTEXT") {
      newContent = marked.parse(value || "");
    } else if (currentFormat === "RICHTEXT" && newFormat === "MARKDOWN") {
      newContent = turndown.turndown(value || "");
    }

    setCurrentFormat(newFormat);
    onFormatChange?.(newFormat);
    onChange?.(newContent);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={currentFormat === "MARKDOWN" ? "default" : "outline"}
          onClick={() => switchFormat("MARKDOWN")}
        >
          Markdown
        </Button>
        <Button
          type="button"
          size="sm"
          variant={currentFormat === "RICHTEXT" ? "default" : "outline"}
          onClick={() => switchFormat("RICHTEXT")}
        >
          Rich Text
        </Button>
      </div>

      {currentFormat === "MARKDOWN" ? (
        <div data-color-mode="dark">
          <MDEditor
            value={value}
            onChange={(v) => onChange?.(v || "")}
            height={300}
            preview="edit"
          />
        </div>
      ) : (
        <RichTextEditor content={value} onChange={onChange} />
      )}
    </div>
  );
}
