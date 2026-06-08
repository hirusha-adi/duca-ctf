import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function HomeHero({ user, activeCompetitions = [] }) {
  return (
    <section className="flex flex-col items-center px-2 py-14 text-center md:py-20">
      <Image
        src="/duca-logo.png"
        alt="Deakin University Cybersecurity Association"
        width={200}
        height={200}
        priority
        className="mb-8 h-[168px] w-[168px] object-contain sm:h-[188px] sm:w-[188px]"
      />

      <h1 className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl">
        DUCA{" "}
        <span className="font-mono text-primary">CTF</span>
      </h1>

      <p className="mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
        Deakin University Cybersecurity Association
      </p>

      <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-[1.0625rem]">
        Capture-the-flag challenges, scored competitions, live solve feeds, and
        writeups — run for DUCA members and guests.
      </p>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/competitions">Competitions</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href={user ? "/solves" : "/login"}>
            {user ? "Live solves" : "Sign in"}
          </Link>
        </Button>
      </div>

      <nav className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <Link href="/solves" className="hover:text-foreground">
          Solves
        </Link>
        <Link href="/leaderboard" className="hover:text-foreground">
          Leaderboard
        </Link>
        <Link href="/writeups" className="hover:text-foreground">
          Writeups
        </Link>
      </nav>

      {activeCompetitions.length > 0 && (
        <div className="mt-12 w-full max-w-lg border-t border-border pt-8">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Active
          </p>
          <ul className="mt-4 space-y-2">
            {activeCompetitions.map((comp) => (
              <li key={comp.id}>
                <Link
                  href={`/competitions/${comp.slug}`}
                  className="text-base font-medium underline-offset-4 hover:text-primary hover:underline"
                >
                  {comp.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
