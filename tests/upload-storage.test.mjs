import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getUploadRoot, resolveUploadPath, storeUpload, getStoredUpload } from "../src/lib/upload-storage.mjs";

test("absolute production uploads use the mounted directory", () => {
  assert.equal(getUploadRoot("/app/data/uploads", "/app"), "/app/data/uploads");
  assert.equal(getUploadRoot("public/uploads", "/app"), "/app/public/uploads");
});

test("stored uploads round trip and traversal or symlink escapes are rejected", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "duca-uploads-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "duca-outside-"));
  try {
    const upload = await storeUpload(new File(["hello"], "notes.txt", { type: "text/plain" }), {
      folder: "support", maxSize: 1024, root,
    });
    const parts = upload.url.split("/").slice(2);
    const file = await getStoredUpload(parts, root);
    assert.equal(await readFile(file.path, "utf8"), "hello");
    assert.equal(file.size, 5);
    assert.equal(resolveUploadPath(["support", "../../.env"], root), null);
    assert.equal(resolveUploadPath(["../support", parts[1]], root), null);
    assert.equal(resolveUploadPath(["support", "a.svg"], root), null);
    const escaped = `00000000-0000-0000-0000-000000000000.txt`;
    await symlink(outside, path.join(root, "support", escaped));
    assert.equal(await getStoredUpload(["support", escaped], root), null);
  } finally {
    await Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]);
  }
});

test("uploads enforce type and byte limits", async () => {
  await assert.rejects(storeUpload(new File(["hello"], "a.txt", { type: "text/plain" }), {
    folder: "writeups", maxSize: 1024, imagesOnly: true,
  }), /INVALID_TYPE/);
  await assert.rejects(storeUpload(new File(["hello"], "a.txt", { type: "text/plain" }), {
    folder: "support", maxSize: 4,
  }), /FILE_TOO_LARGE/);
});
