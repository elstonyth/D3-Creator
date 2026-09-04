# DESIGN.md

D3 Creator's visual contract. Read before writing UI.

## 0. How to read this file

`apps/frontend/tailwind.config.cjs` and `apps/frontend/src/app/colors.scss` own
the values. This file owns the **rules** — what to reach for, what to avoid, and
why — plus the few values worth stating in prose because a reader needs them
before their first commit.

Every number below is quoted from those two files. If they disagree with this
file, **the config is right and this file is the bug**. The previous version of
this document drifted far enough that it described token names (`--text-3xl`,
`--space-8`), hex values, easing curves and a set of social platforms that have
never existed in this repo. Do not restate a value here you have not just read.

## 1. Two vocabularies

Six routes are **frozen** — they must render byte-identically to `main`:

`/` · `/about` · `/dashboard` · `/leaderboard` · `/privacy` · `/terms`

Frozen includes shared chrome: header, footer, font. Everything else — the
signed-in surfaces under `/studio`, `/classes`, `/creators`, `/admin` — was
rebuilt and uses a cleaner set of names.

Both vocabularies resolve to **the same CSS variables**. The rebuilt names are
additive aliases in `tailwind.config.cjs`, not a second palette, so the two
cannot drift apart:

| Rebuilt name    | Legacy name            | Resolves to      |
| --------------- | ---------------------- | ---------------- |
| `bg-surface`    | `bg-glass-base`        | `--glass-base`   |
| `border-line`   | `border-borderGlass`   | `--border-glass` |
| `text-fg-muted` | `text-customColor18`\* | `--fg-muted`     |
| `bg-canvas`     | `bg-canvas`            | `--canvas`       |

\* `--color-custom*` is deprecated. Do not add new uses; existing ones stay
until the route they live on is rebuilt.

**Write new UI in the rebuilt vocabulary.** Touch a frozen route only to fix a
bug, and prove you did not change its rendering:

```bash
git diff --stat main -- 'apps/frontend/src/app/(public)/page.tsx' 'apps/frontend/src/app/(public)/about' 'apps/frontend/src/app/(public)/dashboard' 'apps/frontend/src/app/(public)/leaderboard' 'apps/frontend/src/app/(public)/privacy' 'apps/frontend/src/app/(public)/terms' 'apps/frontend/src/app/(public)/layout.tsx' apps/frontend/src/app/colors.scss apps/frontend/src/app/fonts.ts
```

Empty output means the frozen surface is intact. Any row is a regression.

## 2. Color

### The yellow rule

`#F2E600` is the only saturated colour on the page. It marks **one** thing per
view — the primary action, or the row the user is on. Never a background for
text at body size, never a border on a resting element, never decoration.

A screen with two yellow things has one too many. This is the rule the design
lives or dies by; everything else is grayscale discipline.

Yellow-on-dark passes contrast. **Dark-on-yellow needs `text-brand-darker`**
(`#0E0D00`), which is what `Button` variant `primary` does.

### Brand ramp

`brand.DEFAULT` = `brand.500` = `#F2E600`.

The ramp is Tailwind's `yellow` scale with 500 swapped for the brand hue. So
**600–800 are amber-brown** (`#CA8A04`, `#A16207`, `#854D0E`), not darker shades
of `#F2E600`. They read as a different colour, and are used only as near-black
backings (`brand-900` `#4D3800`, `brand-950` `#1A1900`).

Consequence: to darken the brand, do not walk up the ramp. Use `brand-dark`
(`#9C9400`) or `brand-darker` (`#0E0D00`).

### Surfaces

Five steps, all near-black. Depth comes from these plus a 1px border — not from
shadow.

| Token              | Value     | Use                         |
| ------------------ | --------- | --------------------------- |
| `--canvas-deep`    | `#050507` | Behind the canvas           |
| `--canvas`         | `#0A0A0D` | Page background             |
| `--glass-subtle`   | `#0F0F12` | Inset wells, table stripes  |
| `--glass-base`     | `#16161A` | Cards, panels               |
| `--glass-elevated` | `#1A1A1F` | Popovers, dropdowns, modals |

Borders: `--border-glass` `rgba(255,255,255,0.08)` at rest,
`--border-glass-strong` `rgba(255,255,255,0.16)` on hover and focus-within.
Modal scrim: `--scrim` `rgba(0,0,0,0.72)`.

### Text

`--fg` `#FFFFFF` · `--fg-muted` `rgba(255,255,255,0.62)` · `--fg-subtle`
`rgba(255,255,255,0.55)`

Three levels, no more. Labels and captions take `fg-muted`; `fg-subtle` is for
text that is present but not meant to be read — timestamps, row counts.

### `aurora.*` is misnamed

`aurora.cyan`, `aurora.violet` and `aurora.pink` are **white at 0.78, 0.85 and
0.62 alpha**. There is no cyan, violet or pink anywhere in this product. The
names are residue from an earlier direction.

