import { getVisibleCompetitions, isCompetitionActive } from "@/lib/competitions";
import { CompetitionPreview } from "@/components/competition/competition-preview";
import { CompetitionCard } from "@/components/competition/competition-card";

export default async function CompetitionsPage() {
  const competitions = await getVisibleCompetitions();

  const active = competitions.filter((comp) => isCompetitionActive(comp));
  const inactive = competitions.filter((comp) => !isCompetitionActive(comp));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Competitions</h1>

      {competitions.length === 0 ? (
        <p className="text-muted-foreground">No competitions available.</p>
      ) : (
        <div className="space-y-10">
          {active.length > 0 && (
            <section>
              <div className="space-y-4">
                {active.map((comp) => (
                  <CompetitionPreview key={comp.id} competition={comp} />
                ))}
              </div>
            </section>
          )}

          {inactive.length > 0 && (
            <section>
              {active.length > 0 && (
                <p className="mb-4 text-sm font-medium text-muted-foreground">
                  Upcoming &amp; ended
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {inactive.map((comp) => (
                  <CompetitionCard key={comp.id} competition={comp} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
