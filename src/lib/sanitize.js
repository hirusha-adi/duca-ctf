import DOMPurify from "isomorphic-dompurify";

export function sanitizeHtml(html) {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["img"],
    ADD_ATTR: ["src", "alt", "title", "width", "height"],
  });
}
