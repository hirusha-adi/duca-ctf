import path from "node:path";
import { mkdir, writeFile, realpath, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const EXTENSIONS = new Map([
  ["image/jpeg", "jpg"], ["image/png", "png"], ["image/gif", "gif"],
  ["image/webp", "webp"], ["application/pdf", "pdf"], ["text/plain", "txt"],
  ["application/zip", "zip"], ["application/x-zip-compressed", "zip"],
]);
export const UPLOAD_CONTENT_TYPES = {
  jpg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  pdf: "application/pdf", txt: "text/plain; charset=utf-8", zip: "application/zip",
};

export function getUploadRoot(uploadDir = process.env.UPLOAD_DIR, cwd = process.cwd()) {
  return path.resolve(cwd, uploadDir || "data/uploads");
}

export function resolveUploadPath(parts, root = getUploadRoot()) {
  if (!Array.isArray(parts) || parts.length !== 2 || !["writeups", "support"].includes(parts[0])) return null;
  if (!/^[0-9a-f-]{36}\.(jpg|png|gif|webp|pdf|txt|zip)$/i.test(parts[1])) return null;
  const resolved = path.resolve(root, ...parts);
  return resolved.startsWith(`${path.resolve(root)}${path.sep}`) ? resolved : null;
}

export async function getStoredUpload(parts, root = getUploadRoot()) {
  const filePath = resolveUploadPath(parts, root);
  if (!filePath) return null;
  try {
    const [actualRoot, actualPath] = await Promise.all([realpath(root), realpath(filePath)]);
    if (!actualPath.startsWith(`${actualRoot}${path.sep}`)) return null;
    const info = await stat(actualPath);
    if (!info.isFile()) return null;
    return { path: actualPath, size: info.size, contentType: UPLOAD_CONTENT_TYPES[path.extname(actualPath).slice(1).toLowerCase()] };
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code)) return null;
    throw error;
  }
}

export async function storeUpload(file, { folder, maxSize, imagesOnly = false, root = getUploadRoot() }) {
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") throw new Error("NO_FILE");
  const ext = EXTENSIONS.get(file.type);
  if (!ext || (imagesOnly && !file.type.startsWith("image/"))) throw new Error("INVALID_TYPE");
  if (!Number.isFinite(file.size) || file.size < 1 || file.size > maxSize) throw new Error("FILE_TOO_LARGE");
  if (!["writeups", "support"].includes(folder)) throw new Error("INVALID_UPLOAD_FOLDER");
  const filename = `${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > maxSize) throw new Error("FILE_TOO_LARGE");
  await mkdir(path.join(root, folder), { recursive: true });
  await writeFile(path.join(root, folder, filename), bytes, { flag: "wx", mode: 0o640 });
  return { url: `/uploads/${folder}/${filename}`, name: file.name, mimeType: file.type, size: bytes.length };
}
