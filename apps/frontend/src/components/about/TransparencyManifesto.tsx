import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { Reveal } from '@gitroom/frontend/components/ui/reveal';

/**
 * The pivot of the page: why a public leaderboard exists at all. It is a
 * statement, so it gets a band of its own and no button — the actions sit in
 * the closing block so the page has exactly one primary CTA.
 */
export function TransparencyManifesto() {
  return (
    <Section
      space="lg"
      aria-labelledby="about-transparency-heading"
      className="border-y border-line-subtle bg-surface-subtle"
    >
      <Container className="max-w-prose text-center">
        <Reveal>
          <h2
            id="about-transparency-heading"
            className="text-display-2 text-fg"
          >
            That&apos;s why D3 Creator exists.
          </h2>
          <p className="mt-6 text-body-lg text-fg-muted">
            Instead of showing screenshots or edited case studies, we made our
            creator ecosystem public. Followers, views, engagement, growth
            rankings, and live performance are displayed transparently across
            every platform we operate.
          </p>
          <p className="mt-6 text-body-lg text-fg">
            In our culture, numbers speak louder than promises.
          </p>
        </Reveal>
      </Container>
    </Section>
  );
}
