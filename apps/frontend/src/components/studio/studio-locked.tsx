/**
 * The panel a signed-in, role-'none' visitor sees on any /studio/* route.
 * PRD 3 §5.6 — one shared Server Component, so both Studio pages render
 * byte-identical copy.
 *
 * `EmptyState.action` is the repo's yellow primary CTA and is the only yellow
 * control on that render, which satisfies the one-yellow-per-screen rule.
 */

import type { ReactElement } from 'react';

import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';

export function StudioLocked(): ReactElement {
  return (
    <EmptyState
      size="lg"
      title="Studio is for members."
      description="Your account doesn't have member access yet, so the Studio tools are locked."
      action={{ href: '/classes', label: 'See what members get' }}
    />
  );
}
