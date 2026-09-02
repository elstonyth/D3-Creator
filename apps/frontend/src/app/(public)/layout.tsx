import '../global.scss';
import { fontSans, fontMono } from '../fonts';
import { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { getAuthContext, isStudioMember } from '@gitroom/frontend/lib/auth';
import { SiteHeader } from '@gitroom/frontend/components/layout/site-header';
import { SiteFooter } from '@gitroom/frontend/components/layout/site-footer';
import type { StudioViewer } from '@gitroom/frontend/components/ui/nav-dropdown';
import { SITE_NAME, SITE_URL } from '@gitroom/frontend/lib/site';

const description =
  'A live showcase of the creators, brands and IPs D3 grows — follower counts, views and engagement across Instagram, TikTok, Facebook and Douyin, published unedited and refreshed daily.';

// Default metadata for every public page. metadataBase makes the generated OG
// image (opengraph-image.tsx) and any relative URLs resolve to absolute. Pages
// override title/description via their own `metadata` exports; openGraph and
// twitter inherit these defaults so shared links always render a card.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — we don't sell dreams, we show numbers`,
    template: `%s — ${SITE_NAME}`,
  },
  description,
  applicationName: SITE_NAME,
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    // og:url intentionally omitted — the per-page canonical
    // (alternates.canonical) carries the authoritative URL; a static one here
    // would be wrong on every subpage.
    title: `${SITE_NAME} — we don't sell dreams, we show numbers`,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — we don't sell dreams, we show numbers`,
    description,
  },
};

export default async function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  const auth = await getAuthContext();
  const studioViewer: StudioViewer = !auth
    ? 'signed-out'
    : isStudioMember(auth)
      ? 'member'
      : 'no-access';

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontMono.variable}`}
    >
      <head>
        <link rel="icon" href="/d3-logo.png?v=3" type="image/png" />
        <link rel="apple-touch-icon" href="/d3-logo.png?v=3" />
        {/* Page is already dark — tell Dark Reader to skip it so it doesn't
            inject data-darkreader-* attrs pre-hydration and cause a mismatch */}
        <meta name="darkreader-lock" />
      </head>
      <body className="dark flex min-h-screen flex-col bg-canvas font-sans text-fg antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-label focus:text-fg-on-brand"
        >
          Skip to content
        </a>

        <SiteHeader role={auth?.role ?? null} viewer={studioViewer} />

        {/* No gutter here on purpose: pages own their own <Container>, which is
            what lets a section run full-bleed (a bordered band, a table that
            bleeds to the edge on mobile) instead of every page being one
            1200px column. */}
        <main id="main" tabIndex={-1} className="w-full flex-1 overflow-x-clip">
          {children}
        </main>

        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