`aurora.cta` (`#F2E600`) and `aurora.ctaHover` (`#FDE047`) are real, and are
what `Button` variant `primary` uses.

Do not reach for `aurora.*` in new code — use `text-fg` / `text-fg-muted` for
the whites and `brand` for the yellow. Renaming is a separate change; the
existing uses are correct, just badly labelled.

## 3. Type

Geist and Geist Mono, loaded in `apps/frontend/src/app/fonts.ts`.

The scale is named by role, not size. Use the role.

| Class             | Size                       | Weight | Tracking   |
| ----------------- | -------------------------- | ------ | ---------- |
| `text-display-1`  | `clamp(48px, 6vw, 88px)`   | 700    | `-0.035em` |
| `text-display-2`  | `clamp(36px, 4vw, 56px)`   | 700    | `-0.03em`  |
| `text-section`    | 32px                       | 600    | `-0.025em` |
| `text-subsection` | 22px                       | 600    | `-0.015em` |
| `text-heading`    | 18px                       | 600    | `-0.01em`  |
| `text-metric-lg`  | `clamp(30px, 3.4vw, 44px)` | 600    | `-0.03em`  |
| `text-metric`     | 24px                       | 600    | `-0.02em`  |
| `text-body-lg`    | 17px / 1.6                 | —      | —          |
| `text-body`       | 15px / 1.6                 | —      | —          |
| `text-body-sm`    | 14px / 1.55                | —      | —          |
| `text-label`      | 13px                       | 500    | —          |
| `text-caption`    | 12px                       | 500    | —          |
| `text-micro`      | 11px                       | 500    | `0.03em`   |

Weight and tracking ship **inside** the class. Do not add `font-bold` or
`tracking-tight` on top — you will fight the token.

Numbers in columns take `.tnum` (`global.scss`) so digits stop reflowing as
values change.

Body copy caps at `max-w-prose` (760px).

## 4. Radius, elevation, focus

Radius: `sm` 4 · default/`md` 6 · `lg` 8 · `xl` 10 · `2xl` 12 · `3xl` 16 ·
`4xl` 24 · `full`.

Nothing currently uses `4xl` — 16px is the effective ceiling, and a 24px corner
will look foreign next to everything else. Pills (`full`) are for badges and
avatars only, never buttons.

Elevation is **border + surface step**, not shadow. `shadow-glass` / `glassSm` /
`glassLg` exist but earn their keep only on things that float above the page:
dropdown, popover, modal. A card does not float.

Focus is a hard requirement, not a preference:

```
shadow-focusRing   0 0 0 2px rgba(242, 230, 0, 0.40)
shadow-focus       0 0 0 2px rgba(242, 230, 0, 0.45)
```

Every interactive element carries `focus-visible:shadow-focusRing`. Never
`outline-none` without replacing the ring in the same rule.

## 5. Motion

Default duration is **180ms**. `ease-spring` and `ease-liquid` are both
`cubic-bezier(0, 0, 0.2, 1)` — one curve under two names.

- Animate `opacity`, `transform`, and colour. Nothing else.
- No parallax, no scroll-jacking, no particles, no animated gradients, and no
  entrance animation on content the user came to read.
- Hover changes colour, not size. No transform on hover for anything in a list.
- `global.scss` already honours `prefers-reduced-motion` globally. Do not
  re-implement it per component, and do not defeat it with inline styles.

## 6. Layout

`max-w-content` is 1200px, `max-w-prose` is 760px. Page gutters are
`px-6 md:px-8`. The public header is `h-14`, `sticky top-0 z-50`, solid
`bg-canvas` with a bottom border — **no backdrop blur**.

Spacing uses Tailwind's default 4px scale. There are no `--space-*` custom
properties in this repo; a reference to one is a bug.

## 7. Platforms

Five, defined in `apps/frontend/src/components/ui/platform-icons.tsx`:

`instagram` · `tiktok` · `facebook` · `douyin` · `xiaohongshu`

Icons come from that file. Never inline an SVG or pull a brand mark from a CDN,
and never colour a platform icon with its brand colour — they render in
`fg-muted` so no platform outranks another in a list.

## 8. Known inconsistencies

Recorded so the next reader does not mistake them for intent:

1. `aurora.cyan/violet/pink` are white (§2).
2. `brand-600`–`brand-800` are amber-brown, not brand-hue shades (§2).
3. `--glass-modal` and `--glass-elevated` are both `#1A1A1F` — a duplicate.
4. `.light` is defined in `colors.scss` but no theme toggle ships; the product
   is dark-only today.
5. `4xl` radius (24px) is defined and unused.

None are urgent. Fix them in a change that already touches the area, not as a
sweep.

## 9. The one check

Before opening a PR that touches UI:

```bash
cd apps/frontend && npx tsc --noEmit
```

`pnpm lint` and `pnpm test` do **not** type-check. `strictNullChecks` is on, so
CI can fail red while both of those are green.
