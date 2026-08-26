'use client';

/**
 * The Settings edit form — `plans/ai-tools/amendment-1-profile-settings-and-voice-memory.md`
 * Part C.ii (owner decision 10).
 *
 * Edits the caller's ACTIVE `user_profile` row through `PATCH
 * /api/studio/profile`. It builds no request handler.
 *
 * TWO THINGS HERE ARE LOAD-BEARING:
 *
 * 1. Every field is initialised from the stored row, and re-synced when the
 *    server sends a different one. `parseProfileUpdate` is a full replace, so a
 *    form that rendered empty and was then saved would null every field the
 *    user did not retype.
 * 2. `is_active` is never in the body. The parser rejects it as an unknown key,
 *    and the route selects its target row by `is_active` rather than by an id —
 *    editing a business must not switch to it.
 *
 * DESIGN.md governs the surface: near-black, hairline borders, Inter, and ONE
 * yellow per screen. That yellow is Save — this page's primary action — so
 * nothing else here may use it.
 */

import { ChevronDownIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';

import { Button } from '@gitroom/frontend/components/ui/button';
import {
  BUSINESS_TYPES,
  CONTENT_LANGUAGES,
  CREATOR_ROLES,
  MAIN_PLATFORMS,
  ON_CAMERA,
  PROFILE_LIMITS,
  REACH_BUCKETS,
  REPLY_LANGUAGES,
  TONES,
  TYPICAL_VIDEO_SECONDS,
  parseProfileUpdate,
  type BusinessProfile,
} from '@gitroom/frontend/lib/business-profile';
import { renderProfileBlock } from '@gitroom/frontend/lib/chat-prompt';

/* §7.4's two strings, copied verbatim, with NO focus classes —
   `global.scss:174` supplies the ring. They live in two components now; that is
   the accepted ceiling until a third form needs them. */
const fieldBox =
  'h-10 w-full rounded-md bg-glass-subtle border border-borderGlass px-3 ' +
  'text-body text-fg placeholder:text-fgSubtle ' +
  'transition-colors duration-150 ease-out ' +
  'hover:border-borderGlassStrong ' +
  'disabled:opacity-50 disabled:pointer-events-none';
const selectBox = `${fieldBox} appearance-none pr-9`;
const areaBox =
  'min-h-[88px] w-full rounded-md bg-glass-subtle border border-borderGlass px-3 py-2 ' +
  'text-body text-fg placeholder:text-fgSubtle resize-y ' +
  'transition-colors duration-150 ease-out ' +
  'hover:border-borderGlassStrong ' +
  'disabled:opacity-50 disabled:pointer-events-none';

/** §6's display labels, plus the six Amendment 1 exceptions. Kept against §6 by
 *  hand — the drift test covers stored VALUES only. */
const LABELS: Record<string, Record<string, string>> = {
  main_platform: {
    tiktok: 'TikTok',
    reels: 'Instagram Reels',
    douyin: 'Douyin',
    rednote: 'RedNote',
    facebook: 'Facebook',
  },
  on_camera: { yes: 'Yes', no: 'No', sometimes: 'Sometimes' },
  content_language: {
    chinese: 'Chinese',
    english: 'English',
    malay: 'Malay',
    mixed: 'Mixed',
  },
  reply_language: { english: 'English', chinese: 'Chinese' },
  business_type: {
    retail: 'Retail',
    food: 'Food',
    services: 'Services',
    property: 'Property',
    health: 'Health',
    education: 'Education',
    ecommerce: 'E-commerce',
    other: 'Other',
  },
  tone: {
    friendly: 'Friendly',
    expert: 'Expert',
    funny: 'Funny',
    direct: 'Direct',
  },
  creator_role: {
    business_owner: 'Business owner',
    content_creator: 'Content creator',
    marketer: 'Marketer',
    agency: 'Agency',
    freelancer: 'Freelancer',
    other: 'Other',
  },
  reach: {
    under_1k: 'Under 1,000',
    '1k_10k': '1,000–10,000',
    '10k_100k': '10,000–100,000',
    '100k_plus': '100,000+',
  },
};

const FAILURE = 'Could not save that. Try again.';
const SAVED = 'Saved.';
const LEAVING = 'You have unsaved changes.';

/** The measured ceiling of `renderProfileBlock`, pinned by chat-prompt.test.ts. */
const BLOCK_CEILING = 3075;

/** The 18 editable columns as form state. Extracted so the initial seed and the
 *  re-sync below cannot drift apart. */
function formFrom(profile: BusinessProfile) {
  return {
    what_you_sell: profile.what_you_sell,
    who_buys_it: profile.who_buys_it,
    main_platform: profile.main_platform,
    on_camera: profile.on_camera,
    content_language: profile.content_language,
    business_type: profile.business_type ?? '',
    business_type_other: profile.business_type_other ?? '',
    location: profile.location ?? '',
    tone: profile.tone ?? '',
    business_name: profile.business_name ?? '',
    typical_video_seconds:
      profile.typical_video_seconds === null
        ? ''
        : String(profile.typical_video_seconds),
    already_tried: profile.already_tried ?? '',
    things_to_avoid: profile.things_to_avoid ?? '',
    creator_role: profile.creator_role ?? '',
    reach: profile.reach ?? '',
    content_pillars: profile.content_pillars ?? '',
    voice_notes: profile.voice_notes ?? '',
    reply_language: profile.reply_language ?? '',
  };
}

type FormState = ReturnType<typeof formFrom>;

/**
 * Form state as a `BusinessProfile`, so the preview can run the SAME
 * `renderProfileBlock` the model is given. Blank means null here exactly as it
 * does in `parseProfileUpdate`, which is what makes a line disappear from the
 * preview the moment its field is emptied.
 */
function toPreviewProfile(
  profile: BusinessProfile,
  form: FormState,
): BusinessProfile {
  const orNull = (v: string) => (v.trim() === '' ? null : v);
  return {
    ...profile,
    what_you_sell: form.what_you_sell,
    who_buys_it: form.who_buys_it,
    main_platform: form.main_platform,
    on_camera: form.on_camera,
    content_language: form.content_language,
    business_type: orNull(form.business_type),
    business_type_other: orNull(form.business_type_other),
    location: orNull(form.location),
    tone: orNull(form.tone),
    business_name: orNull(form.business_name),
    typical_video_seconds:
      form.typical_video_seconds === ''
        ? null
        : Number(form.typical_video_seconds),
    already_tried: orNull(form.already_tried),
    things_to_avoid: orNull(form.things_to_avoid),
    creator_role: orNull(form.creator_role),
    reach: orNull(form.reach),
    content_pillars: orNull(form.content_pillars),
    voice_notes: orNull(form.voice_notes),
    reply_language: orNull(form.reply_language),
  };
}

/* -------------------------------------------------------------------------- */

/**
 * Section headings are sentence-case and tight-tracked — DESIGN.md §3 forbids
 * uppercase tracking-wide titles in this system.
 */
function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: ReactElement;
}): ReactElement {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-heading text-fg">{title}</h2>
        <p className="text-body-sm text-fgMuted max-w-[62ch]">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * One labelled control. The counter appears only in the last 20% of the cap:
 * a number that sits there permanently is noise, and the reason a counter
 * exists at all is that `maxLength` otherwise stops the keystroke in silence.
 */
function Field({
  label,
  required = false,
  value,
  max,
  children,
}: {
  label: string;
  required?: boolean;
  value?: string;
  max?: number;
  children: ReactElement;
}): ReactElement {
  const near =
    max !== undefined && value !== undefined && value.length > max * 0.8;
  const full = max !== undefined && value !== undefined && value.length >= max;
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-label text-fgMuted">
          {label}
          {required ? <span className="text-fgSubtle"> · required</span> : null}
        </span>
        {near ? (
          <span
            className={`text-caption tabular-nums ${full ? 'text-fg' : 'text-fgSubtle'}`}
          >
            {value?.length}/{max}
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  disabled,
  required,
  options,
  labels,
  placeholder = 'Choose one',
}: {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  required: boolean;
  options: readonly string[];
  labels: Record<string, string>;
  /** What the blank option reads on an OPTIONAL field. "Choose one" is right
   *  where blank just means unset; it is wrong where blank has its own
   *  behaviour, which the user has to be able to read off the control. */
  placeholder?: string;
}): ReactElement {
  return (
    <div className="relative">
      <select
        required={required}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectBox}
      >
        {/* On an optional field `''` is a legal submission meaning "not set",
            unlike §7.4's two required selects where it blocks the submit. */}
        <option value="" disabled={required}>
          {placeholder}
        </option>
        {options.map((slug) => (
          <option key={slug} value={slug}>
            {labels[slug] ?? slug}
          </option>
        ))}
      </select>
      {/* pointer-events-none or the glyph swallows the click. */}
      <ChevronDownIcon
        aria-hidden
        className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fgMuted pointer-events-none"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function ProfileSettingsForm({
  profile,
}: {
  profile: BusinessProfile;
}): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Every field starts from the stored row. See the header comment.
  const [form, setForm] = useState(() => formFrom(profile));

  // Re-sync when the server sends a different row. `useState`'s initialiser runs
  // ONCE, so after `router.refresh()` the form would otherwise keep showing what
  // was typed rather than what was stored — visible whenever the parser trimmed
  // a value, and wrong outright if another tab edited the same profile. This is
  // React's documented "adjust state during render" pattern.
  const [syncedAt, setSyncedAt] = useState(profile.updated_at);
  if (profile.updated_at !== syncedAt) {
    setSyncedAt(profile.updated_at);
    setForm(formFrom(profile));
    setMessage('');
  }

  const stored = formFrom(profile);
  const dirty = (Object.keys(stored) as (keyof FormState)[]).some(
    (k) => stored[k] !== form[k],
  );

  // A 17-field form with no guard loses everything to a stray back-navigation.
  // The browser owns the wording; setting returnValue is what arms it.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function set(key: keyof FormState, next: string): void {
    setForm((prev) => ({ ...prev, [key]: next }));
    setMessage('');
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setMessage('');

    // The `<select>` value is a string; the parser accepts a number or null and
    // never coerces, so the conversion happens here, at the edge.
    const parsed = parseProfileUpdate({
      ...form,
      typical_video_seconds:
        form.typical_video_seconds === ''
          ? null
          : Number(form.typical_video_seconds),
    });
    if (!parsed.ok) {
      setMessage(FAILURE);
      return;
    }

    setPending(true);
    try {
      const res = await fetch('/api/studio/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.value),
      });
      // 200, not 201: this updates, the create form four files away inserts.
      // Deliberately different; do not "fix" either to match the other.
      if (res.ok) {
        setMessage(SAVED);
        router.refresh();
      } else {
        setMessage(FAILURE);
      }
    } catch {
      setMessage(FAILURE);
    }
    // Unlike the first-run form, this one does not unmount, so `pending` IS
    // cleared on the success path.
    setPending(false);
  }

  const isOther = form.business_type === 'other';
  const preview = renderProfileBlock(toPreviewProfile(profile, form));
  const grid = 'grid grid-cols-1 md:grid-cols-2 gap-4';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-10">
      <Section
        title="The business"
        blurb="Who you are and what you sell. The coach writes every script against this, so vague answers get vague scripts."
      >
        <div className={grid}>
          <Field
            label="What you sell"
            required
            value={form.what_you_sell}
            max={PROFILE_LIMITS.what_you_sell}
          >
            <input
              type="text"
              required
              maxLength={PROFILE_LIMITS.what_you_sell}
              disabled={pending}
              placeholder="e.g. second-hand phones"
              value={form.what_you_sell}
              onChange={(e) => set('what_you_sell', e.target.value)}
              className={fieldBox}
            />
          </Field>

          <Field
            label="Who buys it"
            required
            value={form.who_buys_it}
            max={PROFILE_LIMITS.who_buys_it}
          >
            <input
              type="text"
              required
              maxLength={PROFILE_LIMITS.who_buys_it}
              disabled={pending}
              placeholder="e.g. students and young workers"
              value={form.who_buys_it}
              onChange={(e) => set('who_buys_it', e.target.value)}
              className={fieldBox}
            />
          </Field>

          <Field label="Business type">
            <Select
              required={false}
              disabled={pending}
              value={form.business_type}
              onChange={(next) =>
                // Clearing the free text when the type stops being 'other' is
                // not a nicety: the DB constraint forbids a non-null free text
                // on any other type, and the parser refuses the save either way.
                setForm((prev) => ({
                  ...prev,
                  business_type: next,
                  business_type_other:
                    next === 'other' ? prev.business_type_other : '',
                }))
              }
              options={BUSINESS_TYPES}
              labels={LABELS.business_type}
            />
          </Field>

          {isOther ? (
            <Field
              label="Which trade, exactly?"
              required
              value={form.business_type_other}
              max={PROFILE_LIMITS.business_type_other}
            >
              <input
                type="text"
                required
                maxLength={PROFILE_LIMITS.business_type_other}
                disabled={pending}
                placeholder="e.g. phone repair and trade-in"
                value={form.business_type_other}
                onChange={(e) => set('business_type_other', e.target.value)}
                className={fieldBox}
              />
            </Field>
          ) : null}

          <Field label="Your role">
            <Select
              required={false}
              disabled={pending}
              value={form.creator_role}
              onChange={(next) => set('creator_role', next)}
              options={CREATOR_ROLES}
              labels={LABELS.creator_role}
            />
          </Field>

          <Field label="Audience size">
            <Select
              required={false}
              disabled={pending}
              value={form.reach}
              onChange={(next) => set('reach', next)}
              options={REACH_BUCKETS}
              labels={LABELS.reach}
            />
          </Field>

          <Field
            label="Business name"
            value={form.business_name}
            max={PROFILE_LIMITS.business_name}
          >
            <input
              type="text"
              maxLength={PROFILE_LIMITS.business_name}
              disabled={pending}
              placeholder="e.g. Ah Meng Mobile"
              value={form.business_name}
              onChange={(e) => set('business_name', e.target.value)}
              className={fieldBox}
            />
          </Field>

          <Field
            label="Where you are"
            value={form.location}
            max={PROFILE_LIMITS.location}
          >
            <input
              type="text"
              maxLength={PROFILE_LIMITS.location}
              disabled={pending}
              placeholder="e.g. Kuala Lumpur"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              className={fieldBox}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="How you make videos"
        blurb="Length, language, and whether a script can put you on camera at all. Reply language is the odd one out — it changes how the coach talks to you, not what the script says."
      >
        <div className={grid}>
          <Field label="Main platform" required>
            <Select
              required
              disabled={pending}
              value={form.main_platform}
              onChange={(next) => set('main_platform', next)}
              options={MAIN_PLATFORMS}
              labels={LABELS.main_platform}
            />
          </Field>

          <Field label="Do you appear on camera?" required>
            <Select
              required
              disabled={pending}
              value={form.on_camera}
              onChange={(next) => set('on_camera', next)}
              options={ON_CAMERA}
              labels={LABELS.on_camera}
            />
          </Field>

          <Field label="Content language" required>
            <Select
              required
              disabled={pending}
              value={form.content_language}
              onChange={(next) => set('content_language', next)}
              options={CONTENT_LANGUAGES}
              labels={LABELS.content_language}
            />
          </Field>

          {/* Optional, and blank is the interesting value: it means "follow
              Content language", which is what every profile did before this
              control existed. The blank option has to SAY that — "Choose one"
              would read as an unfinished field. */}
          <Field label="Reply language">
            <Select
              required={false}
              disabled={pending}
              value={form.reply_language}
              onChange={(next) => set('reply_language', next)}
              options={REPLY_LANGUAGES}
              labels={LABELS.reply_language}
              placeholder="Same as content language"
            />
          </Field>

          <Field label="Typical video length">
            <Select
              required={false}
              disabled={pending}
              value={form.typical_video_seconds}
              onChange={(next) => set('typical_video_seconds', next)}
              options={TYPICAL_VIDEO_SECONDS.map(String)}
              labels={{ '30': '30s', '60': '60s', '90': '90s' }}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Voice and limits"
        blurb="What the coach remembers about how you sound. It is read, never guessed at — anything you leave blank is simply not sent."
      >
        <div className="flex flex-col gap-4">
          <div className={grid}>
            <Field label="Tone">
              <Select
                required={false}
                disabled={pending}
                value={form.tone}
                onChange={(next) => set('tone', next)}
                options={TONES}
                labels={LABELS.tone}
              />
            </Field>
          </div>

          <div className={grid}>
            <Field
              label="Content pillars"
              value={form.content_pillars}
              max={PROFILE_LIMITS.content_pillars}
            >
              <textarea
                maxLength={PROFILE_LIMITS.content_pillars}
                disabled={pending}
                placeholder="The ideas you keep coming back to"
                value={form.content_pillars}
                onChange={(e) => set('content_pillars', e.target.value)}
                className={areaBox}
              />
            </Field>

            <Field
              label="Voice notes"
              value={form.voice_notes}
              max={PROFILE_LIMITS.voice_notes}
            >
              <textarea
                maxLength={PROFILE_LIMITS.voice_notes}
                disabled={pending}
                placeholder="Vocabulary, pacing, humour, phrases worth keeping"
                value={form.voice_notes}
                onChange={(e) => set('voice_notes', e.target.value)}
                className={areaBox}
              />
            </Field>

            <Field
              label="What you have already tried"
              value={form.already_tried}
              max={PROFILE_LIMITS.already_tried}
            >
              <textarea
                maxLength={PROFILE_LIMITS.already_tried}
                disabled={pending}
                placeholder="e.g. posted 10 videos, no views"
                value={form.already_tried}
                onChange={(e) => set('already_tried', e.target.value)}
                className={areaBox}
              />
            </Field>

            <Field
              label="Things to avoid"
              value={form.things_to_avoid}
              max={PROFILE_LIMITS.things_to_avoid}
            >
              <textarea
                maxLength={PROFILE_LIMITS.things_to_avoid}
                disabled={pending}
                placeholder="e.g. no price talk, no discount claims"
                value={form.things_to_avoid}
                onChange={(e) => set('things_to_avoid', e.target.value)}
                className={areaBox}
              />
            </Field>
          </div>
        </div>
      </Section>

      {/* The whole point of the panel: brand-voice memory is otherwise
          invisible. This runs the SAME renderProfileBlock the model receives,
          so a line vanishing here is a line the coach really stops seeing. */}
      <section className="rounded-2xl border border-borderGlass bg-glass-base overflow-hidden">
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          aria-expanded={showPreview}
          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left transition-colors duration-150 ease-out hover:bg-white/[0.02]"
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-label text-fg">What the coach reads</span>
            <span className="text-body-sm text-fgMuted">
              The exact text sent with every script and every video analysis.
            </span>
          </span>
          <span className="flex items-center gap-3 shrink-0">
            <span className="text-caption text-fgSubtle tabular-nums">
              {preview.length}/{BLOCK_CEILING}
            </span>
            <ChevronDownIcon
              aria-hidden
              className={`h-4 w-4 text-fgMuted transition-transform duration-150 ease-out ${
                showPreview ? 'rotate-180' : ''
              }`}
            />
          </span>
        </button>
        {showPreview ? (
          <pre className="border-t border-borderGlass bg-glass-subtle px-5 py-4 overflow-x-auto text-caption leading-[1.7] text-fgMuted whitespace-pre">
            {preview}
          </pre>
        ) : null}
      </section>

      {/* Sticky so the primary action is reachable from anywhere in a form this
          long, and so unsaved state is never scrolled out of sight. */}
      <div className="sticky bottom-0 -mx-1 px-1 pb-1 pt-3 bg-canvas/95 backdrop-blur-sm border-t border-borderGlass flex items-center justify-between gap-4">
        <p
          role="status"
          className={`text-body-sm ${
            message === FAILURE ? 'text-fg' : 'text-fgMuted'
          }`}
        >
          {message !== '' ? message : dirty ? LEAVING : ''}
        </p>
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
