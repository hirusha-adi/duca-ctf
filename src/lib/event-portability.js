import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { hashFlag } from "./flags";
import { sanitizeHtml } from "./sanitize";
import { slugify } from "./utils";
import { bundlePortableAssets, restorePortableAssets, referencedAssetUrls } from "./event-assets.mjs";
import { PORTABILITY_FORMAT, PORTABILITY_VERSION, MAX_TOTAL_ASSET_BYTES, PortabilityError, portableChallengeFromRecord, rebaseCompetition, validatePortableDocument } from "./portability-schema.mjs";

const challengeInclude = {
  category: true,
  flags: { where: { retired: false }, orderBy: [{ order: "asc" }, { id: "asc" }] },
  hints: { where: { retired: false }, orderBy: [{ order: "asc" }, { id: "asc" }] },
  prerequisites: true,
  writeup: true,
};

export async function exportCompetitionDocument(id, { includeAssets = true, rootChallengeId } = {}) {
  const competition = await prisma.competition.findUnique({
    where: { id },
    include: { challenges: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: challengeInclude } },
  });
  if (!competition) throw new PortabilityError("Competition not found", 404);
  const keys = new Map(competition.challenges.map((challenge, index) => [challenge.id, `challenge-${index + 1}`]));
  let document = {
    format: PORTABILITY_FORMAT, version: PORTABILITY_VERSION, kind: "competition",
    competition: { name: competition.name, description: competition.description, descriptionFormat: competition.descriptionFormat, startAt: competition.startAt.toISOString(), endAt: competition.endAt.toISOString() },
    challenges: competition.challenges.map((challenge) => portableChallengeFromRecord(challenge, competition.startAt, keys)), assets: [],
  };
  if (rootChallengeId) {
    const rootKey = keys.get(rootChallengeId);
    if (!rootKey) throw new PortabilityError("Challenge not found", 404);
    const byKey = new Map(document.challenges.map((item) => [item.key, item]));
    const closure = new Set();
    function include(key) {
      if (closure.has(key)) return;
      const item = byKey.get(key);
      if (!item) throw new PortabilityError("A prerequisite is outside this competition");
      closure.add(key);
      item.prerequisites.forEach(include);
    }
    include(rootKey);
    document = { format: PORTABILITY_FORMAT, version: PORTABILITY_VERSION, kind: "challenge-bank", rootKey, challenges: document.challenges.filter((item) => closure.has(item.key)), assets: [] };
  }
  if (includeAssets) document = await bundlePortableAssets(document);
  return validatePortableDocument(document, rootChallengeId ? "challenge-bank" : "competition");
}

export async function snapshotChallengeForBank(challengeId) {
  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId }, select: { competitionId: true } });
  if (!challenge) throw new PortabilityError("Challenge not found", 404);
  return exportCompetitionDocument(challenge.competitionId, { rootChallengeId: challengeId });
}

function cleanContent(content, format) { return format === "RICHTEXT" ? sanitizeHtml(content) : content; }

async function prepareChallenges(challenges) {
  const prepared = [];
  for (const challenge of challenges) {
    prepared.push({
      ...challenge,
      description: cleanContent(challenge.description, challenge.descriptionFormat),
      flags: await Promise.all(challenge.flags.map(async (flag, order) => ({ ...flag, order, flagHash: await hashFlag(flag.value) }))),
      hints: challenge.hints.map((hint, order) => ({ ...hint, order, content: cleanContent(hint.content, hint.contentFormat) })),
      writeup: challenge.writeup ? { ...challenge.writeup, content: cleanContent(challenge.writeup.content, challenge.writeup.contentFormat) } : null,
    });
  }
  return prepared;
}

async function uniqueSlug(tx, model, name, competitionId) {
  const base = slugify(name).slice(0, 50) || model;
  for (let attempt = 0; attempt < 30; attempt++) {
    const slug = attempt ? `${base}-${randomUUID().slice(0, 8)}` : base;
    const exists = await tx[model].findFirst({ where: { slug, ...(competitionId ? { competitionId } : {}) }, select: { id: true } });
    if (!exists) return slug;
  }
  throw new PortabilityError("Could not generate a unique slug. Please try again", 409);
}

async function categoryForName(tx, name, cache) {
  if (cache.has(name)) return cache.get(name);
  let category = await tx.category.findUnique({ where: { name } });
  if (!category) category = await tx.category.create({ data: { name, slug: await uniqueSlug(tx, "category", name) } });
  cache.set(name, category.id);
  return category.id;
}

