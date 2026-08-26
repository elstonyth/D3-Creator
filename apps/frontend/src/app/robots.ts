import type { MetadataRoute } from 'next';
import { SITE_URL } from '@gitroom/frontend/lib/site';

// Served at /robots.txt. Public marketing/leaderboard pages are crawlable;
// authed dashboards, auth flow, and API routes are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // '/studio' is PRD 2 §10 "Access gating" requirement 1, which C1 was
      // meant to add and did not. Every /studio page is gated and carries
      // `robots: { index: false }`, so this is defence in depth, not the only
      // barrier.
      disallow: ['/admin', '/me', '/api', '/auth', '/login', '/studio'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
