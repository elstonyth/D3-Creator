/**
 * The panel a signed-in, role-'none' visitor sees on any /studio/* route.
 * PRD 3 §5.6 — one shared Server Component, so both Studio pages render
 * byte-identical copy.
 *
 * It owns its own <Container>: the public layout no longer wraps children in a
 * gutter, so a bare EmptyState would touch both screen edges at 360px.
 *
 * `EmptyState.action` is the repo's yellow primary CTA and is the only yellow
 * control on that render, which satisfies the one-yellow-per-screen rule.
 */

import type { ReactElement } from 'react';

import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';
import { Container, Section } from '@gitroom/frontend/components/ui/section';

export function StudioLocked(): ReactElement {
  return (
    <Section space="md">
      <Container className="max-w-prose">
        {/* EmptyState's title is an <h3>, so without this the page has no
            <h1> at all and its heading order opens at level 3. Visually hidden
            because the card below already says it on screen. */}
        <h1 className="sr-only">Studio is for members</h1>
        <EmptyState
          size="lg"
          title="Studio is for members."
          description="Your account doesn't have member access yet, so the Studio tools are locked."
          action={{ href: '/classes', label: 'See what members get' }}
          secondary={{ href: '/', label: 'Back to the showcase' }}
        />
      </Container>
    </Section>
  );
}
