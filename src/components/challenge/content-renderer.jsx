import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sanitizeHtml } from "@/lib/sanitize";

export function ContentRenderer({ content, format = "MARKDOWN" }) {
  if (!content) {
    return <p className="text-muted-foreground">No description provided.</p>;
  }

  if (format === "RICHTEXT") {
    return (
      <div
        className="prose-ctf tiptap-editor"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
      />
    );
  }

  return (
    <div className="prose-ctf">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
