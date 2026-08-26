# Product

## Register

product

## Users

- **Agency staff** (the operator): manages clients and creators, provisions accounts, checks scrape health. Desk context, dense data is welcome.
- **Clients / creators** (members): sign in to see their own numbers (`/me`), take the classes, and use the Studio tools (Video Analyzer, Script Coach).
- **Public visitors**: browse the login-free dashboard and leaderboard — proof-of-work surfaces that sell the agency.

Job to be done: see real cross-platform performance numbers without connecting any account, and (for members) improve their content with the agency's method.

## Product Purpose

Login-free social analytics across Instagram, TikTok, Facebook, RedNote and Douyin. Scraper-based — no OAuth, no platform APIs. One agency tool that doubles as a white-label client portal. Success: a visitor trusts the numbers at a glance; a member reaches their tool in one click.

## Brand Personality

Calm, confident, editorial (DESIGN.md §1). Linear-flat: near-black canvas, hairline borders, one high-energy yellow used like a flashlight beam. Every pixel has a job.

## Anti-references

- Aurora/mesh gradients, glow, gradient text, purple-cyan SaaS slop (DESIGN.md §8 is the enforced list).
- Dashboard-template look: hero metrics with gradient accents, identical card grids.
- Anything that reads "analytics SaaS free tier" — this is an agency's own instrument.

## Design Principles

1. **Yellow is scarce** — logo, one CTA per screen, focus ring, active nav. Everything else neutral (the Yellow Ledger wins every argument).
2. **Numbers first** — the data is the product; chrome recedes.
3. **Earned familiarity** — standard affordances (top nav, tables, dropdowns), no invented controls.
4. **Honest states** — failed, queued, empty and locked states are labeled, never masked.
5. **One vocabulary** — same button/link/table treatment on every screen.

## Accessibility & Inclusion

- Keyboard-complete nav (dropdown implements the full menu keyboard table; tested).
- Status never by color alone — icon + label, since the palette is yellow-mono.
- `prefers-reduced-motion` honored globally; motion is 150–200ms ease-out only.
- Screen-reader text for locked/members-only affordances.
