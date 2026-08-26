/**
 * The business-profile vocabulary and its two server-side parsers.
 *
 * PRD 2 §10 "One test to ship with it" owns the export surface; PRD 2 §10
 * "The profile endpoint" owns `parseInlineProfile`; `plans/ai-tools/
 * amendment-1-profile-settings-and-voice-memory.md` §B5 owns `parseProfileUpdate`
 * and the two new vocabularies.
 *
 * This file is the single source of the stored VALUES. Display labels live in
 * the UI layer and in `lib/chat-prompt.ts` — never here.
 *
 * Every array below is `as const` and carries NO type annotation. Writing
 * `: readonly string[]` widens `(typeof X)[number]` back to `string`, and every
 * vocabulary type and both parsers silently stop checking anything.
 */

export const MAIN_PLATFORMS = [
  'tiktok',
  'reels',
  'douyin',
  'rednote',
  'facebook',
] as const;
export const ON_CAMERA = ['yes', 'no', 'sometimes'] as const;
export const CONTENT_LANGUAGES = [
  'chinese',
  'english',
  'malay',
  'mixed',
] as const;
/**
 * Owner request 2026-08-24. The language the coach writes ITS OWN prose in —
 * never the script's. `CONTENT_LANGUAGES` above still governs the script text,
 * and the two are independent on purpose: a Chinese-language seller may want
 * the coaching in English, which picking `'english'` above could never give
 * them without also handing a Chinese audience an English script.
 *
 * Two values, not four. `malay` and `mixed` describe an AUDIENCE; this
 * describes one reader, and "mixed" has no meaning for a single person's
 * preference. Nullable everywhere — `null` means "follow content_language",
 * which is what every row did before the column existed.
 */
export const REPLY_LANGUAGES = ['english', 'chinese'] as const;
export const BUSINESS_TYPES = [
  'retail',
  'food',
  'services',
  'property',
  'health',
  'education',
  'ecommerce',
  'other',
] as const;
export const TONES = ['friendly', 'expert', 'funny', 'direct'] as const;
export const TYPICAL_VIDEO_SECONDS = [30, 60, 90] as const;

/** Amendment 1. A JOB TITLE — `public.user_role` is the access role and is a
 *  different thing entirely (see the migration header). */
export const CREATOR_ROLES = [
  'business_owner',
  'content_creator',
  'marketer',
  'agency',
  'freelancer',
  'other',
] as const;
/** Amendment 1. Self-declared; never derived from `profile_snapshot`. */
export const REACH_BUCKETS = [
  'under_1k',
  '1k_10k',
  '10k_100k',
  '100k_plus',
] as const;

export type MainPlatform = (typeof MAIN_PLATFORMS)[number];
export type OnCamera = (typeof ON_CAMERA)[number];
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];
export type ReplyLanguage = (typeof REPLY_LANGUAGES)[number];
export type BusinessType = (typeof BUSINESS_TYPES)[number];
export type Tone = (typeof TONES)[number];
export type TypicalVideoSeconds = (typeof TYPICAL_VIDEO_SECONDS)[number];
export type CreatorRole = (typeof CREATOR_ROLES)[number];
export type Reach = (typeof REACH_BUCKETS)[number];

export const DEFAULT_CONTENT_LANGUAGE: ContentLanguage = 'english';

/**
 * Every `char_length` CHECK on `user_profile`, keyed by column. The drift test
 * asserts each entry against the migration. Nine entries since Amendment 1.
 */
/* `satisfies` rather than a `: Record<string, number>` annotation. The
 * annotation is what PRD 2 §10's table asks for and it type-checks the same
 * way, but it also widens the key set to `string`, so `PROFILE_LIMITS.voiceNotes`
 * compiles, yields `undefined`, and `value.length > undefined` is `false` — an
 * uncapped field that dies on the Postgres CHECK as a 500 instead of a 400.
 * `satisfies` keeps the shape the spec asks for and restores key checking. */
export const PROFILE_LIMITS = {
  what_you_sell: 200,
  who_buys_it: 200,
  business_type_other: 60,
  location: 120,
  business_name: 120,
  already_tried: 500,
  things_to_avoid: 500,
  content_pillars: 500,
  voice_notes: 500,
} satisfies Record<string, number>;

/**
 * One `public.user_profile` row, `snake_case`, one property per column in the
 * migration's order. A `select('*')` row assigns to this with no cast.
 *
 * The eight vocabulary columns are `string` and `typical_video_seconds` is
 * `number` — deliberately NOT the narrow union types. Narrowing them here makes
 * every consumer grow a second, local row type for what the database actually
 * returns.
 */
