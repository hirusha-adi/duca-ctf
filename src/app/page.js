import Link from "next/link";
import { prisma } from "@/lib/db";
import { getActiveCompetitions } from "@/lib/competitions";
import { getCurrentUser } from "@/lib/auth";
import { userHasSolvedChallenge } from "@/lib/scoring";
import { HomeHero } from "@/components/home/home-hero";
import { ChallengeCard } from "@/components/challenge/challenge-card";
import { formatInAEST } from "@/lib/timezone";

const platformLinks = [
  {
    href: "/competitions",
    label: "Competitions",
    description: "Browse scheduled and past events.",
  },
  {
    href: "/solves",
    label: "Solves",
    description: "Real-time feed of captured flags.",
  },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    description: "Overall and per-challenge rankings.",
  },
  {
    href: "/writeups",
    label: "Writeups",
    description: "Solutions after competitions end.",
  },
];

export default async function HomePage() {
  const user = await getCurrentUser();
  const activeCompetitions = await getActiveCompetitions();
  const now = new Date();

  const upcomingChallenges = await prisma.challenge.findMany({
    where: {
      hidden: false,
      startAt: { gt: now },
      competition: {
        hidden: false,
        status: { not: "ENDED" },
        endAt: { gte: now },
      },
    },
    include: {
      category: true,
      competition: { select: { name: true, slug: true } },
    },
    orderBy: { startAt: "asc" },
    take: 12,
  });

  const solvedMap = {};
  if (user) {
    for (const ch of upcomingChallenges) {
      solvedMap[ch.id] = await userHasSolvedChallenge(user.id, ch.id);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16">
      <HomeHero user={user} activeCompetitions={activeCompetitions} />

      <section className="border-t border-border pt-12">
        <dl className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {platformLinks.map((item) => (
            <div key={item.href}>
              <dt>
                <Link
                  href={item.href}
                  className="text-base font-semibold underline-offset-4 hover:text-primary hover:underline"
                >
                  {item.label}
                </Link>
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {upcomingChallenges.length > 0 && (
        <section className="mt-16 border-t border-border pt-12">
          <div className="mb-8 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="text-lg font-semibold">Upcoming challenges</h2>
            <p className="text-sm text-muted-foreground">Times in AEST/AEDT</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingChallenges.map((challenge) => (
              <div key={challenge.id}>
                <ChallengeCard
                  challenge={challenge}
                  solved={solvedMap[challenge.id]}
                />
                <p className="mt-1 px-1 text-xs text-muted-foreground">
                  Starts {formatInAEST(challenge.startAt)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
