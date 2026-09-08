/**
 * Route-level 404 for /studio/*. PRD 3 §6.8.
 *
 * The repo has only `app/global-error.tsx`, which replaces the whole document,
 * nav and footer included. This degrades a bad id inside the site chrome.
 */

import type { ReactElement } from 'react';

import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';
import { Container, Section } from '@gitroom/frontend/components/ui/section';

export default function StudioNotFound(): ReactElement {
  return (
    <Section space="md">
      <Container className="max-w-prose">
        {/* EmptyState's title is an <h3>, so without this the page has no
            <h1> at all and its heading order opens at level 3. Visually hidden
            because the card below already says it on screen. */}
        <h1 className="sr-only">Report not found</h1>
        <EmptyState
          size="lg"
          title="Report not found"
          description="That report doesn't exist, or it belongs to another account. Your own reports are all listed in the analyzer."
          action={{ href: '/studio/analyzer', label: 'Back to Video Analyzer' }}
        />
      </Container>
    </Section>
  );
}
