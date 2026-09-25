import type { Metadata } from 'next';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { Container, Section } from '@gitroom/frontend/components/ui/section';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('Waiting for approval — D3 Staff') };
}

/**
 * Where a staff_pending account waits. The middleware keeps it here (and
 * keeps approved staff away), so there is nothing to gate on this page.
 */
export default async function StaffPendingPage() {
  const { t } = await getI18n();
  const auth = await getAuthContext();
  return (
    <Container>
      <Section space="md">
        <div className="mx-auto max-w-lg rounded-2xl border border-line bg-surface p-6 text-center sm:p-8">
          <p className="text-micro uppercase text-fg-subtle">
            {t('Almost there')}
          </p>
          <h1 className="mt-3 text-section text-fg">
            {t('Waiting for an admin')}
          </h1>
          <p className="mt-3 text-body text-fg-muted">
            {t(
              'Your staff account is set up. An admin has to approve it and link it to your name on the work board before you can see the team’s schedule.',
            )}
          </p>
          {auth?.email ? (
            <p className="mt-4 break-all text-caption text-fg-subtle">
              {t('Signed in as {email}', { email: auth.email })}
            </p>
          ) : null}
          <p className="mt-4 text-caption text-fg-subtle">
            {t(
              'Tell your admin you have signed up. This page opens the portal once you are approved — just reload it.',
            )}
          </p>
          <p className="mt-4">
            <a
              href=""
              className="inline-flex min-h-[44px] items-center rounded text-label text-fg underline underline-offset-4 hover:text-fg-muted focus-visible:outline-none focus-visible:shadow-focusRing"
            >
              {t('Refresh')}
            </a>
          </p>
        </div>
      </Section>
    </Container>
  );
}
