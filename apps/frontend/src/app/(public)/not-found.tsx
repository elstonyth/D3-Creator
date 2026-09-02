import { ButtonLink } from '@gitroom/frontend/components/ui/button';
import { Container, Section } from '@gitroom/frontend/components/ui/section';

/**
 * 404 for every public route — an unknown URL, or a page calling notFound()
 * (a creator handle that is no longer tracked, a class that was removed).
 * Server component, no data fetching: it has to render when the data layer is
 * exactly what failed.
 */
export default function PublicNotFound() {
  return (
    <Section space="lg">
      <Container>
        <div className="max-w-prose">
          <p className="tnum text-micro uppercase text-fg-subtle">Error 404</p>
          <h1 className="mt-4 text-display-2 text-fg">That page isn’t here</h1>
          <p className="mt-4 text-body-lg text-fg-muted">
            The link may be out of date, or the creator it pointed at is no
            longer tracked. Everything we publish is reachable from the
            dashboard.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/dashboard" size="lg">
              Open the dashboard
            </ButtonLink>
            <ButtonLink href="/" variant="secondary" size="lg">
              Back to home
            </ButtonLink>
          </div>
        </div>
      </Container>
    </Section>
  );
}
