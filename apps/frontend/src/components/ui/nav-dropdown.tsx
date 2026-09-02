'use client';

/**
 * NavDropdown — the "Studio" group in the public header.
 *
 * PRD 3 §3. The public header is a Server Component and cannot hold open/close
 * state; that is the same reason `mobile-nav.tsx` already exists as a client
 * island.
 *
 * This file never imports `lib/auth.ts`. It receives one string, `viewer`, so
 * the signed-in user's email never enters the RSC payload of every public page
 * (§5.3).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactElement } from 'react';

import { cn } from '@gitroom/frontend/lib/utils';

export type StudioViewer = 'member' | 'signed-out' | 'no-access';

export interface NavDropdownProps {
  label: string; // "Studio"
  items: { href: string; label: string }[];
  viewer: StudioViewer;
}

/**
 * Exported so `MobileNav` renders the identical mark — one lock, one file.
 *
 * Deliberately not imported from `components/ui/icons/index.tsx`: that module
 * imports `react-use-cookie` and `components/layout/mode.component` at module
 * scope and would drag both into the client bundle of every public page.
 */
export function LockGlyph(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-3.5 w-3.5 text-fgMuted shrink-0"
    >
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function ChevronGlyph({ open }: { open: boolean }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn(
        'h-3 w-3 shrink-0 transition-transform duration-150 ease-out',
        open && 'rotate-180',
      )}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** NavLink's rule: exact match, or nested under a non-root href. */
function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavDropdown({
  label,
  items,
  viewer,
}: NavDropdownProps): ReactElement {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /**
   * A ref, not state: the panel is `invisible` while closed and a
   * `visibility: hidden` element is not focusable, so arrow-opening cannot
   * focus in the same handler. The wanted end is parked here and read by the
   * effect below, after React has committed the visible panel.
   *
   * `react-hooks/set-state-in-effect` is `error` under
   * `eslint-config-next/core-web-vitals`, lint runs at `--max-warnings=0` and
   * CLAUDE.md bans `eslint-disable`, so an effect clearing a state value could
   * not ship. Nothing renders from this value, so a ref costs nothing.
   */
  const pendingFocus = useRef<'first' | 'last' | null>(null);

  const locked = viewer !== 'member';
  const anyChildActive = items.some((item) =>
    isActiveHref(pathname, item.href),
  );

  // Reused from mobile-nav.tsx: a mousedown listener mounted only while open.
  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const want = pendingFocus.current;
    if (want === null) return;
    pendingFocus.current = null;
    const list = Array.from(
      panelRef.current?.querySelectorAll<HTMLAnchorElement>(
        'a[role="menuitem"]',
      ) ?? [],
    );
    (want === 'first' ? list[0] : list[list.length - 1])?.focus();
  }, [open]);

  function itemList(): HTMLAnchorElement[] {
    return Array.from(
      panelRef.current?.querySelectorAll<HTMLAnchorElement>(
        'a[role="menuitem"]',
      ) ?? [],
    );
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const { key } = event;

    if (key === 'Escape') {
      if (!open) return; // no-op on a closed trigger
      event.preventDefault();
      close(true);
      return;
    }

    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      const down = key === 'ArrowDown';
      if (!open) {
        pendingFocus.current = down ? 'first' : 'last';
        setOpen(true);
        return;
      }
      const list = itemList();
      const n = list.length;
      if (n === 0) return;
      // Roving tabindex means indexOf returns -1 whenever focus is on the
      // trigger. Handle that explicitly — letting it fall through modular
      // arithmetic lands ArrowUp on the middle item.
      const at = list.indexOf(document.activeElement as HTMLAnchorElement);
      const next =
        at === -1 ? (down ? 0 : n - 1) : down ? (at + 1) % n : (at - 1 + n) % n;
      list[next]?.focus();
      return;
    }

    if (open && (key === 'Home' || key === 'End')) {
      event.preventDefault();
      const list = itemList();
      (key === 'Home' ? list[0] : list[list.length - 1])?.focus();
    }
  }

  /**
   * Tab is NOT handled on keydown: keydown is discrete, so React would commit
   * `invisible` before the browser runs the default Tab, blurring the focused
   * item and restarting the tab sequence at the skip link. Closing on focus-out
   * covers Tab from the trigger and from an item, and does not fire when an
   * Arrow key moves focus from trigger to item.
   */
  function onBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!wrapRef.current?.contains(event.relatedTarget)) setOpen(false);
  }

  return (
    <div
      ref={wrapRef}
      className="relative flex h-14 items-center"
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'px-3 py-1.5 rounded-md flex items-center gap-1 transition-colors duration-150 ease-out',
          anyChildActive
            ? 'text-aurora-cta font-medium'
            : 'text-fgMuted hover:text-fg hover:bg-white/[0.04]',
        )}
      >
        {label}
        <ChevronGlyph open={open} />
      </button>

      {/* Kept mounted: a node that mounts in its final state has no previous
          style to animate from, so a conditionally-mounted panel simply pops.
          `invisible` also removes the items from the tab order and the
          accessibility tree while closed. */}
      <div
        ref={panelRef}
        id={panelId}
        role="menu"
        aria-label={label}
        className={cn(
          'absolute left-0 top-full mt-2 z-50 min-w-[200px] p-1 rounded-lg',
          'bg-glass-elevated border border-borderGlass shadow-menu',
          'transition-[opacity,transform] duration-150 ease-out',
          open
            ? 'opacity-100 translate-y-0'
            : 'invisible pointer-events-none opacity-0 translate-y-1',
        )}
      >
        {items.map((item) => {
          // Computed from the item's OWN route, never from the /login href it
          // may have been rewritten to.
          const active = isActiveHref(pathname, item.href);
          const href =
            viewer === 'signed-out'
              ? `/login?redirectTo=${item.href}`
              : item.href;
          return (
            <Link
              key={item.href}
              href={href}
              role="menuitem"
              tabIndex={-1}
              aria-current={active ? 'page' : undefined}
              onClick={() => setOpen(false)}
              onKeyDown={(event) => {
                // next/link anchors activate on Enter only; Space scrolls the
                // document. `role="menuitem"` is expected to do both.
                if (event.key === ' ') {
                  event.preventDefault();
                  event.currentTarget.click();
                }
              }}
              className={cn(
                'flex items-center gap-2 h-10 px-3 rounded-md transition-colors duration-150 ease-out',
                active
                  ? 'text-aurora-cta font-medium'
                  : 'text-fgMuted hover:text-fg hover:bg-white/[0.04]',
              )}
            >
              {item.label}
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
  );
}