async function createChallenges(tx, competition, challenges, { forceHidden = false } = {}) {
  const categoryIds = new Map();
  const ids = new Map();
  const created = [];
  const duration = (competition.endAt - competition.startAt) / 1000;
  if (challenges.some((challenge) => challenge.releaseOffsetSeconds > duration)) throw new PortabilityError("A challenge release falls after the destination competition ends");
  for (const challenge of challenges) {
    const record = await tx.challenge.create({ data: {
      competitionId: competition.id, categoryId: await categoryForName(tx, challenge.category, categoryIds),
      title: challenge.title, slug: await uniqueSlug(tx, "challenge", challenge.title, competition.id), points: challenge.points,
      description: challenge.description, descriptionFormat: challenge.descriptionFormat,
      startAt: new Date(competition.startAt.getTime() + challenge.releaseOffsetSeconds * 1000),
      submitLimit: challenge.submitLimit, hidden: forceHidden || challenge.hidden,
      ...(challenge.hosting ? {
        hosted: challenge.hosting.hosted,
        // Reused definitions always need an explicit organizer opt-in to run.
        hostingEnabled: false,
        hostingInternetEnabled: challenge.hosting.internetEnabled,
        ...(challenge.hosting.template ? { hostingTemplate: challenge.hosting.template, hostingVersion: 1 } : {}),
      } : {}),
      flags: { create: challenge.flags }, hints: { create: challenge.hints },
      ...(challenge.writeup ? { writeup: { create: challenge.writeup } } : {}),
    }, select: { id: true, title: true, slug: true } });
    ids.set(challenge.key, record.id);
    created.push(record);
  }
  const dependencies = challenges.flatMap((challenge) => challenge.prerequisites.map((required) => ({ challengeId: ids.get(challenge.key), requiredChallengeId: ids.get(required) })));
  if (dependencies.length) await tx.challengePrerequisite.createMany({ data: dependencies });
  return created;
}

async function atomicWrite(operation) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await prisma.$transaction(operation, { isolationLevel: "Serializable", timeout: 30_000, maxWait: 10_000 }); }
    catch (error) {
      if (attempt < 2 && ["P2002", "P2034"].includes(error.code)) continue;
      throw error;
    }
  }
}

export async function importCompetitionDocument(input, options = {}) {
  const validated = rebaseCompetition(input, options);
  const restored = await restorePortableAssets(validated);
  try {
    const challenges = await prepareChallenges(restored.document.challenges);
    const competition = await atomicWrite(async (tx) => {
      const info = restored.document.competition;
      const record = await tx.competition.create({ data: {
        name: info.name, slug: await uniqueSlug(tx, "competition", info.name),
        description: cleanContent(info.description, info.descriptionFormat), descriptionFormat: info.descriptionFormat,
        startAt: new Date(info.startAt), endAt: new Date(info.endAt), hidden: true, status: "DRAFT",
      } });
      await createChallenges(tx, record, challenges);
      return record;
    });
    return competition;
  } catch (error) { await restored.cleanup(); throw error; }
}

export async function cloneCompetition(id, options = {}) {
  const document = await exportCompetitionDocument(id);
  return importCompetitionDocument(document, { ...options, name: options.name || `${document.competition.name} (copy)` });
}

export async function saveChallengeBankDocument(input) {
  const document = validatePortableDocument(input, "challenge-bank");
  const root = document.challenges.find((challenge) => challenge.key === document.rootKey);
  // Validate every image now; importing into the bank should not save a broken
  // definition that only fails later when an organizer tries to deploy it.
  const referenced = referencedAssetUrls(document);
  if (referenced.size !== document.assets.length || document.assets.some((asset) => !referenced.has(asset.url))) throw new PortabilityError("Every local image must be bundled with its challenge definition");
  const { imageContentType } = await import("./event-assets.mjs");
  document.assets.forEach((asset) => imageContentType(Buffer.from(asset.data, "base64")));
  return prisma.challengeBankEntry.create({ data: { title: root.title, categoryName: root.category, definition: document } });
}

export async function deployChallengeBankEntries(entryIds, competitionId) {
  if (!Array.isArray(entryIds) || !entryIds.length || entryIds.length > 30 || entryIds.some((id) => typeof id !== "string" || id.length > 100) || new Set(entryIds).size !== entryIds.length) throw new PortabilityError("Select between 1 and 30 distinct challenge bank entries");
  if (typeof competitionId !== "string" || !competitionId || competitionId.length > 100) throw new PortabilityError("Select a destination competition");
  const entries = await prisma.challengeBankEntry.findMany({ where: { id: { in: entryIds } } });
  if (entries.length !== entryIds.length) throw new PortabilityError("A selected challenge bank entry was not found", 404);
  const documents = entries.map((entry) => validatePortableDocument(entry.definition, "challenge-bank"));
  const challengeCount = documents.reduce((sum, document) => sum + document.challenges.length, 0);
  const flagCount = documents.reduce((sum, document) => sum + document.challenges.reduce((count, challenge) => count + challenge.flags.length, 0), 0);
  const assetBytes = documents.reduce((sum, document) => sum + document.assets.reduce((count, asset) => count + Buffer.byteLength(asset.data, "base64"), 0), 0);
  if (challengeCount > 100 || flagCount > 500) throw new PortabilityError("Select fewer entries: deployment is limited to 100 challenges and 500 flags including prerequisites");
  if (assetBytes > MAX_TOTAL_ASSET_BYTES) throw new PortabilityError("Select fewer entries: deployment images must total at most 20 MB");
  const restored = [];
  try {
    const challenges = [];
    for (let index = 0; index < documents.length; index++) {
      const files = await restorePortableAssets(documents[index]);
      restored.push(files);
      const prefix = `entry-${index}-`;
      challenges.push(...files.document.challenges.map((challenge) => ({ ...challenge, key: prefix + challenge.key, prerequisites: challenge.prerequisites.map((key) => prefix + key) })));
    }
    const prepared = await prepareChallenges(challenges);
    return await atomicWrite(async (tx) => {
      const competition = await tx.competition.findUnique({ where: { id: competitionId } });
      if (!competition) throw new PortabilityError("Destination competition not found", 404);
      return createChallenges(tx, competition, prepared, { forceHidden: true });
    });
  } catch (error) { await Promise.all(restored.map((files) => files.cleanup())); throw error; }
}
