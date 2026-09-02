'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@gitroom/frontend/lib/utils';

interface RevealProps {
  children: ReactNode;
  /** Stagger in ms. Keep the whole stagger under ~200ms across a group. */
  delay?: number;
  className?: string;
}

/**
 * Single-fire fade + 8px rise when the element scrolls into view.
 *
 * Hand-rolled rather than pulled from a motion library: this is the only scroll
 * animation on the site and it is ~20 lines.
 *
 * Two deliberate properties:
 *
 * 1. It renders VISIBLE and only hides itself once the observer is attached, so
 *    content is never stranded at opacity 0 when JavaScript does not run — a
 *    crawler, a hydration failure, prefers-reduced-motion.
 * 2. The hidden/shown flip is written straight to a data attribute on the node
 *    instead of through setState. React state would be the obvious choice, but
 *    setting it inside the effect trips react-hooks/set-state-in-effect (an
 *    error under this repo's lint, and CLAUDE.md bans eslint-disable). Nothing
 *    renders from this value — only CSS reads it — so state buys nothing here.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Already on screen at mount (above the fold): leave it alone, no fade —
    // a hero that fades in after hydration reads as a flash of broken page.
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    el.dataset.reveal = 'pending';
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.reveal = 'shown';
        observer.disconnect();
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        'transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
        'data-[reveal=pending]:translate-y-2 data-[reveal=pending]:opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
