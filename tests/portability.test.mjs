import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parsePortableYaml, stringifyPortableYaml, validatePortableDocument, portableChallengeFromRecord, rebaseCompetition } from "../src/lib/portability-schema.mjs";
import { bundlePortableAssets, restorePortableAssets, imageContentType, referencedAssetUrls, replaceLocalAssetUrls } from "../src/lib/event-assets.mjs";
import { storeUpload } from "../src/lib/upload-storage.mjs";

function challenge(overrides = {}) {
  return { key: "intro", title: "Introduction", category: "Crypto", points: 100, description: "Find the flag", descriptionFormat: "MARKDOWN", releaseOffsetSeconds: 0, submitLimit: 10, hidden: false, flags: [{ value: "DUCA{secret}", label: "Answer" }], hints: [{ title: "Start here", content: "Inspect the file", cost: 10 }], prerequisites: [], writeup: { content: "Solution", contentFormat: "MARKDOWN", images: [] }, ...overrides };
}
function event(overrides = {}) {
  return { format: "duca-ctf", version: 1, kind: "competition", competition: { name: "Autumn CTF", description: "Training", startAt: "2026-10-01T00:00:00Z", endAt: "2026-10-02T00:00:00Z" }, challenges: [challenge()], assets: [], ...overrides };
}

test("event YAML round trip retains flags, content formats, hints, writeups and prerequisite keys", () => {
  const document = event({ challenges: [challenge(), challenge({ key: "advanced", title: "Advanced", releaseOffsetSeconds: 3600, prerequisites: ["intro"], descriptionFormat: "RICHTEXT", description: "<p>Advanced</p>" })] });
  const source = stringifyPortableYaml(document);
  assert.match(source, /contains secret flag answers/);
  assert.deepEqual(parsePortableYaml(source, "competition"), validatePortableDocument(document));
});

test("rebase keeps event duration and challenge release intervals", () => {
  const document = event({ challenges: [challenge({ releaseOffsetSeconds: 3600 })] });
  const result = rebaseCompetition(document, { name: "Next event", startAt: "2027-03-15T10:00:00+11:00" });
  assert.equal(result.competition.name, "Next event");
  assert.equal(result.competition.startAt, "2027-03-14T23:00:00.000Z");
  assert.equal(result.competition.endAt, "2027-03-15T23:00:00.000Z");
  assert.equal(result.challenges[0].releaseOffsetSeconds, 3600);
  assert.equal(document.competition.name, "Autumn CTF");
});

test("invalid dependencies are rejected before any database writes", () => {
  assert.throws(() => validatePortableDocument(event({ challenges: [challenge({ prerequisites: ["missing"] })] })), /Missing prerequisite/);
  assert.throws(() => validatePortableDocument(event({ challenges: [challenge({ prerequisites: ["next"] }), challenge({ key: "next", prerequisites: ["intro"] })] })), /cycle/);
  assert.throws(() => validatePortableDocument(event({ challenges: [challenge(), challenge()] })), /unique/);
});

test("unknown fields, unsupported versions, invalid schedules and oversized values are rejected", () => {
  assert.throws(() => validatePortableDocument(event({ version: 2 })), /Unsupported/);
  assert.throws(() => validatePortableDocument(event({ users: [{ email: "private@example.com" }] })), /Unknown document field/);
  assert.throws(() => validatePortableDocument(event({ challenges: [challenge({ releaseOffsetSeconds: 86401 })] })), /after the competition ends/);
  assert.throws(() => validatePortableDocument(event({ challenges: [challenge({ points: -1 })] })), /Points/);
  assert.throws(() => validatePortableDocument(event({ challenges: [challenge({ hints: [{ content: "x", cost: 1_000_001 }] })] })), /Hint cost/);
  assert.throws(() => validatePortableDocument(event({ challenges: [challenge({ hints: [{ content: "x".repeat(100_001), cost: 0 }] })] })), /Hint content/);
  assert.throws(() => validatePortableDocument(event({ challenges: [challenge({ flags: [{ value: "x" }, { value: "x" }] })] })), /Duplicate flag/);
  assert.throws(() => validatePortableDocument(event({ challenges: Array.from({ length: 101 }, (_, index) => challenge({ key: `c-${index}` })) })), /at most 100/);
  const invalidDay = event();
  invalidDay.competition.startAt = "2026-02-30T00:00:00Z";
  assert.throws(() => validatePortableDocument(invalidDay), /calendar date/);
});

test("YAML aliases, custom types, duplicate mapping keys and prototype fields are rejected", () => {
  for (const source of ["format: &format duca-ctf\nversion: 1\nkind: *format", "format: !custom duca-ctf", "format: duca-ctf\nformat: other", "__proto__: {polluted: true}"]) {
    assert.throws(() => parsePortableYaml(source));
  }
  assert.equal({}.polluted, undefined);
});

