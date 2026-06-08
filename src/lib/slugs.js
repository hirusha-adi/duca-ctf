import { prisma } from "./db";
import { slugify } from "./utils";

function shortSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

async function isCompetitionSlugTaken(slug, excludeId) {
  const existing = await prisma.competition.findFirst({
    where: {
      slug,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  return !!existing;
}

async function isChallengeSlugTaken(slug, competitionId, excludeId) {
  const existing = await prisma.challenge.findFirst({
    where: {
      competitionId,
      slug,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  return !!existing;
}

export async function generateCompetitionSlug(name, excludeId) {
  const base = slugify(name).slice(0, 50) || "competition";
  let slug = base;

  for (let i = 0; i < 50; i++) {
    if (!(await isCompetitionSlugTaken(slug, excludeId))) {
      return slug;
    }
    slug = `${base}-${shortSuffix()}`.slice(0, 60);
  }

  throw new Error("SLUG_GENERATION_FAILED");
}

export async function generateChallengeSlug(title, competitionId, excludeId) {
  const base = slugify(title).slice(0, 50) || "challenge";
  let slug = base;

  for (let i = 0; i < 50; i++) {
    if (!(await isChallengeSlugTaken(slug, competitionId, excludeId))) {
      return slug;
    }
    slug = `${base}-${shortSuffix()}`.slice(0, 60);
  }

  throw new Error("SLUG_GENERATION_FAILED");
}
