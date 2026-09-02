'use client';

/**
 * MobileNav — hamburger disclosure for the public header on small viewports.
 *
 * The header is a Server Component, so this client island owns the open/close
 * state. Renders a 44px hamburger that toggles a full-width panel below the
 * 56px header. Closes on link click, Escape, and outside click. Active route
 * gets the brand-yellow treatment (same rule as NavLink).
 *
 * PRD 3 §4 adds grouped entries and the optional `viewer` prop. A group child
 * behaves exactly like a flat link — it honours `exact`, takes
 * `aria-current="page"` on the same prefix rule, and closes the panel on tap.
 * The only differences are the indent and the lock.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@gitroom/frontend/lib/utils';
import {
  LockGlyph,
  type StudioViewer,
} from '@gitroom/frontend/components/ui/nav-dropdown';

export interface MobileNavLink {
  href: string;
  label: string;
  exact?: boolean;
}

/** A group has no href — `/studio` is a prefix, not a page. */
export interface MobileNavGroup {
  label: string;
  children: MobileNavLink[];
}

export type MobileNavItem = MobileNavLink | MobileNavGroup;

export default function MobileNav({
  links,
  viewer = 'no-access',
}: {
  links: MobileNavItem[];
  /** Read only by group children. Omitted at the (admin) call site. */
  viewer?: StudioViewer;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function isActive(l: MobileNavLink): boolean {
    return l.exact
      ? pathname === l.href
      : pathname === l.href || pathname.startsWith(`${l.href}/`);
  }

  const locked = viewer !== 'member';

  return (
    <div ref={ref} className="md:hidden">
      <button
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-11 items-center justify-center rounded-md text-fg hover:bg-white/[0.04] transition-colors"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M3 6h18M3 12h18M3 18h18" />
          )}
        </svg>
      </button>

      {/* Kept mounted, same reason as nav-dropdown: a conditionally-mounted
          panel has no previous style to animate from and simply pops.
          `invisible` removes it from the tab order and a11y tree while closed. */}
      <div
        className={cn(
          'absolute left-0 right-0 top-14 z-50 border-b border-line bg-canvas',
          'transition-[opacity,transform] duration-150 ease-out',
          open
            ? 'opacity-100 translate-y-0'
            : 'invisible pointer-events-none opacity-0 -translate-y-1',
        )}
      >
        <nav className="mx-auto max-w-content px-6 py-2 flex flex-col">
          {links.map((item) =>
            'children' in item ? (
              <div
                key={item.label}
                className="py-3 border-b border-white/[0.06] last:border-b-0"
              >
                {/* A plain-string className: twMerge would delete text-caption
                      (PRD 3 §0.5 trap 1) and the label would silently render at
                      the 13px inherited from the panel. */}
                <p className="text-caption uppercase tracking-[0.04em] text-fg-muted">
                  {item.label}
                </p>
                <div className="mt-1 flex flex-col">
                  {item.children.map((child) => {
                    const active = isActive(child);
                    const href =
                      viewer === 'signed-out'
                        ? `/login?redirectTo=${child.href}`
                        : child.href;
                    return (
                      <Link
                        key={child.href}
                        href={href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2 h-12 pl-4 transition-colors duration-150 ease-out',
                          active
                            ? 'text-brand font-medium'
                            : 'text-fg-muted hover:text-fg',
                        )}
                      >
                        {child.label}
                        {locked && (
                          <>
                            <LockGlyph />
                            <span className="sr-only"> (members only)</span>
                          </>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(item) ? 'page' : undefined}
                className={cn(
                  'flex items-center h-12 border-b border-white/[0.06] last:border-b-0 text-label transition-colors',
                  isActive(item)
                    ? 'text-brand font-medium'
                    : 'text-fg hover:text-brand',
                )}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>
      </div>
    </div>
  );
}
