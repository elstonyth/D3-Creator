'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
 * Deliberately hand-rolled rather than pulled from a motion library: this is
 * the only scroll animation on the site and it is ~20 lines. It starts VISIBLE
 * and only hides itself once the observer is attached, so if JavaScript never
 * runs — a crawler, a hydration error, prefers-reduced-motion — the content is
 * still on screen rather than stuck at opacity 0.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Already on screen at mount (above the fold): leave it visible, no fade.
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    setShown(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
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
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
        className,
      )}
    >
      {children}
    </div>
  );
}
