/**
 * PRD 2 §10 "One test to ship with it", as amended by
 * `plans/ai-tools/amendment-1-profile-settings-and-voice-memory.md` §B6.
 *
 * ELEVEN drift assertions — one per export that has a database counterpart: the
 * nine `as const` tuples, `DEFAULT_CONTENT_LANGUAGE` against the column
 * default, and `PROFILE_LIMITS` against its nine `char_length` CHECKs entry by
 * entry. §10 was written when there were eight; Amendment 1 added
 * `CREATOR_ROLES` and `REACH_BUCKETS`, and owner request 2026-08-24 added
 * `REPLY_LANGUAGES` — which lives in a SECOND migration file, so see the
 * `MIGRATIONS` list below before adding another.
 *
 * Direct parser cases live in the same file and are explicitly "not counted
 * against it" (§10).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  BUSINESS_TYPES,
  CONTENT_LANGUAGES,
  CREATOR_ROLES,
  DEFAULT_CONTENT_LANGUAGE,
  MAIN_PLATFORMS,
  ON_CAMERA,
  PROFILE_LIMITS,
  REACH_BUCKETS,
  REPLY_LANGUAGES,
  TONES,
  TYPICAL_VIDEO_SECONDS,
  parseInlineProfile,
  parseProfileUpdate,
  type ProfileUpdateInput,
} from './business-profile';

/**
 * EVERY migration that constrains `user_profile`, not just the one that created
 * it. A column added by a later `alter table` is invisible to a helper reading
 * only the create — and `checkVocabulary` throws on a missing CHECK rather than
 * passing vacuously, so a forgotten entry here is a red test, not a silent one.
 */
const MIGRATIONS = [
  '20260819120000_chatbot_profile_and_chat.sql',
  '20260824000000_user_profile_reply_language.sql',
].map((name) =>
  path.resolve(__dirname, '../../../../supabase/migrations', name),
);

/**
 * Strip `--` comments and collapse whitespace BEFORE matching, per §10. Two
 * CHECKs wrap across lines, so a line-anchored regex would pass green over zero
 * comparisons. No string literal in these migrations contains `--`.
 */
const sql = MIGRATIONS.map((file) => readFileSync(file, 'utf8'))
  .join('\n')
  .replace(/--[^\n]*/g, ' ')
  .replace(/\s+/g, ' ');

/**
 * Word-boundary and whitespace-flexible, never a literal `check (x in (…))`
 * shape: a shape-literal regex goes red the first time the migration is
 * reformatted, over a file whose meaning never changed.
 */
function checkVocabulary(column: string): string[] {
  const match = new RegExp(`\\b${column}\\s+in\\s*\\(([^)]*)\\)`, 'i').exec(
    sql,
  );
  if (match === null) throw new Error(`no CHECK found for ${column}`);
  return match[1].split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
}

function checkLength(column: string): number {
  const match = new RegExp(
    `char_length\\(\\s*${column}\\s*\\)\\s+between\\s+1\\s+and\\s+(\\d+)`,
    'i',
  ).exec(sql);
  if (match === null)
    throw new Error(`no char_length CHECK found for ${column}`);
  return Number(match[1]);
}

