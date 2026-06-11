/**
 * Dev-only test data seeder.
 *
 * Creates sample competitions, challenges, flags, writeups, custom pages,
 * solves, and submission activity logs for existing users.
 *
 * Usage:
 *   npm run db:seed:test
 *   npm run db:seed:test -- --force   # re-randomize submissions
 *
 * Requires: existing users (log in at least once), categories (npm run db:seed).
 * Refuses to run when NODE_ENV=production. Not used by Docker or production deploy.
 */

const bcrypt = require("bcryptjs");
const { createPrismaClient } = require("./create-client");

const DEV_PREFIX = "dev-seed-";

const DEFAULT_CATEGORIES = [
  { name: "Web", slug: "web" },
  { name: "Cryptography", slug: "cryptography" },
  { name: "Forensics", slug: "forensics" },
  { name: "Reverse Engineering", slug: "reverse-engineering" },
  { name: "Binary Exploitation", slug: "binary-exploitation" },
  { name: "Miscellaneous", slug: "miscellaneous" },
  { name: "OSINT", slug: "osint" },
];

const COMPETITIONS = [
  {
    slug: `${DEV_PREFIX}active-ctf`,
    name: "Dev Seed — Active CTF",
    description:
      "Sample **active** competition for local development and UI testing.",
    status: "ACTIVE",
    hidden: false,
    startDaysAgo: 3,
    endDaysFromNow: 14,
  },
  {
    slug: `${DEV_PREFIX}ended-ctf`,
    name: "Dev Seed — Ended CTF",
    description: "Sample **ended** competition with writeups unlocked.",
    status: "ENDED",
    hidden: false,
    startDaysAgo: 60,
    endDaysAgo: 7,
  },
  {
    slug: `${DEV_PREFIX}hidden-draft`,
    name: "Dev Seed — Hidden Draft",
    description: "Hidden draft competition (not listed publicly).",
    status: "DRAFT",
    hidden: true,
    startDaysFromNow: 7,
    endDaysFromNow: 21,
  },
];

const CHALLENGE_TEMPLATES = [
  { slug: "welcome", title: "Welcome Challenge", category: "miscellaneous", points: 50 },
  { slug: "http-leak", title: "HTTP Leak", category: "web", points: 100 },
  { slug: "cookie-jar", title: "Cookie Jar", category: "web", points: 150 },
  { slug: "caesar-shift", title: "Caesar Shift", category: "cryptography", points: 100 },
  { slug: "hash-crash", title: "Hash Crash", category: "cryptography", points: 200 },
  { slug: "packet-peek", title: "Packet Peek", category: "forensics", points: 125 },
  { slug: "strings-attached", title: "Strings Attached", category: "reverse-engineering", points: 175 },
  { slug: "buffer-basics", title: "Buffer Basics", category: "binary-exploitation", points: 250 },
  { slug: "geo-guess", title: "Geo Guess", category: "osint", points: 75 },
];

const CUSTOM_PAGES = [
  {
    slug: `${DEV_PREFIX}faq`,
    title: "Dev Seed FAQ",
    content:
      "<h2>Development test page</h2><p>This page was created by <code>prisma/seed-test-data.js</code> for local UI testing.</p>",
  },
  {
    slug: `${DEV_PREFIX}event-info`,
    title: "Dev Seed Event Info",
    content:
      "<p>Sample event information page. Safe to delete in production databases.</p>",
    hidden: true,
  },
];

function assertDevEnvironment() {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "refusing to run: seed-test-data is dev-only (NODE_ENV=production)."
    );
    process.exit(1);
  }
}

function daysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function pickSome(items, min, max) {
  const count = Math.min(
    items.length,
    min + Math.floor(Math.random() * (max - min + 1))
  );
  const copy = [...items];
  const chosen = [];
  while (chosen.length < count && copy.length > 0) {
    const index = Math.floor(Math.random() * copy.length);
    chosen.push(copy.splice(index, 1)[0]);
  }
  return chosen;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomIp() {
  return `203.0.${randomInt(1, 254)}.${randomInt(1, 254)}`;
}

function randomDateBetween(start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (endMs <= startMs) return new Date(startMs);
  return new Date(startMs + Math.random() * (endMs - startMs));
}

async function hashFlag(value) {
  return bcrypt.hash(value.trim(), 10);
}

async function ensureCategories(prisma) {
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: { ...cat, isDefault: true },
    });
  }
}

async function upsertCompetition(prisma, spec) {
  const startAt = spec.startDaysAgo != null
    ? daysFromNow(-spec.startDaysAgo)
    : daysFromNow(spec.startDaysFromNow ?? 0);
  const endAt = spec.endDaysAgo != null
    ? daysFromNow(-spec.endDaysAgo)
    : daysFromNow(spec.endDaysFromNow ?? 7);

  return prisma.competition.upsert({
    where: { slug: spec.slug },
    update: {
      name: spec.name,
      description: spec.description,
      descriptionFormat: "MARKDOWN",
      startAt,
      endAt,
      hidden: spec.hidden,
      status: spec.status,
    },
    create: {
      slug: spec.slug,
      name: spec.name,
      description: spec.description,
      descriptionFormat: "MARKDOWN",
      startAt,
      endAt,
      hidden: spec.hidden,
      status: spec.status,
    },
  });
}

