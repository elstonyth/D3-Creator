import { ButtonLink } from '@gitroom/frontend/components/ui/button';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { Reveal } from '@gitroom/frontend/components/ui/reveal';

/**
 * Where the page lands. One yellow button — the leaderboard is the thing the
 * whole page argues for — and one hairline secondary beside it.
 */
export function ClosingMission() {
  return (
    <Section space="lg" aria-labelledby="about-mission-heading">
      <Container>
        <Reveal className="max-w-prose">
          <p className="text-micro uppercase text-fg-subtle">Our mission</p>

          <h2
            id="about-mission-heading"
            className="mt-6 text-display-2 text-fg"
          >
            More creators. More founders. More businesses.
          </h2>

          <p className="mt-6 text-body-lg text-fg-muted">
            Helping Malaysia use content to actually change lives — leads,
            sales, real commercial IP. D3 is both a creator growth ecosystem and
            an operating company built on that thesis.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/leaderboard" size="lg">
              See the live leaderboard
            </ButtonLink>
            <ButtonLink href="/dashboard" variant="secondary" size="lg">
              Open the dashboard
            </ButtonLink>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
