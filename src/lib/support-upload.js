import { storeUpload } from "./upload-storage.mjs";

export async function saveSupportUpload(file) {
  return storeUpload(file, { folder: "support", maxSize: 10 * 1024 * 1024 });
}
