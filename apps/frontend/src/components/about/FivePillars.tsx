import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { Reveal } from '@gitroom/frontend/components/ui/reveal';

interface Pillar {
  title: string;
  body: string;
}

const PILLARS: Pillar[] = [
  {
    title: 'Real content production',
    body: 'Hooks, structure, story, format — every video built like a piece of inventory.',
  },
  {
    title: 'Real audience growth',
    body: 'Compounding follower curves, not vanity spike-and-fade.',
  },
  {
    title: 'Real platform understanding',
    body: 'Five platforms, five different physics. We operate them — not just post.',
  },
  {
    title: 'Real business positioning',
    body: 'Niche, voice, offer — engineered so attention converts.',
  },
  {
    title: 'Real monetization',
    body: 'Leads, sales, partnerships, brand deals. Measured outcomes, not impressions.',
  },
];

/**
 * Five numbered rows on hairlines. It was a bento of five bordered cards with a
 * radial brand wash behind each; a list of five parallel statements is a list.
 */
export function FivePillars() {
  return (
    <Section space="lg" divided aria-labelledby="about-pillars-heading">
      <Container>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-prose">
            <p className="text-micro uppercase text-fg-subtle">Five pillars</p>
            <h2
              id="about-pillars-heading"
              className="mt-4 text-section text-fg"
            >
              Everything D3 is built around real execution.
            </h2>
          </div>
          <p className="max-w-sm text-body-sm text-fg-muted md:text-right">
            Our system focuses on measurable outcomes. No vanity metrics, no
            motivational decks.
          </p>
        </div>

        <ol className="mt-10 border-t border-line-subtle sm:mt-14">
          {PILLARS.map((pillar, index) => (
            <li key={pillar.title} className="border-b border-line-subtle">
              <Reveal
                delay={index * 30}
                className="grid gap-x-8 gap-y-2 py-7 md:grid-cols-[3rem_minmax(0,18rem)_minmax(0,1fr)] md:py-8"
              >
                <span
                  aria-hidden
                  className="font-mono text-caption text-fg-subtle tnum"
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="text-subsection text-fg">{pillar.title}</h3>
                <p className="text-body text-fg-muted">{pillar.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
