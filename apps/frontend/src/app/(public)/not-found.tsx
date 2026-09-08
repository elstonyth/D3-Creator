import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { ButtonLink } from '@gitroom/frontend/components/ui/button';
import { Container, Section } from '@gitroom/frontend/components/ui/section';

/**
 * 404 for every public route — an unknown URL, or a page calling notFound()
 * (a creator handle that is no longer tracked, a class that was removed).
 * Server component, no data fetching: it has to render when the data layer is
 * exactly what failed.
 */
export default async function PublicNotFound() {
  const { t } = await getI18n();
  return (
    <Section space="lg">
      <Container>
        <div className="max-w-prose">
          <p className="tnum text-micro uppercase text-fg-subtle">
            {t('Error 404')}
          </p>
          <h1 className="mt-4 text-display-2 text-fg">
            {t('That page isn’t here')}
          </h1>
          <p className="mt-4 text-body-lg text-fg-muted">
            {t(
              'The link may be out of date, or the creator it pointed at is no longer tracked. Everything we publish is reachable from the dashboard.'
            )}{' '}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/dashboard" size="lg">
              {t('Open the dashboard')}{' '}
            </ButtonLink>
            <ButtonLink href="/" variant="secondary" size="lg">
              {t('Back to home')}{' '}
            </ButtonLink>
          </div>
        </div>
      </Container>
    </Section>
  );
}