export interface BusinessProfile {
  id: string;
  user_id: string;
  what_you_sell: string;
  who_buys_it: string;
  main_platform: string;
  on_camera: string;
  content_language: string;
  business_type: string | null;
  business_type_other: string | null;
  location: string | null;
  tone: string | null;
  business_name: string | null;
  typical_video_seconds: number | null;
  already_tried: string | null;
  things_to_avoid: string | null;
  creator_role: string | null;
  reach: string | null;
  content_pillars: string | null;
  voice_notes: string | null;
  /** Added by a later `alter table`, so it is physically the LAST column, not
   *  this one. Grouped with the editable fields anyway — reading it after
   *  `updated_at` would put a user-facing setting below three metadata
   *  columns. */
  reply_language: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Shared primitives. All of them REJECT; none repairs.                        */
/* -------------------------------------------------------------------------- */

function asRecord(body: unknown): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}

function hasOnlyKeys(row: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(row).every((k) => allowed.includes(k));
}

/** Required text: must be a string, trimmed, then within `1..cap`. */
function requiredText(raw: unknown, cap: number): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value.length < 1 || value.length > cap) return null;
  return value;
}

/** Required slug: must be a string, trimmed, then in `vocab`. */
function requiredSlug(raw: unknown, vocab: readonly string[]): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return vocab.includes(value) ? value : null;
}

/**
 * Optional text. Absent, `null` or blank-after-trim means an explicit `null`;
 * anything over the cap, or any non-string, refuses the whole save.
 *
 * The `{ ok }` wrapper exists because `null` is a legitimate parsed value here,
 * so a bare `null` return could not also mean "rejected".
 */
function optionalText(
  raw: unknown,
  cap: number,
): { ok: true; value: string | null } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const value = raw.trim();
  if (value.length === 0) return { ok: true, value: null };
  if (value.length > cap) return { ok: false };
  return { ok: true, value };
}

/** Optional slug. Blank means "not set"; an unrecognised slug is never coerced. */
function optionalSlug(
  raw: unknown,
  vocab: readonly string[],
): { ok: true; value: string | null } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const value = raw.trim();
  if (value.length === 0) return { ok: true, value: null };
  return vocab.includes(value) ? { ok: true, value } : { ok: false };
}

/**
 * Optional number. A NUMBER or null — never a numeric string: trim is the only
 * normalisation these parsers perform, and `Number('30')` is a coercion. The
 * form converts its `<select>` value before calling.
 */
function optionalNumber(
  raw: unknown,
  vocab: readonly number[],
): { ok: true; value: number | null } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return { ok: false };
  return vocab.includes(raw) ? { ok: true, value: raw } : { ok: false };
}

/* -------------------------------------------------------------------------- */
/* The create path — PRD 2 §10 "The profile endpoint".                         */
/* -------------------------------------------------------------------------- */

export interface InlineProfileInput {
  what_you_sell: string;
  who_buys_it: string;
  main_platform: MainPlatform;
  on_camera: OnCamera;
}

export type InlineProfileParse =
  | { ok: true; value: InlineProfileInput }
  | { ok: false };

const INLINE_KEYS = [
  'what_you_sell',
  'who_buys_it',
  'main_platform',
  'on_camera',
];

/**
 * Trims, checks the two caps and the two vocabularies, rejects unknown keys.
 * Returns no per-field detail: the UI shows one sentence for any failure.
 *
 * Takes no `mode` parameter and has no `'update'` branch — the update path is
 * `parseProfileUpdate` below.
 */
