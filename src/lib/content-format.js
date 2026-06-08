import { marked } from "marked";

export function toEditorHtml(content, format = "MARKDOWN") {
  if (!content) return "";
  if (format === "MARKDOWN") {
    return marked.parse(content);
  }
  return content;
}
