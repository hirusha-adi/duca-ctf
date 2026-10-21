import { readFile, unlink } from "node:fs/promises";
import { getStoredUpload, getUploadRoot, storeUpload } from "./upload-storage.mjs";
import { MAX_ASSET_BYTES, MAX_TOTAL_ASSET_BYTES, PortabilityError } from "./portability-schema.mjs";
import { mapPortableContent, referencedAssetUrls, replaceLocalAssetUrls } from "./portability-content.mjs";
export { mapPortableContent, referencedAssetUrls, replaceLocalAssetUrls } from "./portability-content.mjs";

export function imageContentType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return "image/gif";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  throw new PortabilityError("Bundled assets must be PNG, JPEG, GIF or WebP images");
}

export async function bundlePortableAssets(document, root = getUploadRoot()) {
  const assets = [];
  let total = 0;
  for (const url of referencedAssetUrls(document)) {
    const upload = await getStoredUpload(["writeups", url.split("/").at(-1)], root);
    if (!upload) throw new PortabilityError(`Referenced image is unavailable: ${url}`);
    if (upload.size > MAX_ASSET_BYTES) throw new PortabilityError("Each exported image must be at most 5 MB");
    const bytes = await readFile(upload.path);
    if (bytes.length > MAX_ASSET_BYTES) throw new PortabilityError("Each exported image must be at most 5 MB");
    total += bytes.length;
    if (total > MAX_TOTAL_ASSET_BYTES) throw new PortabilityError("Exported images must total at most 20 MB");
    imageContentType(bytes);
    assets.push({ url, data: bytes.toString("base64") });
  }
  return { ...document, assets };
}

// Files are written before the database transaction. A failed transaction removes
// only these fresh files, never an upload referenced by an existing event.
export async function restorePortableAssets(document, root = getUploadRoot()) {
  const replacements = new Map();
  const createdPaths = [];
  const cleanup = async () => { await Promise.all(createdPaths.map((file) => unlink(file).catch(() => {}))); };
  try {
    const referenced = referencedAssetUrls(document);
    for (const asset of document.assets) {
      if (!referenced.has(asset.url)) throw new PortabilityError("Document contains an image that is not referenced by its content");
      const bytes = Buffer.from(asset.data, "base64");
      const type = imageContentType(bytes);
      const file = { name: asset.url.split("/").at(-1), type, size: bytes.length, arrayBuffer: async () => bytes };
      const stored = await storeUpload(file, { folder: "writeups", maxSize: MAX_ASSET_BYTES, imagesOnly: true, root });
      const info = await getStoredUpload(["writeups", stored.url.split("/").at(-1)], root);
      if (!info) throw new PortabilityError("Could not restore bundled image", 500);
      createdPaths.push(info.path);
      replacements.set(asset.url, stored.url);
    }
    // Every local image must travel with its definition. Remote URLs stay remote.
    for (const url of referenced) {
      if (!replacements.has(url)) throw new PortabilityError(`Missing bundled image: ${url}`);
    }
    return {
      document: mapPortableContent(document, (content) => replaceLocalAssetUrls(content, (url) => replacements.get(url) || url)),
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