async function upsertChallenge(prisma, competition, template, categoryBySlug) {
  const category = categoryBySlug[template.category];
  if (!category) {
    throw new Error(`Missing category slug: ${template.category}`);
  }

  const flagValue = `DUCA{dev_${competition.slug}_${template.slug}}`;

  const challenge = await prisma.challenge.upsert({
    where: {
      competitionId_slug: {
        competitionId: competition.id,
        slug: template.slug,
      },
    },
    update: {
      title: template.title,
      points: template.points,
      description: `Dev seed challenge **${template.title}**. Flag format: \`DUCA{...}\`.`,
      descriptionFormat: "MARKDOWN",
      categoryId: category.id,
      startAt: competition.startAt,
      hidden: false,
      submitLimit: template.slug === "hash-crash" ? 10 : null,
    },
    create: {
      competitionId: competition.id,
      categoryId: category.id,
      title: template.title,
      slug: template.slug,
      points: template.points,
      description: `Dev seed challenge **${template.title}**. Flag format: \`DUCA{...}\`.`,
      descriptionFormat: "MARKDOWN",
      startAt: competition.startAt,
      hidden: false,
      submitLimit: template.slug === "hash-crash" ? 10 : null,
    },
    include: { flags: true },
  });

  const existingFlag = challenge.flags[0];
  const flagHash = await hashFlag(flagValue);

  if (existingFlag) {
    await prisma.flag.update({
      where: { id: existingFlag.id },
      data: { value: flagValue, flagHash, label: "", order: 0 },
    });
  } else {
    await prisma.flag.create({
      data: {
        challengeId: challenge.id,
        value: flagValue,
        flagHash,
        label: "",
        order: 0,
      },
    });
  }

  if (template.slug === "buffer-basics") {
    const stageFlagValue = `DUCA{dev_${competition.slug}_${template.slug}_stage2}`;
    const stageHash = await hashFlag(stageFlagValue);
    const stage = challenge.flags.find((f) => f.order === 1);
    if (stage) {
      await prisma.flag.update({
        where: { id: stage.id },
        data: { value: stageFlagValue, flagHash: stageHash, label: "Stage 2", order: 1 },
      });
    } else {
      await prisma.flag.create({
        data: {
          challengeId: challenge.id,
          value: stageFlagValue,
          flagHash: stageHash,
          label: "Stage 2",
          order: 1,
        },
      });
    }
  }

  return prisma.challenge.findUnique({
    where: { id: challenge.id },
    include: { flags: { orderBy: { order: "asc" } }, category: true, competition: true },
  });
}

async function upsertWriteup(prisma, challenge) {
  await prisma.writeup.upsert({
    where: { challengeId: challenge.id },
    update: {
      content: `## ${challenge.title}\n\nDev seed writeup for **${challenge.competition.name}**.\n\n\`\`\`\n${challenge.flags[0]?.value || "DUCA{...}"}\n\`\`\``,
      contentFormat: "MARKDOWN",
    },
    create: {
      challengeId: challenge.id,
      content: `## ${challenge.title}\n\nDev seed writeup for **${challenge.competition.name}**.\n\n\`\`\`\n${challenge.flags[0]?.value || "DUCA{...}"}\n\`\`\``,
      contentFormat: "MARKDOWN",
    },
  });
}

async function upsertCustomPages(prisma) {
  for (const page of CUSTOM_PAGES) {
    await prisma.sitePage.upsert({
      where: { slug: page.slug },
      update: {
        title: page.title,
        content: page.content,
        contentFormat: "RICHTEXT",
        hidden: page.hidden ?? false,
        isSystem: false,
      },
      create: {
        slug: page.slug,
        title: page.title,
        content: page.content,
        contentFormat: "RICHTEXT",
        hidden: page.hidden ?? false,
        isSystem: false,
      },
    });
  }
}

async function clearDevSubmissions(prisma, challengeIds) {
  if (challengeIds.length === 0) return;

  await prisma.solve.deleteMany({
    where: { challengeId: { in: challengeIds } },
  });

  const { TELEMETRY_ACTIONS } = await import("../src/lib/constants.js");
  const submitActions = [
    TELEMETRY_ACTIONS.FLAG_SUBMIT_CORRECT,
    TELEMETRY_ACTIONS.FLAG_SUBMIT_INCORRECT,
    TELEMETRY_ACTIONS.FLAG_SUBMIT_REVERTED,
  ];

  await prisma.activityLog.deleteMany({
    where: {
      action: { in: submitActions },
      OR: challengeIds.map((id) => ({
        metadata: { path: ["challengeId"], equals: id },
      })),
    },
  });
}