describe('business-profile drift against the migration', () => {
  it('MAIN_PLATFORMS matches the main_platform CHECK', () => {
    expect(checkVocabulary('main_platform')).toEqual([...MAIN_PLATFORMS]);
  });

  it('ON_CAMERA matches the on_camera CHECK', () => {
    expect(checkVocabulary('on_camera')).toEqual([...ON_CAMERA]);
  });

  it('REPLY_LANGUAGES matches the reply_language CHECK', () => {
    expect(checkVocabulary('reply_language')).toEqual([...REPLY_LANGUAGES]);
  });

  it('CONTENT_LANGUAGES matches the content_language CHECK', () => {
    expect(checkVocabulary('content_language')).toEqual([...CONTENT_LANGUAGES]);
  });

  it('BUSINESS_TYPES matches the business_type CHECK', () => {
    expect(checkVocabulary('business_type')).toEqual([...BUSINESS_TYPES]);
  });

  it('TONES matches the tone CHECK', () => {
    expect(checkVocabulary('tone')).toEqual([...TONES]);
  });

  it('TYPICAL_VIDEO_SECONDS matches the typical_video_seconds CHECK', () => {
    expect(checkVocabulary('typical_video_seconds').map(Number)).toEqual([
      ...TYPICAL_VIDEO_SECONDS,
    ]);
  });

  // Amendment 1 — assertions nine and ten.
  it('CREATOR_ROLES matches the creator_role CHECK', () => {
    expect(checkVocabulary('creator_role')).toEqual([...CREATOR_ROLES]);
  });

  it('REACH_BUCKETS matches the reach CHECK', () => {
    expect(checkVocabulary('reach')).toEqual([...REACH_BUCKETS]);
  });

  it('DEFAULT_CONTENT_LANGUAGE matches the column default', () => {
    const match =
      /content_language\s+text\s+not\s+null\s+default\s+'([^']*)'/i.exec(sql);
    expect(match?.[1]).toBe(DEFAULT_CONTENT_LANGUAGE);
  });

  it('PROFILE_LIMITS matches every char_length CHECK, entry by entry', () => {
    // Nine entries since Amendment 1 added content_pillars and voice_notes.
    expect(Object.keys(PROFILE_LIMITS)).toHaveLength(9);
    for (const [column, cap] of Object.entries(PROFILE_LIMITS)) {
      expect([column, checkLength(column)]).toEqual([column, cap]);
    }
  });
});

/* -------------------------------------------------------------------------- */

const VALID_INLINE = {
  what_you_sell: 'Second-hand iPhones and accessories',
  who_buys_it: 'Students and young workers, 18-30',
  main_platform: 'tiktok',
  on_camera: 'no',
};

describe('parseInlineProfile', () => {
  it('accepts the four fields and stores the trimmed values', () => {
    const result = parseInlineProfile({
      ...VALID_INLINE,
      main_platform: 'tiktok ',
    });
    expect(result).toEqual({
      ok: true,
      value: { ...VALID_INLINE, main_platform: 'tiktok' },
    });
  });

  it('rejects an over-long value rather than truncating it', () => {
    expect(
      parseInlineProfile({ ...VALID_INLINE, what_you_sell: 'x'.repeat(201) }),
    ).toEqual({ ok: false });
    expect(
      parseInlineProfile({ ...VALID_INLINE, what_you_sell: 'x'.repeat(200) })
        .ok,
    ).toBe(true);
  });

  it('rejects an unrecognised slug rather than coercing it', () => {
    expect(
      parseInlineProfile({ ...VALID_INLINE, main_platform: 'instagram' }),
    ).toEqual({ ok: false });
  });

  it('rejects a blank required field and any extra key', () => {
    expect(parseInlineProfile({ ...VALID_INLINE, who_buys_it: '   ' })).toEqual(
      {
        ok: false,
      },
    );
    expect(parseInlineProfile({ ...VALID_INLINE, is_active: true })).toEqual({
      ok: false,
    });
  });

  it('rejects a body that is not an object', () => {
    for (const body of [null, 'x', 42, ['a'], undefined]) {
      expect(parseInlineProfile(body)).toEqual({ ok: false });
    }
  });
});

/* -------------------------------------------------------------------------- */

const VALID_UPDATE: ProfileUpdateInput = {
  what_you_sell: 'Second-hand iPhones',
  who_buys_it: 'Students, 18-30',
  main_platform: 'tiktok',
  on_camera: 'sometimes',
  content_language: 'mixed',
  business_type: 'retail',
  business_type_other: null,
  location: 'Kuala Lumpur',
  tone: 'friendly',
  business_name: 'Ah Meng Mobile',
  typical_video_seconds: 60,
  already_tried: 'Posted 10 videos, no views',
  things_to_avoid: 'No price talk',
  creator_role: 'business_owner',
  reach: '1k_10k',
  content_pillars: 'Repair tips, buying guides',
  voice_notes: 'Short sentences, no hard sell',
  // The whole point of the column: Chinese-ish content, English coaching.
  reply_language: 'english',
};

