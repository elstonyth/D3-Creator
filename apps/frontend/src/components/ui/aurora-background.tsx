'use client';
import { cn } from '@gitroom/frontend/lib/utils';
import React, { ReactNode } from 'react';

/**
 * Aceternity "Aurora Background" (ui.aceternity.com/components/aurora-background),
 * as requested for the work tracker. Changes from upstream: the import path;
 * no `<main>` wrapper (the signed-in layouts already render the page's one
 * `<main>`, and a second visible one is invalid HTML); `children` optional so
 * it can be a pure backdrop; and no `background-attachment: fixed` on the
 * animated layer — the caller positions the whole thing `fixed`, and that
 * attachment defeats compositing and breaks under a transform.
 *
 * The gradients read `--white`, `--black`, `--transparent` and the five
 * `--blue-*` / `--indigo-*` / `--violet-*` variables. This component sets them
 * on its own root (PALETTE below), so callers need no scoping. Upstream sets
 * them with a Tailwind plugin that exports EVERY theme colour to :root; this
 * project's colour tokens alias CSS variables of the same name
 * (`fg: var(--fg)`), which that plugin would turn into cycles.
 */
// The eight colours the gradients read, set on the root so the component is
// self-contained (upstream leaks them onto :root via a Tailwind plugin).
const PALETTE = {
  '--white': '#fff',
  '--black': '#000',
  '--transparent': 'transparent',
  '--blue-300': '#93c5fd',
  '--blue-400': '#60a5fa',
  '--blue-500': '#3b82f6',
  '--indigo-300': '#a5b4fc',
  '--violet-200': '#ddd6fe',
} as React.CSSProperties;

interface AuroraBackgroundProps extends React.HTMLProps<HTMLDivElement> {
  /** Optional here (required upstream) so it can be a pure backdrop layer. */
  children?: ReactNode;
  showRadialGradient?: boolean;
}

export const AuroraBackground = ({
  className,
  children,
  showRadialGradient = true,
  style,
  ...props
}: AuroraBackgroundProps) => {
  return (
    <div
      style={{ ...PALETTE, ...style }}
      className={cn(
        'relative flex flex-col  h-[100vh] items-center justify-center bg-zinc-50 dark:bg-zinc-900  text-slate-950 transition-bg',
        className,
      )}
      {...props}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div
          //   I'm sorry but this is what peak developer performance looks like // trigger warning
          className={cn(
            `
            [--white-gradient:repeating-linear-gradient(100deg,var(--white)_0%,var(--white)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--white)_16%)]
            [--dark-gradient:repeating-linear-gradient(100deg,var(--black)_0%,var(--black)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--black)_16%)]
            [--aurora:repeating-linear-gradient(100deg,var(--blue-500)_10%,var(--indigo-300)_15%,var(--blue-300)_20%,var(--violet-200)_25%,var(--blue-400)_30%)]
            [background-image:var(--white-gradient),var(--aurora)]
            dark:[background-image:var(--dark-gradient),var(--aurora)]
            [background-size:300%,_200%]
            [background-position:50%_50%,50%_50%]
            filter blur-[10px] invert dark:invert-0
            after:content-[""] after:absolute after:inset-0 after:[background-image:var(--white-gradient),var(--aurora)]
            after:dark:[background-image:var(--dark-gradient),var(--aurora)]
            after:[background-size:200%,_100%]
            after:animate-aurora after:mix-blend-difference
            pointer-events-none
            absolute -inset-[10px] opacity-50 will-change-transform`,

            showRadialGradient &&
              `[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,var(--transparent)_70%)]`,
          )}
        ></div>
      </div>
      {children}
    </div>
  );
};
