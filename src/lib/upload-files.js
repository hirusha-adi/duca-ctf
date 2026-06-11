const MIME_TYPE_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["application/pdf", "pdf"],
  ["text/plain", "txt"],
  ["application/zip", "zip"],
  ["application/x-zip-compressed", "zip"],
]);

export function getUploadFileExtension(mimeType) {
  return MIME_TYPE_EXTENSIONS.get(mimeType) || null;
}
