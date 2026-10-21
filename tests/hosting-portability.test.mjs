import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHostingTemplate } from "../src/lib/hosting/template.mjs";
import { parsePortableYaml, stringifyPortableYaml, validatePortableDocument, portableChallengeFromRecord } from "../src/lib/portability-schema.mjs";

function event(hosting) {
  return {
    format: "duca-ctf", version: 1, kind: "competition",
    competition: { name: "Hosted event", startAt: "2026-10-21T00:00:00Z", endAt: "2026-10-22T00:00:00Z" },
    challenges: [{ key: "web", title: "Web", category: "Web", points: 100, flags: [{ value: "DUCA{secret}" }], ...(hosting ? { hosting } : {}) }],
  };
}

test("version one exports optionally preserve hosted templates and bundled configuration", () => {
  const template = normalizeHostingTemplate("services: {web: {image: nginx:alpine, volumes: ['./site.conf:/etc/nginx/conf.d/default.conf:ro']}}", { "site.conf": Buffer.from("server {}").toString("base64") });
  const original = event({ hosted: true, enabled: true, internetEnabled: false, template });
  const roundTrip = parsePortableYaml(stringifyPortableYaml(original));
  assert.deepEqual(roundTrip.challenges[0].hosting.template, template);
  assert.equal(roundTrip.challenges[0].hosting.enabled, true);
  assert.equal(validatePortableDocument(event()).challenges[0].hosting, undefined);
});

test("hosting templates in imports use the same validation as admin configuration", () => {
  assert.throws(() => validatePortableDocument(event({ hosted: true, enabled: true, template: { services: { web: { image: "nginx", privileged: true } } } })), /hosting template/);
  assert.throws(() => validatePortableDocument(event({ hosted: true, enabled: true })), /requires/);
  assert.throws(() => validatePortableDocument(event({ hosted: false, enabled: true, template: normalizeHostingTemplate("services: {web: {image: nginx}}")})), /requires/);
});

test("configuration bytes have a separate bounded allowance from event prose", () => {
  const template = normalizeHostingTemplate("services: {web: {image: nginx, volumes: ['./settings.txt:/settings.txt:ro']}}", { "settings.txt": Buffer.alloc(2 * 1024 * 1024, 97).toString("base64") });
  assert.equal(validatePortableDocument(event({ hosted: true, enabled: false, template })).challenges[0].hosting.template.files["settings.txt"], template.files["settings.txt"]);
});

test("record export includes reusable hosting definitions without runtime or credential records", () => {
  const template = normalizeHostingTemplate("services: {web: {image: nginx}}");
  const record = {
    id: "web", title: "Web", category: { name: "Web" }, points: 100,
    description: "", descriptionFormat: "MARKDOWN", startAt: "2026-10-21T00:00:00Z", submitLimit: null, hidden: false,
    flags: [{ value: "DUCA{secret}", label: "" }], hints: [], prerequisites: [],
    hosted: true, hostingEnabled: true, hostingInternetEnabled: false, hostingTemplate: template,
    hostedInstances: [{ id: "private-runtime", userId: "private-user" }],
  };
  const result = portableChallengeFromRecord(record, record.startAt, new Map([["web", "web"]]));
  assert.equal(result.hosting.hosted, true);
  assert.deepEqual(result.hosting.template, template);
  assert.equal(result.hostedInstances, undefined);
});