describe('parseProfileUpdate', () => {
  it('accepts the full editable set', () => {
    expect(parseProfileUpdate({ ...VALID_UPDATE })).toEqual({
      ok: true,
      value: VALID_UPDATE,
    });
  });

  it('rejects is_active — naming it would fire the switch-business trigger', () => {
    expect(parseProfileUpdate({ ...VALID_UPDATE, is_active: false })).toEqual({
      ok: false,
    });
  });

  it('rejects id, user_id and the timestamps as unknown keys', () => {
    for (const key of ['id', 'user_id', 'created_at', 'updated_at']) {
      expect(parseProfileUpdate({ ...VALID_UPDATE, [key]: 'x' })).toEqual({
        ok: false,
      });
    }
  });

  it('maps blank optional fields to null, never to a default', () => {
    const result = parseProfileUpdate({
      ...VALID_UPDATE,
      business_type: '',
      business_type_other: null,
      location: '   ',
      tone: '',
      typical_video_seconds: null,
      creator_role: '',
      reach: '',
      content_pillars: '',
      voice_notes: '',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.business_type).toBeNull();
    expect(result.value.location).toBeNull();
    expect(result.value.tone).toBeNull();
    expect(result.value.typical_video_seconds).toBeNull();
    expect(result.value.creator_role).toBeNull();
    expect(result.value.reach).toBeNull();
    expect(result.value.content_pillars).toBeNull();
    expect(result.value.voice_notes).toBeNull();
  });

  it('enforces user_profile_other_needs_text in BOTH directions', () => {
    expect(
      parseProfileUpdate({
        ...VALID_UPDATE,
        business_type: 'other',
        business_type_other: '   ',
      }),
    ).toEqual({ ok: false });
    expect(
      parseProfileUpdate({
        ...VALID_UPDATE,
        business_type: 'retail',
        business_type_other: 'Phone repair',
      }),
    ).toEqual({ ok: false });
    expect(
      parseProfileUpdate({
        ...VALID_UPDATE,
        business_type: 'other',
        business_type_other: 'Phone repair',
      }).ok,
    ).toBe(true);
  });

  it('rejects the two memory fields at 501 characters and accepts 500', () => {
    for (const key of ['content_pillars', 'voice_notes'] as const) {
      expect(
        parseProfileUpdate({ ...VALID_UPDATE, [key]: 'x'.repeat(501) }),
      ).toEqual({ ok: false });
      expect(
        parseProfileUpdate({ ...VALID_UPDATE, [key]: 'x'.repeat(500) }).ok,
      ).toBe(true);
    }
  });

  it('rejects an unrecognised creator_role or reach bucket', () => {
    expect(
      parseProfileUpdate({ ...VALID_UPDATE, creator_role: 'ceo' }),
    ).toEqual({ ok: false });
    expect(parseProfileUpdate({ ...VALID_UPDATE, reach: '5k' })).toEqual({
      ok: false,
    });
  });

  it('rejects a numeric string for typical_video_seconds — no coercion', () => {
    expect(
      parseProfileUpdate({ ...VALID_UPDATE, typical_video_seconds: '60' }),
    ).toEqual({ ok: false });
    expect(
      parseProfileUpdate({ ...VALID_UPDATE, typical_video_seconds: 45 }),
    ).toEqual({ ok: false });
  });

  it('rejects a partial body rather than nulling what it omitted', () => {
    // A full replace of a partial body silently erases every field the caller
    // did not send, and answers 200. Every key must be present.
    const {
      what_you_sell,
      who_buys_it,
      main_platform,
      on_camera,
      content_language,
    } = VALID_UPDATE;
    expect(
      parseProfileUpdate({
        what_you_sell,
        who_buys_it,
        main_platform,
        on_camera,
        content_language,
      }),
    ).toEqual({ ok: false });

    // An explicit null is still a legal "clear this field" — only ABSENCE is
    // refused, so the Settings form's own body keeps working.
    expect(parseProfileUpdate({ ...VALID_UPDATE, voice_notes: null }).ok).toBe(
      true,
    );

    // Dropping any single optional key is enough to refuse the whole save.
    for (const key of ['voice_notes', 'reach', 'tone'] as const) {
      const { [key]: _dropped, ...partial } = VALID_UPDATE;
      expect(parseProfileUpdate(partial)).toEqual({ ok: false });
    }
  });

  it('requires content_language — it is NOT NULL with no update-time default', () => {
    const { content_language: _omitted, ...withoutLanguage } = VALID_UPDATE;
    expect(parseProfileUpdate(withoutLanguage)).toEqual({ ok: false });
  });
});
