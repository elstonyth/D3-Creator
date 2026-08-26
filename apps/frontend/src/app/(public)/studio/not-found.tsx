/**
 * Route-level 404 for /studio/*. PRD 3 §6.8.
 *
 * The repo has only `app/global-error.tsx`, which replaces the whole document,
 * nav and footer included. This degrades a bad id inside the site chrome.
 */

import type { ReactElement } from 'react';

import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';

export default function StudioNotFound(): ReactElement {
  return (
    <div className="max-w-[1100px] mx-auto py-12">
      <EmptyState
        size="lg"
        title="Report not found"
        description="That report doesn't exist, or it isn't yours."
        action={{ href: '/studio/analyzer', label: 'Back to Video Analyzer' }}
      />
    </div>
  );
}