export function parseInlineProfile(body: unknown): InlineProfileParse {
  const row = asRecord(body);
  if (row === null || !hasOnlyKeys(row, INLINE_KEYS)) return { ok: false };

  const what_you_sell = requiredText(
    row.what_you_sell,
    PROFILE_LIMITS.what_you_sell,
  );
  const who_buys_it = requiredText(row.who_buys_it, PROFILE_LIMITS.who_buys_it);
  const main_platform = requiredSlug(row.main_platform, MAIN_PLATFORMS);
  const on_camera = requiredSlug(row.on_camera, ON_CAMERA);

  if (
    what_you_sell === null ||
    who_buys_it === null ||
    main_platform === null ||
    on_camera === null
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      what_you_sell,
      who_buys_it,
      main_platform: main_platform as MainPlatform,
      on_camera: on_camera as OnCamera,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* The update path — Amendment 1 §B5.                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every editable column. `is_active`, `id`, `user_id`, `created_at` and
 * `updated_at` are absent on purpose and are rejected as unknown keys:
 * naming `is_active` in an UPDATE fires the `before insert or update of
 * is_active` trigger, which would make editing a business switch to it.
 */
export interface ProfileUpdateInput {
  what_you_sell: string;
  who_buys_it: string;
  main_platform: MainPlatform;
  on_camera: OnCamera;
  content_language: ContentLanguage;
  business_type: BusinessType | null;
  business_type_other: string | null;
  location: string | null;
  tone: Tone | null;
  business_name: string | null;
  typical_video_seconds: TypicalVideoSeconds | null;
  already_tried: string | null;
  things_to_avoid: string | null;
  creator_role: CreatorRole | null;
  reach: Reach | null;
  content_pillars: string | null;
  voice_notes: string | null;
  reply_language: ReplyLanguage | null;
}

export type ProfileUpdateParse =
  | { ok: true; value: ProfileUpdateInput }
  | { ok: false };

const UPDATE_KEYS = [
  'what_you_sell',
  'who_buys_it',
  'main_platform',
  'on_camera',
  'content_language',
  'business_type',
  'business_type_other',
  'location',
  'tone',
  'business_name',
  'typical_video_seconds',
  'already_tried',
  'things_to_avoid',
  'creator_role',
  'reach',
  'content_pillars',
  'voice_notes',
  'reply_language',
];

/**
 * Full replace of the editable column set. The five `not null` columns are
 * required; an absent or blank nullable key means an explicit `null`.
 *
 * Trims, checks every cap and vocabulary, rejects unknown keys. Returns no
 * per-field detail: the UI shows one sentence for any failure.
 *
 * Callers must send every editable key — the Settings form renders them all, so
 * a partial body is a crafted request, and a full replace of a partial body
 * would silently clear whatever it omitted.
 */
export function parseProfileUpdate(body: unknown): ProfileUpdateParse {
  const row = asRecord(body);
  if (row === null || !hasOnlyKeys(row, UPDATE_KEYS)) return { ok: false };
  // EVERY key must be present, not just "no unknown keys". A full replace of a
  // partial body silently nulls whatever it omitted and answers 200 — so a
  // trimmed retry, an autosave, or a deployed bundle older than these columns
  // would erase the user's brand-voice memory with no error anywhere.
  if (!UPDATE_KEYS.every((k) => k in row)) return { ok: false };

  const what_you_sell = requiredText(
    row.what_you_sell,
    PROFILE_LIMITS.what_you_sell,
  );
  const who_buys_it = requiredText(row.who_buys_it, PROFILE_LIMITS.who_buys_it);
  const main_platform = requiredSlug(row.main_platform, MAIN_PLATFORMS);
  const on_camera = requiredSlug(row.on_camera, ON_CAMERA);
  const content_language = requiredSlug(
    row.content_language,
    CONTENT_LANGUAGES,
  );

  if (
    what_you_sell === null ||
    who_buys_it === null ||
    main_platform === null ||
    on_camera === null ||
    content_language === null
  ) {
    return { ok: false };
  }

  const business_type = optionalSlug(row.business_type, BUSINESS_TYPES);
  const business_type_other = optionalText(
    row.business_type_other,
    PROFILE_LIMITS.business_type_other,
  );
  const location = optionalText(row.location, PROFILE_LIMITS.location);
  const tone = optionalSlug(row.tone, TONES);
  const business_name = optionalText(
    row.business_name,
    PROFILE_LIMITS.business_name,
  );
  const typical_video_seconds = optionalNumber(
    row.typical_video_seconds,
    TYPICAL_VIDEO_SECONDS,
  );
  const already_tried = optionalText(
    row.already_tried,
    PROFILE_LIMITS.already_tried,
  );
  const things_to_avoid = optionalText(
    row.things_to_avoid,
    PROFILE_LIMITS.things_to_avoid,
  );
  const creator_role = optionalSlug(row.creator_role, CREATOR_ROLES);
  const reach = optionalSlug(row.reach, REACH_BUCKETS);
  const content_pillars = optionalText(
    row.content_pillars,
    PROFILE_LIMITS.content_pillars,
  );
  const voice_notes = optionalText(row.voice_notes, PROFILE_LIMITS.voice_notes);
  const reply_language = optionalSlug(row.reply_language, REPLY_LANGUAGES);

  if (
    !business_type.ok ||
    !business_type_other.ok ||
    !location.ok ||
    !tone.ok ||
    !business_name.ok ||
    !typical_video_seconds.ok ||
    !already_tried.ok ||
    !things_to_avoid.ok ||
    !creator_role.ok ||
    !reach.ok ||
    !content_pillars.ok ||
    !voice_notes.ok ||
    !reply_language.ok
  ) {
    return { ok: false };
  }

  // The migration's `user_profile_other_needs_text` constraint forbids BOTH
  // directions, so both are checked here: a Postgres 23514 would otherwise
  // surface as a 500 on a request the parser could have refused with a 400.
  const isOther = business_type.value === 'other';
  if (isOther !== (business_type_other.value !== null)) return { ok: false };

  return {
    ok: true,
    value: {
      what_you_sell,
      who_buys_it,
      main_platform: main_platform as MainPlatform,
      on_camera: on_camera as OnCamera,
      content_language: content_language as ContentLanguage,
      business_type: business_type.value as BusinessType | null,
      business_type_other: business_type_other.value,
      location: location.value,
      tone: tone.value as Tone | null,
      business_name: business_name.value,
      typical_video_seconds:
        typical_video_seconds.value as TypicalVideoSeconds | null,
      already_tried: already_tried.value,
      things_to_avoid: things_to_avoid.value,
      creator_role: creator_role.value as CreatorRole | null,
      reach: reach.value as Reach | null,
      content_pillars: content_pillars.value,
      voice_notes: voice_notes.value,
      reply_language: reply_language.value as ReplyLanguage | null,
    },
  };
}
