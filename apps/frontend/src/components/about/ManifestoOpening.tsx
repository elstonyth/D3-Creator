import { Container, Section } from '@gitroom/frontend/components/ui/section';

/**
 * The one place on the site that gets display-1 type. Editorial opening: a
 * kicker, a claim, and the sentence that explains the claim. No ornament — the
 * whitespace and the measure carry it (DESIGN.md §3).
 */
export function ManifestoOpening() {
  return (
    <Section
      space="lg"
      aria-labelledby="about-manifesto-heading"
      className="border-b border-line-subtle"
    >
      <Container>
        <p className="text-micro uppercase text-fg-subtle">About D3</p>

        <h1
          id="about-manifesto-heading"
          className="mt-6 max-w-[14ch] text-display-1 text-fg"
        >
          It&apos;s not talent.
        </h1>

        <p className="mt-8 max-w-prose text-body-lg text-fg-muted">
          Most people don&apos;t fail at content because they aren&apos;t
          talented. They fail because nobody ever taught them how to turn
          attention into business.
        </p>
      </Container>
    </Section>
  );
}