async function seedSubmissions(prisma, users, challenges, competitionsById) {
  const { TELEMETRY_ACTIONS } = await import("../src/lib/constants.js");
  let solveCount = 0;
  let logCount = 0;

  for (const user of users) {
    const attemptChallenges = pickSome(challenges, 2, Math.min(6, challenges.length));

    for (const challenge of attemptChallenges) {
      const competition = competitionsById[challenge.competitionId];
      const windowStart = new Date(competition.startAt);
      const windowEnd = new Date(
        Math.min(competition.endAt.getTime(), Date.now())
      );
      if (windowEnd <= windowStart) continue;

      const incorrectAttempts = randomInt(0, 3);
      for (let i = 0; i < incorrectAttempts; i++) {
        const createdAt = randomDateBetween(windowStart, windowEnd);
        await prisma.activityLog.create({
          data: {
            userId: user.id,
            ip: randomIp(),
            userAgent: "dev-seed-script",
            action: TELEMETRY_ACTIONS.FLAG_SUBMIT_INCORRECT,
            metadata: {
              challengeId: challenge.id,
              categoryId: challenge.categoryId,
              competitionId: challenge.competitionId,
            },
            createdAt,
          },
        });
        logCount += 1;
      }

      if (Math.random() < 0.65) {
        const primaryFlag = challenge.flags[0];
        if (!primaryFlag) continue;

        const solvedAt = randomDateBetween(windowStart, windowEnd);
        const existingSolve = await prisma.solve.findUnique({
          where: {
            userId_flagId: { userId: user.id, flagId: primaryFlag.id },
          },
        });

        if (!existingSolve) {
          const existingChallengeSolve = await prisma.solve.findFirst({
            where: {
              userId: user.id,
              challengeId: challenge.id,
              pointsAwarded: { gt: 0 },
            },
          });
          const pointsAwarded = existingChallengeSolve ? 0 : challenge.points;

          await prisma.solve.create({
            data: {
              userId: user.id,
              challengeId: challenge.id,
              flagId: primaryFlag.id,
              ip: randomIp(),
              pointsAwarded,
              solvedAt,
            },
          });
          solveCount += 1;

          await prisma.activityLog.create({
            data: {
              userId: user.id,
              ip: randomIp(),
              userAgent: "dev-seed-script",
              action: TELEMETRY_ACTIONS.FLAG_SUBMIT_CORRECT,
              metadata: {
                challengeId: challenge.id,
                flagId: primaryFlag.id,
                pointsAwarded,
                categoryId: challenge.categoryId,
                competitionId: challenge.competitionId,
              },
              createdAt: solvedAt,
            },
          });
          logCount += 1;
        }
      }
    }
  }

  return { solveCount, logCount };
}

async function main() {
  assertDevEnvironment();

  const force = process.argv.includes("--force");
  const prisma = createPrismaClient();

  try {
    await ensureCategories(prisma);

    const users = await prisma.user.findMany({
      where: { disabled: false },
      orderBy: { createdAt: "asc" },
    });

    if (users.length === 0) {
      console.error(
        "No users found. Log in at least once (npm run dev → /login) then re-run."
      );
      process.exit(1);
    }

    const categories = await prisma.category.findMany();
    const categoryBySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));

    const competitions = [];
    for (const spec of COMPETITIONS) {
      competitions.push(await upsertCompetition(prisma, spec));
    }
    const competitionsById = Object.fromEntries(competitions.map((c) => [c.id, c]));

    const seededChallenges = [];
    for (const competition of competitions) {
      const templates =
        competition.slug === `${DEV_PREFIX}hidden-draft`
          ? CHALLENGE_TEMPLATES.slice(0, 3)
          : CHALLENGE_TEMPLATES;

      for (const template of templates) {
        const challenge = await upsertChallenge(
          prisma,
          competition,
          template,
          categoryBySlug
        );
        seededChallenges.push(challenge);

        if (competition.status === "ENDED") {
          await upsertWriteup(prisma, challenge);
        }
      }
    }

    await upsertCustomPages(prisma);

    const challengeIds = seededChallenges.map((c) => c.id);
    const existingSolveCount = await prisma.solve.count({
      where: { challengeId: { in: challengeIds } },
    });

    if (existingSolveCount > 0 && !force) {
      console.log(
        `Skipping submission seeding (${existingSolveCount} dev solves exist). Pass --force to re-randomize.`
      );
    } else {
      if (force) {
        await clearDevSubmissions(prisma, challengeIds);
        console.log("Cleared existing dev-seed submissions.");
      }
      const { solveCount, logCount } = await seedSubmissions(
        prisma,
        users,
        seededChallenges,
        competitionsById
      );
      console.log(`Seeded ${solveCount} solves and ${logCount} submission log entries.`);
    }

    console.log("Dev test data seed complete.");
    console.log(`  Users: ${users.length}`);
    console.log(`  Competitions: ${competitions.length}`);
    console.log(`  Challenges: ${seededChallenges.length}`);
    console.log(`  Custom pages: ${CUSTOM_PAGES.length}`);
    console.log(`  Active CTF slug: ${DEV_PREFIX}active-ctf`);
    console.log(`  Ended CTF slug: ${DEV_PREFIX}ended-ctf`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
