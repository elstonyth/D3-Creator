import { getI18n } from '@gitroom/frontend/lib/i18n-server';
/**
 * Route-level 404 for /studio/*. PRD 3 §6.8.
 *
 * The repo has only `app/global-error.tsx`, which replaces the whole document,
 * nav and footer included. This degrades a bad id inside the site chrome.
 */

import type { ReactElement } from 'react';

import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';
import { Container, Section } from '@gitroom/frontend/components/ui/section';

export default async function StudioNotFound(): Promise<ReactElement> {
  const { t } = await getI18n();
  return (
    <Section space="md">
      <Container className="max-w-prose">
        {/* EmptyState's title is an <h3>, so without this the page has no
            <h1> at all and its heading order opens at level 3. Visually hidden
            because the card below already says it on screen. */}
        <h1 className="sr-only">{t('Report not found')}</h1>
        <EmptyState
          size="lg"
          title={t('Report not found')}
          description={t(
            "That report doesn't exist, or it belongs to another account. Your own reports are all listed in the analyzer."
          )}
          action={{
            href: '/studio/analyzer',
            label: t('Back to Video Analyzer'),
          }}
        />
      </Container>
    </Section>
  );
}
