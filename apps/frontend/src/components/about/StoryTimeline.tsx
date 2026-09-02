import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { Reveal } from '@gitroom/frontend/components/ui/reveal';
import { cn } from '@gitroom/frontend/lib/utils';

interface Milestone {
  year: string;
  title: string;
  body: string;
}

// Placeholder milestones — swap with the real D3 history when available.
const MILESTONES: Milestone[] = [
  {
    year: '2023',
    title: 'D3 founded in Malaysia',
    body: 'Started as a content production studio focused on turning attention into business — not vanity, not motivation.',
  },
  {
    year: '2024',
    title: 'First creator hits 100K followers',
    body: 'Proof the system works. The first of many — and the moment we started counting outcomes, not impressions.',
  },
  {
    year: '2025',
    title: 'Multi-platform expansion',
    body: 'Operations expand to TikTok, Instagram, Facebook, and Douyin. Four platforms, one playbook.',
  },
  {
    year: '2026',
    title: '20+ creators in the ecosystem',
    body: 'The studio crosses twenty active creators, all measured against real outcomes: leads, sales, brand value.',
  },
  {
    year: 'now',
    title: 'D3 Creator goes public',
    body: 'Live leaderboard launches. Every number visible, nothing hidden. The thesis on display.',
  },
];

/**
 * A list, so it reads as hairline rows against a single rule — not five boxed
 * cards. The only yellow is the marker on the current entry: the "active data
 * point" slot in DESIGN.md's yellow ledger.
 */
export function StoryTimeline() {
  return (
    <Section space="lg" aria-labelledby="about-timeline-heading">
      <Container>
        <header className="max-w-prose">
          <p className="text-micro uppercase text-fg-subtle">Since 2023</p>
          <h2
            id="about-timeline-heading"
            className="mt-4 text-display-2 text-fg"
          >
            Three years of building creators that actually generate business.
          </h2>
          <p className="mt-6 text-body-lg text-fg-muted">
            Not influencer vanity. Not motivational decks. A short, real history
            of an operating company that turns short-video attention into leads,
            sales, and long-term brand value.
          </p>
        </header>

        <ol className="mt-12 max-w-prose border-l border-line sm:mt-16">
          {MILESTONES.map((milestone, index) => (
            <li
              key={milestone.year + milestone.title}
              className="relative pb-10 pl-6 last:pb-0 sm:pl-10"
            >
              <span
                aria-hidden
                className={cn(
                  'absolute -left-1 top-[9px] h-[7px] w-[7px] rounded-full',
                  index === MILESTONES.length - 1 ? 'bg-brand' : 'bg-fg-subtle',
                )}
              />
              <Reveal delay={index * 40}>
                <p className="font-mono text-micro uppercase text-fg-subtle tnum">
                  {milestone.year}
                </p>
                <h3 className="mt-2 text-subsection text-fg">
                  {milestone.title}
                </h3>
                <p className="mt-2 text-body text-fg-muted">{milestone.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
