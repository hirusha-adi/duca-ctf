import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getUploadFileExtension } from "./upload-files";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
]);

const MAX_SIZE = 10 * 1024 * 1024;

export async function saveSupportUpload(file) {
  if (!file || typeof file === "string") {
    throw new Error("NO_FILE");
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("INVALID_TYPE");
  }

  if (file.size > MAX_SIZE) {
    throw new Error("FILE_TOO_LARGE");
  }

  const ext = getUploadFileExtension(file.type);
  if (!ext) {
    throw new Error("INVALID_TYPE");
  }

  const uploadDir = process.env.UPLOAD_DIR || "public/uploads";
  const supportDir = path.join(process.cwd(), uploadDir, "support");
  await mkdir(supportDir, { recursive: true });

  const filename = `${uuidv4()}.${ext}`;
  const filepath = path.join(supportDir, filename);

  const bytes = await file.arrayBuffer();
  await writeFile(filepath, Buffer.from(bytes));

  return {
    url: `/uploads/support/${filename}`,
    name: file.name,
    mimeType: file.type,
    size: file.size,
  };
}
