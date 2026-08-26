/**
 * Amendment 1 Part D — the business-profile input to the analysis prompt.
 *
 * The point of these is that adding the profile changed NOTHING for a job that
 * does not carry one: `apps/analyzer` has no other guard against the prompt
 * drifting for every existing user.
 */

// All four come from `prompt.ts`: `upload.ts` imports `config.ts`, which uses
// `import.meta` and cannot be loaded by jest (the same reason `prompt.ts`
// itself has no `config.ts` import — see its header).
import {
  MAX_BUSINESS_PROFILE_CHARS,
  buildAnalysisMessages,
  buildAnalysisPrompt,
  parseBusinessProfile,
} from './prompt';

const BASE = {
  reportLanguage: 'en' as const,
  durationSeconds: 18.4,
  transcript: [{ start: 0, end: 2, text: 'Hello and welcome' }],
};

const BLOCK = [
  'BUSINESS PROFILE',
  'Business type: Retail',
  'What they sell: Second-hand iPhones',
  'Who buys it: Students, 18-30',
  'Content language: English',
  'Main platform: TikTok',
  'Appears on camera: No',
  'Tone: Friendly',
].join('\n');

describe('buildAnalysisPrompt with a business profile', () => {
  it('is byte-identical to the pre-Amendment prompt when there is none', () => {
    const absent = buildAnalysisPrompt(BASE);
    expect(buildAnalysisPrompt({ ...BASE, businessProfile: null })).toBe(
      absent,
    );
    expect(buildAnalysisPrompt({ ...BASE, businessProfile: '' })).toBe(absent);
    expect(buildAnalysisPrompt({ ...BASE, businessProfile: '   ' })).toBe(
      absent,
    );
    expect(absent).not.toContain('BUSINESS PROFILE');
  });

  it('includes the block verbatim when one is present', () => {
    const withProfile = buildAnalysisPrompt({
      ...BASE,
      businessProfile: BLOCK,
    });
    expect(withProfile).toContain(BLOCK);
    // It must not swallow the rest of the prompt.
    expect(withProfile).toContain('Score these six dimensions');
    expect(withProfile.length).toBeGreaterThan(
      buildAnalysisPrompt(BASE).length,
    );
  });

  it('keeps the message array shape unchanged — text part, then video part', () => {
    const messages = buildAnalysisMessages({
      ...BASE,
      businessProfile: BLOCK,
      videoBase64: 'AAAA',
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    const content = messages[0].content as { type: string }[];
    expect(content.map((c) => c.type)).toEqual(['text', 'video_url']);
  });
});

describe('parseBusinessProfile', () => {
  it('accepts a trimmed string at the ceiling and rejects one over it', () => {
    expect(parseBusinessProfile(`  ${BLOCK}  `)).toBe(BLOCK);
    expect(parseBusinessProfile('x'.repeat(MAX_BUSINESS_PROFILE_CHARS))).toBe(
      'x'.repeat(MAX_BUSINESS_PROFILE_CHARS),
    );
    // Dropped, never truncated: half a profile is worse guidance than none.
    expect(
      parseBusinessProfile('x'.repeat(MAX_BUSINESS_PROFILE_CHARS + 1)),
    ).toBeNull();
  });

  it('maps every non-string and every blank to null', () => {
    for (const raw of [undefined, null, 42, {}, [], '', '   ']) {
      expect(parseBusinessProfile(raw)).toBeNull();
    }
  });

  it('bounds the field the browser supplies — this value is not trusted', () => {
    // The frontend renders and bounds it, but the field arrives from the
    // browser because the upload route streams its body through and cannot
    // inject one. 3,075 matches the frontend's measured ceiling (it grew by one line
    // when reply_language landed — bump BOTH sides together or a max-length
    // profile is silently dropped here instead of reaching the model).
    expect(MAX_BUSINESS_PROFILE_CHARS).toBe(3075);
  });
});
