import { parseDocument, stringify, visit } from "yaml";

export const PORTABILITY_FORMAT = "duca-ctf";
export const PORTABILITY_VERSION = 1;
export const MAX_PORTABILITY_BYTES = 32 * 1024 * 1024;
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_ASSET_BYTES = 20 * 1024 * 1024;
const MAX_TEXT = 250_000;

export class PortabilityError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function fail(message) { throw new PortabilityError(message); }
function object(value, label, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`Unknown ${label} field: ${key}`);
  }
  return value;
}
function text(value, label, { max = MAX_TEXT, fallback, trim = false, required = false } = {}) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || value.length > max) fail(`${label} must be text of at most ${max} characters`);
  const result = trim ? value.trim() : value;
  if (required && !result) fail(`${label} is required`);
  return result;
}
function integer(value, label, { min = 0, max = 2_147_483_647, fallback } = {}) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${label} must be an integer between ${min} and ${max}`);
  return value;
}
function list(value, label, max, fallback = []) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length > max) fail(`${label} must be a list of at most ${max} items`);
  return value;
}
function format(value) {
  if (value === undefined) return "MARKDOWN";
  if (!["MARKDOWN", "RICHTEXT"].includes(value)) fail("Content format must be MARKDOWN or RICHTEXT");
  return value;
}
function boolean(value, label, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail(`${label} must be a boolean`);
  return value;
}
function key(value, label) {
  const result = text(value, label, { max: 160, required: true });
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) fail(`${label} may only contain letters, numbers, underscores and dashes`);
  return result;
}
export function isoDate(value, label = "Date") {
  const result = text(value, label, { max: 40, required: true });
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(result) || !Number.isFinite(Date.parse(result))) fail(`${label} must be a valid ISO 8601 date with a timezone`);
  const [year, month, day] = result.slice(0, 10).split("-").map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month, 0);
  if (month < 1 || month > 12 || day < 1 || day > calendar.getUTCDate() || Number(result.slice(11, 13)) > 23) fail(`${label} must be a valid calendar date`);
  return new Date(result).toISOString();
}

export function validatePortableChallenge(value) {
  object(value, "challenge", ["key", "title", "category", "points", "description", "descriptionFormat", "releaseOffsetSeconds", "submitLimit", "hidden", "flags", "hints", "prerequisites", "writeup"]);
  const flags = list(value.flags, "Flags", 20).map((flag) => {
    object(flag, "flag", ["value", "label"]);
    return { value: text(flag.value, "Flag value", { max: 4096, trim: true, required: true }), label: text(flag.label, "Flag label", { max: 200, fallback: "" }) };
  });
  if (!flags.length) fail("Every challenge needs at least one active flag");
  if (new Set(flags.map((flag) => flag.value)).size !== flags.length) fail("Duplicate flag values in a challenge are not allowed");
  const hints = list(value.hints, "Hints", 50).map((hint) => {
    object(hint, "hint", ["title", "content", "contentFormat", "cost"]);
    return { title: text(hint.title, "Hint title", { max: 200, fallback: "" }), content: text(hint.content, "Hint content", { max: 100_000, required: true }), contentFormat: format(hint.contentFormat), cost: integer(hint.cost, "Hint cost", { max: 1_000_000, fallback: 0 }) };
  });
  let writeup = null;
  if (value.writeup != null) {
    object(value.writeup, "writeup", ["content", "contentFormat", "images"]);
    writeup = { content: text(value.writeup.content, "Writeup content", { fallback: "" }), contentFormat: format(value.writeup.contentFormat), images: list(value.writeup.images, "Writeup images", 100).map((image) => {
      if (typeof image === "string") return text(image, "Image URL", { max: 2048 });
      object(image, "writeup image", ["url", "alt", "name"]);
      return { url: text(image.url, "Image URL", { max: 2048, required: true }), ...(image.alt !== undefined ? { alt: text(image.alt, "Image alt", { max: 1000 }) } : {}), ...(image.name !== undefined ? { name: text(image.name, "Image name", { max: 200 }) } : {}) };
    }) };
  }
  return {
    key: key(value.key, "Challenge key"), title: text(value.title, "Challenge title", { max: 200, trim: true, required: true }),
    category: text(value.category, "Category", { max: 200, trim: true, required: true }), points: integer(value.points, "Points"),
    description: text(value.description, "Description", { fallback: "" }), descriptionFormat: format(value.descriptionFormat),
    releaseOffsetSeconds: integer(value.releaseOffsetSeconds, "Release offset", { max: 315_576_000, fallback: 0 }),
    submitLimit: value.submitLimit == null ? null : integer(value.submitLimit, "Submission limit", { min: 1 }),
    hidden: boolean(value.hidden, "Hidden"), flags, hints,
    prerequisites: [...new Set(list(value.prerequisites, "Prerequisites", 100).map((item) => key(item, "Prerequisite key")))], writeup,
  };
}

export function validatePortableDocument(value, expectedKind) {
  object(value, "document", ["format", "version", "kind", "competition", "rootKey", "challenges", "assets"]);
  if (value.format !== PORTABILITY_FORMAT || value.version !== PORTABILITY_VERSION) fail("Unsupported format. Expected DUCA CTF YAML version 1");
  if (!["competition", "challenge-bank"].includes(value.kind) || (expectedKind && value.kind !== expectedKind)) fail(`Expected a ${expectedKind || "competition or challenge-bank"} document`);
  const challenges = list(value.challenges, "Challenges", 100).map(validatePortableChallenge);
  if (new Set(challenges.map((challenge) => challenge.key)).size !== challenges.length) fail("Challenge keys must be unique");
  if (challenges.reduce((count, challenge) => count + challenge.flags.length, 0) > 500) fail("A document can contain at most 500 flags");
  const byKey = new Map(challenges.map((challenge) => [challenge.key, challenge]));
  const visited = new Set();
  const visiting = new Set();
  function check(key) {
    if (visiting.has(key)) fail("Challenge prerequisites contain a cycle");
    if (visited.has(key)) return;
    visiting.add(key);
    for (const prerequisite of byKey.get(key).prerequisites) {
      if (!byKey.has(prerequisite)) fail(`Missing prerequisite challenge: ${prerequisite}`);
      check(prerequisite);
    }
    visiting.delete(key);
    visited.add(key);
  }
  for (const challenge of challenges) check(challenge.key);
  let competition;
  let rootKey;
  if (value.kind === "competition") {
    if (value.rootKey !== undefined) fail("Competition documents cannot have a rootKey");
    object(value.competition, "competition", ["name", "description", "descriptionFormat", "startAt", "endAt"]);
    competition = { name: text(value.competition.name, "Competition name", { max: 200, trim: true, required: true }), description: text(value.competition.description, "Competition description", { fallback: "" }), descriptionFormat: format(value.competition.descriptionFormat), startAt: isoDate(value.competition.startAt, "Start time"), endAt: isoDate(value.competition.endAt, "End time") };
    const duration = (Date.parse(competition.endAt) - Date.parse(competition.startAt)) / 1000;
    if (duration <= 0) fail("Competition must end after its start time");
    if (challenges.some((challenge) => challenge.releaseOffsetSeconds > duration)) fail("A challenge starts after the competition ends");
  } else {
    if (value.competition !== undefined) fail("Challenge bank documents cannot have a competition");
    rootKey = key(value.rootKey, "Root key");
    if (!byKey.has(rootKey)) fail("Root challenge is missing");
    const reachable = new Set();
    function collect(key) { if (reachable.has(key)) return; reachable.add(key); byKey.get(key).prerequisites.forEach(collect); }
    collect(rootKey);
    if (reachable.size !== challenges.length) fail("Challenge bank documents may only include the root and its prerequisites");
  }
  let totalAssetBytes = 0;
  const assetUrls = new Set();
  const assets = list(value.assets, "Assets", 100).map((asset) => {
    object(asset, "asset", ["url", "data"]);
    const url = text(asset.url, "Asset URL", { max: 250, required: true });
    if (!/^\/uploads\/writeups\/[a-zA-Z0-9_-]+\.(png|jpe?g|gif|webp)$/.test(url) || assetUrls.has(url)) fail("Asset URLs must be unique public writeup image paths");
    assetUrls.add(url);
    const data = text(asset.data, "Asset data", { max: Math.ceil(MAX_ASSET_BYTES / 3) * 4, required: true });
    if (data.length % 4 || Buffer.from(data, "base64").toString("base64") !== data) fail("Asset data must be canonical base64");
    const length = (data.length / 4) * 3 - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
    if (length > MAX_ASSET_BYTES) fail("Each asset must be at most 5 MB");
    totalAssetBytes += length;
    return { url, data };
  });
  if (totalAssetBytes > MAX_TOTAL_ASSET_BYTES) fail("Assets must total at most 20 MB");
  const result = { format: PORTABILITY_FORMAT, version: PORTABILITY_VERSION, kind: value.kind, ...(competition ? { competition } : { rootKey }), challenges, assets };
  const metadataBytes = Buffer.byteLength(JSON.stringify({ ...result, assets: [] }));
  if (metadataBytes > 2 * 1024 * 1024) fail("Event text and definitions must total at most 2 MB");
  return result;
}

export function parsePortableYaml(source, expectedKind) {
  if (typeof source !== "string" || Buffer.byteLength(source) > MAX_PORTABILITY_BYTES) fail("YAML file must be at most 32 MB");
  let document;
  try {
    document = parseDocument(source, { schema: "core", customTags: [], resolveKnownTags: false, merge: false, uniqueKeys: true });
    if (document.errors.length || document.warnings.length) fail("Invalid YAML: unsupported tag, duplicate key or syntax error");
    visit(document, (_key, node) => {
      if (node?.tag || node?.constructor?.name === "Alias") fail("YAML aliases and explicit tags are not supported");
    });
    return validatePortableDocument(document.toJS({ maxAliasCount: 0 }), expectedKind);
  } catch (error) {
    if (error instanceof PortabilityError) throw error;
    fail("Invalid YAML document");
  }
}

export function stringifyPortableYaml(document) {
  return "# DUCA CTF export: contains secret flag answers. Store privately.\n" + stringify(validatePortableDocument(document), { lineWidth: 100 });
}

export function portableChallengeFromRecord(challenge, competitionStartAt, keyById) {
  return {
    key: keyById.get(challenge.id), title: challenge.title, category: challenge.category.name, points: challenge.points,
    description: challenge.description, descriptionFormat: challenge.descriptionFormat,
    releaseOffsetSeconds: Math.max(0, Math.round((new Date(challenge.startAt) - new Date(competitionStartAt)) / 1000)),
    submitLimit: challenge.submitLimit, hidden: challenge.hidden,
    flags: challenge.flags.filter((flag) => !flag.retired).map(({ value, label }) => ({ value, label })),
    hints: (challenge.hints || []).filter((hint) => !hint.retired).map(({ title, content, contentFormat, cost }) => ({ title, content, contentFormat, cost })),
    prerequisites: (challenge.prerequisites || []).map(({ requiredChallengeId }) => {
      const mapped = keyById.get(requiredChallengeId);
      if (!mapped) fail("A prerequisite is outside the exported competition");
      return mapped;
    }),
    writeup: challenge.writeup ? { content: challenge.writeup.content, contentFormat: challenge.writeup.contentFormat, images: challenge.writeup.images || [] } : null,
  };
}

export function rebaseCompetition(document, { name, startAt } = {}) {
  const result = validatePortableDocument(document, "competition");
  if (name !== undefined) result.competition.name = text(name, "Competition name", { max: 200, trim: true, required: true });
  if (startAt !== undefined && startAt !== "") {
    const start = isoDate(startAt, "New start time");
    const duration = Date.parse(result.competition.endAt) - Date.parse(result.competition.startAt);
    result.competition.startAt = start;
    result.competition.endAt = new Date(Date.parse(start) + duration).toISOString();
  }
  return result;
}