test("bank snapshots must include exactly the root's prerequisite closure", () => {
  const document = { format: "duca-ctf", version: 1, kind: "challenge-bank", rootKey: "advanced", challenges: [challenge(), challenge({ key: "advanced", prerequisites: ["intro"] })] };
  assert.equal(validatePortableDocument(document).challenges.length, 2);
  assert.throws(() => validatePortableDocument({ ...document, rootKey: "missing" }), /Root challenge/);
  assert.throws(() => validatePortableDocument({ ...document, rootKey: "intro" }), /only include the root/);
});

test("record export excludes retired flags/hints and all participant activity", () => {
  const record = { id: "c1", title: "Test", category: { name: "Web" }, points: 25, description: "Task", descriptionFormat: "MARKDOWN", startAt: new Date("2026-10-01T01:00:00Z"), submitLimit: null, hidden: true, flags: [{ value: "active", label: "A", retired: false }, { value: "retired", retired: true }], hints: [{ title: "H", content: "Hint", contentFormat: "MARKDOWN", cost: 5 }, { content: "Old", retired: true }], prerequisites: [{ requiredChallengeId: "c2" }], writeup: null, solves: [{ userId: "private" }], supportTickets: [{ subject: "private" }] };
  const output = portableChallengeFromRecord(record, "2026-10-01T00:00:00Z", new Map([["c1", "main"], ["c2", "intro"]]));
  assert.deepEqual(output.flags, [{ value: "active", label: "A" }]);
  assert.equal(output.hints.length, 1);
  assert.equal(output.releaseOffsetSeconds, 3600);
  assert.deepEqual(output.prerequisites, ["intro"]);
  assert.equal(output.solves, undefined);
  assert.equal(output.supportTickets, undefined);
});

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmN8AAAAASUVORK5CYII=", "base64");

test("uploaded images travel with exported content, restore to fresh paths, and can be rolled back", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "duca-export-"));
  const destinationRoot = await mkdtemp(path.join(os.tmpdir(), "duca-import-"));
  try {
    const upload = await storeUpload({ name: "tiny.png", type: "image/png", size: tinyPng.length, arrayBuffer: async () => tinyPng }, { folder: "writeups", maxSize: 1000, imagesOnly: true, root: sourceRoot });
    const document = validatePortableDocument(event({ challenges: [challenge({ description: `![Image](${upload.url})`, writeup: { content: `<img src="${upload.url}">`, contentFormat: "RICHTEXT", images: [upload.url] } })] }));
    const bundled = await bundlePortableAssets(document, sourceRoot);
    assert.equal(bundled.assets.length, 1);
    assert.equal(bundled.assets[0].data, tinyPng.toString("base64"));
    const restored = await restorePortableAssets(parsePortableYaml(stringifyPortableYaml(bundled)), destinationRoot);
    const newUrl = restored.document.challenges[0].writeup.images[0];
    assert.notEqual(newUrl, upload.url);
    assert.match(restored.document.challenges[0].description, new RegExp(newUrl));
    const newPath = path.join(destinationRoot, ...newUrl.slice("/uploads/".length).split("/"));
    assert.deepEqual(await readFile(newPath), tinyPng);
    await restored.cleanup();
    await assert.rejects(stat(newPath), { code: "ENOENT" });
  } finally { await Promise.all([rm(sourceRoot, { recursive: true, force: true }), rm(destinationRoot, { recursive: true, force: true })]); }
});

test("assets cannot restore active content, traverse folders or omit referenced images", async () => {
  assert.throws(() => imageContentType(Buffer.from("<script>alert(1)</script>")), /must be PNG/);
  assert.throws(() => validatePortableDocument(event({ assets: [{ url: "/uploads/writeups/../../secret.png", data: tinyPng.toString("base64") }] })), /public writeup image/);
  const root = await mkdtemp(path.join(os.tmpdir(), "duca-missing-"));
  try {
    const missing = validatePortableDocument(event({ challenges: [challenge({ description: "![Missing](/uploads/writeups/image.png)" })] }));
    await assert.rejects(restorePortableAssets(missing, root), /Missing bundled image/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("remote URLs with an upload path are neither bundled nor rewritten", async () => {
  const local = "/uploads/writeups/12345678-1234-1234-1234-123456789abc.png";
  const remote = `https://cdn.example.org${local}`;
  const query = `https://cdn.example.org/image?url=${local}`;
  const content = `![local](${local}) ![remote](${remote}) <img src="${local}"><img src="${remote}"> ${query}`;
  const document = validatePortableDocument(event({ challenges: [challenge({ description: content })] }));
  assert.deepEqual([...referencedAssetUrls(document)], [local]);
  const replaced = replaceLocalAssetUrls(content, () => "/new-image.png");
  assert.match(replaced, /!\[local\]\(\/new-image.png\)/);
  assert.ok(replaced.includes(`![remote](${remote})`));
  assert.ok(replaced.includes(`<img src="${remote}">`));
  assert.ok(replaced.includes(query));
  const remoteOnly = validatePortableDocument(event({ challenges: [challenge({ description: `![remote](${remote})` })] }));
  assert.deepEqual((await bundlePortableAssets(remoteOnly)).assets, []);
  const restored = await restorePortableAssets(remoteOnly);
  assert.equal(restored.document.challenges[0].description, remoteOnly.challenges[0].description);
});
