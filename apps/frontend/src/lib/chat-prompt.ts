/**
 * The chat prompt builder. PRD 2 §10A.4–§10A.7 owns this file.
 *
 * One module, one import for the route: the profile block, the message array,
 * the history window, the `response_format` and the validator all live here.
 * There is no second `chat-reply.ts`.
 *
 * Where the profile block sits is load-bearing (§10A.4): it is `messages[1]`,
 * the FIRST chat message, immediately BELOW the `cache_control` marker on
 * system block 2. Anything user-specific above that marker breaks caching for
 * every user on every message, with no error and no symptom except the bill.
 * That is why the brand-voice fields render here and never in
 * `content/chatbot-persona.md`.
 */

import type { ChatMessage, ChatTextPart } from '@d3/openrouter';

import type { BusinessProfile } from './business-profile';

/**
 * Two strings the §9 guardrails match on. They are quoted verbatim inside
 * `content/chatbot-persona.md` when that file ships, and a test pins both
 * sides — a guardrail that silently stops matching has no error and no symptom
 * until somebody reads a bad script.
 */
export const NO_PROFILE_ON_FILE = 'NO PROFILE ON FILE';
export const ON_CAMERA_NO_LINE = 'Appears on camera: No';

/**
 * Display labels. §6's "Every field" table plus its exception table is the only
 * source; there are no prompt-only spellings to invent. A stored value with no
 * entry renders as its raw slug.
 */
const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  reels: 'Instagram Reels',
  douyin: 'Douyin',
  rednote: 'RedNote',
  facebook: 'Facebook',
};

const ON_CAMERA_LABELS: Record<string, string> = {
  yes: 'Yes',
  no: 'No',
  sometimes: 'Sometimes',
};

const CONTENT_LANGUAGE_LABELS: Record<string, string> = {
  chinese: 'Chinese',
  english: 'English',
  malay: 'Malay',
  mixed: 'Mixed',
};

/** Owner request 2026-08-24. Two entries, not four: this is the coach's own
 *  reading language, and `Malay`/`Mixed` are properties of an audience. */
const REPLY_LANGUAGE_LABELS: Record<string, string> = {
  english: 'English',
  chinese: 'Chinese',
};

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  retail: 'Retail',
  food: 'Food',
  services: 'Services',
  property: 'Property',
  health: 'Health',
  education: 'Education',
  ecommerce: 'E-commerce',
  other: 'Other',
};

const TONE_LABELS: Record<string, string> = {
  friendly: 'Friendly',
  expert: 'Expert',
  funny: 'Funny',
  direct: 'Direct',
};

/** Amendment 1. Both need explicit entries: sentence-casing `business_owner` or
 *  `1k_10k` produces garbage, so §6's exception table grew by six. */
const CREATOR_ROLE_LABELS: Record<string, string> = {
  business_owner: 'Business owner',
  content_creator: 'Content creator',
  marketer: 'Marketer',
  agency: 'Agency',
  freelancer: 'Freelancer',
  other: 'Other',
};

const REACH_LABELS: Record<string, string> = {
  under_1k: 'Under 1,000',
  '1k_10k': '1,000–10,000',
  '10k_100k': '10,000–100,000',
  '100k_plus': '100,000+',
};

/** The two style lines render from a literal default when the column is null.
 *  Without this the first-run path deadlocks: the guardrail asks for four
 *  fields, the user answers them, the row still has blanks, and the same
 *  questions are asked forever. */
const BUSINESS_TYPE_DEFAULT = 'Other';
const TONE_DEFAULT = 'Friendly';

/**
 * Trim and collapse newlines to single spaces. Applied to EVERY rendered value,
 * not only the long ones: a newline in any of them forges an
 * `Appears on camera:` line above the real one, and the profile endpoint
 * rejects only length, vocabulary, blanks and unknown keys.
 */
function clean(raw: string | null): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim();
}

function label(map: Record<string, string>, slug: string | null): string {
  const value = clean(slug);
  return map[value] ?? value;
}

/** Completeness is judged on FOUR fields and only these four — exactly the four
 *  the §9 guardrail asks for and the four the inline form collects. Adding
 *  `creator_role` or `reach` here would mark every existing profile incomplete
 *  and re-ask the guardrail questions forever. */
export function isProfileComplete(profile: BusinessProfile | null): boolean {
  if (profile === null) return false;
  return (
    clean(profile.what_you_sell) !== '' &&
    clean(profile.who_buys_it) !== '' &&
    clean(profile.main_platform) !== '' &&
    clean(profile.on_camera) !== ''
  );
}

/**
 * The §10A.6 profile block, as one `user` message.
 *
 * The five `not null` columns always render. `Business type:` and `Tone:`
 * always render too, from the literal defaults above. Every remaining line is
 * omitted ENTIRELY when its column is null or blank — never emitted with an
 * empty value.
 */
export function renderProfileBlock(profile: BusinessProfile | null): string {
  if (!isProfileComplete(profile) || profile === null) {
    return NO_PROFILE_ON_FILE;
  }

  const lines: string[] = ['BUSINESS PROFILE'];

  const push = (labelText: string, value: string): void => {
    if (value !== '') lines.push(`${labelText}: ${value}`);
  };

  push('Business name', clean(profile.business_name));

  // `business_type_other` gets no line of its own: the bare word "Other" tells
  // the model nothing about the trade it is writing for.
  const typeOther = clean(profile.business_type_other);
  const typeSlug = clean(profile.business_type);
  lines.push(
    `Business type: ${
      typeSlug === 'other' && typeOther !== ''
        ? typeOther
        : typeSlug === ''
          ? BUSINESS_TYPE_DEFAULT
          : label(BUSINESS_TYPE_LABELS, typeSlug)
    }`,
  );

  push('Their role', label(CREATOR_ROLE_LABELS, profile.creator_role));
  lines.push(`What they sell: ${clean(profile.what_you_sell)}`);
  lines.push(`Who buys it: ${clean(profile.who_buys_it)}`);
  push('Audience size', label(REACH_LABELS, profile.reach));
  push('Where they are', clean(profile.location));
  lines.push(
    `Content language: ${label(CONTENT_LANGUAGE_LABELS, profile.content_language)}`,
  );
  // Directly under Content language, and omitted entirely when null — the two
  // lines only make sense read together, and their absence is what tells the
  // persona to fall back to the content language.
  push('Reply language', label(REPLY_LANGUAGE_LABELS, profile.reply_language));
  lines.push(`Main platform: ${label(PLATFORM_LABELS, profile.main_platform)}`);
  lines.push(
    `Appears on camera: ${label(ON_CAMERA_LABELS, profile.on_camera)}`,
  );

  const toneSlug = clean(profile.tone);
  lines.push(
    `Tone: ${toneSlug === '' ? TONE_DEFAULT : label(TONE_LABELS, toneSlug)}`,
  );

  push('Content pillars', clean(profile.content_pillars));
  push('Voice notes', clean(profile.voice_notes));
  push(
    'Typical video length',
    profile.typical_video_seconds === null
      ? ''
      : `${profile.typical_video_seconds}s`,
  );
  push('Already tried', clean(profile.already_tried));
  push('Things to avoid', clean(profile.things_to_avoid));

  return lines.join('\n');
}
/* -------------------------------------------------------------------------- */
/* The knowledge files (§10A.1)                                                */
/* -------------------------------------------------------------------------- */

/** The first line of the placeholder playbook. C8 deletes it when the real
 *  method lands; nothing else gates the feature on. */
export const PLAYBOOK_PLACEHOLDER = 'PLAYBOOK_PLACEHOLDER';

/**
 * A playbook is ready when it is non-empty after trimming and its FIRST line,
 * trimmed, is not the marker. Never a whole-file `includes()` — that would 503
 * a real playbook whose prose happens to name the marker.
 */
export function isPlaybookReady(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === '') return false;
  return trimmed.split('\n', 1)[0].trim() !== PLAYBOOK_PLACEHOLDER;
}

/** The persona carries no marker: present and non-blank is the whole test. */
export function isPersonaReady(raw: string): boolean {
  return raw.trim() !== '';
}

/* -------------------------------------------------------------------------- */
/* The message array (§10A.4, §10A.5)                                          */
/* -------------------------------------------------------------------------- */

/**
 * `messages[2]`, byte for byte. Without it an empty history puts two `user`
 * messages back to back: Anthropic's native API rejects consecutive same-role
 * messages and whether OpenRouter merges them is provider-dependent. Fifteen
 * tokens, below the cache marker, and the whole class of failure is gone.
 */
export const ASSISTANT_ACK =
  'Understood. I have the business on file and will use it for every script.';

/**
 * Anthropic Claude is the only family that needs a manual cache marker; Gemini
 * 2.5+, OpenAI, Grok, DeepSeek, Groq, Moonshot and Z.AI all cache
 * automatically. This prefix test is why `CHAT_MODEL` must be a pinned id and
 * never `openrouter/auto` — the decision would be unknowable at request time.
 */
export function usesCacheControl(model: string): boolean {
  return model.startsWith('anthropic/');
}

/** One row of `chat_message`, as the prompt builder needs it. */
export interface HistoryRow {
  role: 'user' | 'assistant';
  content: string;
  /** The stored `script` jsonb, replayed inside the §10A.8 envelope. */
  script: unknown;
}

export interface BuildMessagesInput {
  /** `content/chatbot-persona.md`, verbatim. */
  persona: string;
  /** `content/d3-method.md`, verbatim. */
  playbook: string;
  profile: BusinessProfile | null;
  /** Oldest-first, already windowed to HISTORY_MAX_MESSAGES by the query. */
  history: readonly HistoryRow[];
  question: string;
  /** `usesCacheControl(CHAT_MODEL)`. */
  cacheControl: boolean;
}

/**
 * The literal §10A.4 array. Blocks 1 and 2 are byte-identical for every user
 * and every message; everything user-specific starts at `messages[1]`, BELOW
 * the cache marker. Moving the profile into the system prompt breaks caching
 * for every user on every message, with no error and no symptom except the
 * bill — the way to make the model respect it is `chatbot-persona.md`.
 */
export function buildMessages(input: BuildMessagesInput): ChatMessage[] {
  const playbookBlock: ChatTextPart = input.cacheControl
    ? {
        type: 'text',
        text: input.playbook,
        cache_control: { type: 'ephemeral' },
      }
    : { type: 'text', text: input.playbook };

  return [
    {
      role: 'system',
      content: [{ type: 'text', text: input.persona }, playbookBlock],
    },
    { role: 'user', content: renderProfileBlock(input.profile) },
    { role: 'assistant', content: ASSISTANT_ACK },
    ...selectHistory(input.history),
    { role: 'user', content: input.question.trim() },
  ];
}

/* -------------------------------------------------------------------------- */
/* History and truncation (§10A.7)                                             */
/* -------------------------------------------------------------------------- */

/** Newest N messages of the thread are replayed. The route imports this; it
 *  never restates the number, or raising it would leave the query fetching the
 *  old count with no error. */
export const HISTORY_MAX_MESSAGES = 20;
/** The real guard. Twenty assistant rows each holding a full script is an
 *  unbounded prompt; the count is only the cheap first pass. */
export const HISTORY_MAX_CHARS = 24000;

const TRUNCATION_SUFFIX = '\n…[truncated]';

/**
 * A `user` row replays as its `content`. An `assistant` row replays as the
 * re-serialised §10A.8 envelope, because `content` holds prose only and
 * `script` holds the object — that is what lets "make it shorter" see the
 * script it is being asked to edit. Nothing is stored twice.
 */
function replay(row: HistoryRow): string {
  return row.role === 'assistant'
    ? JSON.stringify({ message: row.content, script: row.script ?? null })
    : row.content;
}

/**
 * §10A.7's four steps, in order. Lengths are measured on the REPLAYED string,
 * never on `content` — an assistant row carrying a script is many times its
 * prose.
 */
export function selectHistory(rows: readonly HistoryRow[]): ChatMessage[] {
  const kept = rows.slice();

  // 2. Drop the oldest until the sum fits. Never drop the last remaining
  //    message here — step 4 owns that case.
  let sum = kept.reduce((total, row) => total + replay(row).length, 0);
  while (kept.length > 1 && sum > HISTORY_MAX_CHARS) {
    kept.shift();
    sum = kept.reduce((total, row) => total + replay(row).length, 0);
  }

  // 3. An `assistant` first row would land directly after ASSISTANT_ACK — two
  //    assistant turns in a row, the exact failure that fixed line prevents.
  //    This runs BEFORE the shortening step and that order is load-bearing.
  if (kept.length > 0 && kept[0].role === 'assistant') kept.shift();

  // 4. A lone survivor still over budget is shortened, never cut mid-object.
  if (kept.length === 1) {
    const only = kept[0];
    let text = replay(only);
    if (text.length > HISTORY_MAX_CHARS) {
      const prose =
        only.content.slice(0, HISTORY_MAX_CHARS) + TRUNCATION_SUFFIX;
      if (only.role === 'user') {
        text = prose;
      } else {
        // Unreachable under this order, and that is expected: step 2 exits with
        // one row left or a sum already in budget, and step 3 removes a lone
        // assistant survivor. It is a written-down guard against a future
        // change to steps 1-3 — do not reorder the steps to make it fire, and
        // do not delete it.
        text = JSON.stringify({ message: prose, script: only.script ?? null });
        if (text.length > HISTORY_MAX_CHARS) {
          text = JSON.stringify({ message: prose, script: null });
        }
      }
    }
    return [{ role: only.role, content: text }];
  }

  return kept.map((row) => ({ role: row.role, content: replay(row) }));
}

/* -------------------------------------------------------------------------- */
/* The reply shape and the JSON schema (§10A.8)                                */
/* -------------------------------------------------------------------------- */

/** §2's five lesson names. An enum so the model cannot cite a lesson that does
 *  not exist. Spread into the schema and reused by the validator, so the two
 *  cannot drift; `chat-prompt.test.ts` pins the five literals. */
export const LESSON_USED = [
  '入门先导课',
  '聊观点脚本',
  '教知识脚本',
  '口播表现力+视频置景+素材库+晒过程脚本',
  '故事型脚本',
] as const;

export type LessonUsed = (typeof LESSON_USED)[number];

/** One beat of the body. `show` and `on_screen_text` are per-beat because §7's
 *  Show row reads "what to point the camera at FOR EACH PART"; three parallel
 *  arrays fall out of alignment the first time the model writes four body
 *  lines and three camera notes. */
export interface ScriptBeat {
  say: string;
  seconds: number;
  show: string;
  /** `''` when there is none — its documented value, not a missing field. */
  on_screen_text: string;
}

export interface ChatScript {
  script_type: string;
  hook: string;
  body: ScriptBeat[];
  call_to_action: string;
  length_seconds: number;
  lesson_used: LessonUsed;
}

/** Every reply, script or not, is this envelope. `script` is null on every §9
 *  guardrail reply, every clarifying question and every list of ideas that has
 *  not become a script yet — the UI renders the card if and only if it is not
 *  null. There is no type tag and no string sniffing. */
export interface ChatReply {
  message: string;
  script: ChatScript | null;
}

/** §10A.8, verbatim. `script` is `required` and typed `["object", "null"]`
 *  rather than optional because strict mode requires every property to appear
 *  in `required`. */
export const RESPONSE_FORMAT: Record<string, unknown> = {
  type: 'json_schema',
  json_schema: {
    name: 'd3_script_reply',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['message', 'script'],
      properties: {
        message: { type: 'string' },
        script: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: [
            'script_type',
            'hook',
            'body',
            'call_to_action',
            'length_seconds',
            'lesson_used',
          ],
          properties: {
            script_type: { type: 'string' },
            hook: { type: 'string' },
            body: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['say', 'seconds', 'show', 'on_screen_text'],
                properties: {
                  say: { type: 'string' },
                  seconds: { type: 'integer' },
                  show: { type: 'string' },
                  on_screen_text: { type: 'string' },
                },
              },
            },
            call_to_action: { type: 'string' },
            length_seconds: { type: 'integer' },
            lesson_used: { type: 'string', enum: [...LESSON_USED] },
          },
        },
      },
    },
  },
};

/* -------------------------------------------------------------------------- */
/* Validation (§10A.9)                                                         */
/* -------------------------------------------------------------------------- */

/** The `chat_message` CHECKs and defaults. They live here rather than in
 *  `business-profile.ts`, which is the profile vocabulary only. */
export const CHAT_MESSAGE_CONTENT_MAX = 20000;
export const CHAT_MESSAGE_MODEL_MAX = 120;
export const CHAT_THREAD_TITLE_DEFAULT = 'New chat';
export const CHAT_THREAD_TITLE_MAX = 120;
/** Where a derived title is cut. Far below `CHAT_THREAD_TITLE_MAX` on purpose:
 *  the rail is a 260px column that CSS-truncates anyway, so the cap that
 *  matters is the one that keeps a row readable, not the one Postgres allows. */
export const CHAT_THREAD_TITLE_TARGET = 60;
/** §10 "Request body" — the user's question, after trimming. */
export const CHAT_QUESTION_MAX = 4000;

/**
 * A thread title from the question that opened it. Owner request 2026-08-24:
 * every thread read `New chat`, because the route left the column default
 * standing and the rename control it deferred to was never built.
 *
 * No second model call. A title is worth one line of string handling, not a
 * doubled bill and a doubled wait on every first message.
 */
export function deriveThreadTitle(question: string): string {
  // Collapse FIRST. A question opening with a newline would otherwise title the
  // thread with a blank, and a multi-line one would carry a break into a row
  // that is a single flex line.
  const collapsed = question.replace(/\s+/g, ' ').trim();
  if (collapsed === '') return CHAT_THREAD_TITLE_DEFAULT;

  // Code points, never `.slice()` on the string: cutting a UTF-16 string at a
  // fixed index can split a surrogate pair, and Postgres stores the lone
  // surrogate happily. Every renderer then shows a replacement box, forever, in
  // a column with no way to rename it.
  const chars = [...collapsed];
  if (chars.length <= CHAT_THREAD_TITLE_TARGET) return collapsed;

  const head = chars.slice(0, CHAT_THREAD_TITLE_TARGET).join('');
  // Prefer a word boundary — but only one that falls late enough to leave a
  // readable title. Chinese writes no spaces, so on a mixed question the last
  // space can sit near the start, and cutting there would throw the title away.
  const space = head.lastIndexOf(' ');
  const cut =
    space > CHAT_THREAD_TITLE_TARGET * 0.6 ? head.slice(0, space) : head;
  return `${cut.trimEnd()}…`;
}

/** Which rule failed. Logged, never shown; the two user-facing sentences are
 *  the route's, keyed on the 502's `error` value. */
export type ReplyFailureReason =
  | 'truncated'
  | 'parse'
  | 'message-empty'
  | 'message-too-long'
  | 'script-shape';

export type ReplyValidation =
  | { ok: true; value: ChatReply }
  | { ok: false; reason: ReplyFailureReason };

/** "Non-empty" has ONE definition everywhere steps 3 and 4 use the phrase.
 *  `on_screen_text` is the sole exception — `''` is its documented value. */
function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Unknown keys are DROPPED, not rejected: `additionalProperties: false` is only
 * a hint on some providers, and a reply carrying an extra key is otherwise
 * usable — a 502 there would fail a good answer. But it must never reach
 * `chat_message.script`, which is unconstrained `jsonb` the chat page renders
 * straight from, so the object is rebuilt from exactly the named fields.
 */
function validateScript(raw: unknown): ChatScript | null | 'invalid' {
  if (raw === null) return null;
  const script = asObject(raw);
  if (script === null) return 'invalid';

  if (
    !isFilled(script.script_type) ||
    !isFilled(script.hook) ||
    !isFilled(script.call_to_action) ||
    !isPositiveInt(script.length_seconds) ||
    typeof script.lesson_used !== 'string' ||
    !(LESSON_USED as readonly string[]).includes(script.lesson_used)
  ) {
    return 'invalid';
  }

  if (!Array.isArray(script.body) || script.body.length < 1) return 'invalid';

  const body: ScriptBeat[] = [];
  for (const rawBeat of script.body) {
    const beat = asObject(rawBeat);
    if (
      beat === null ||
      !isFilled(beat.say) ||
      !isFilled(beat.show) ||
      typeof beat.on_screen_text !== 'string' ||
      !isPositiveInt(beat.seconds)
    ) {
      return 'invalid';
    }
    // Trimming decided pass/fail; every stored value is the RAW string.
    body.push({
      say: beat.say,
      seconds: beat.seconds,
      show: beat.show,
      on_screen_text: beat.on_screen_text,
    });
  }

  return {
    script_type: script.script_type,
    hook: script.hook,
    body,
    call_to_action: script.call_to_action,
    length_seconds: script.length_seconds,
    lesson_used: script.lesson_used as LessonUsed,
  };
}

/**
 * §10A.9's steps 1-5, in order. `strict: true` is only a hint on some
 * providers, so nothing is shown until this passes. No retry: retrying doubles
 * the bill on exactly the failures most likely to repeat, and the retry
 * decision belongs to the user.
 */
export function validateReply(
  content: string,
  finishReason: string | null,
): ReplyValidation {
  // 1. `null` means the provider omitted the field and is a SUCCESS. Write the
  //    predicate exactly this way — a bare `!== 'stop'` would 502 every reply
  //    from such a provider and bill for all of them.
  if (finishReason !== null && finishReason !== 'stop') {
    return {
      ok: false,
      reason: finishReason === 'length' ? 'truncated' : 'parse',
    };
  }

  // 2. The client has already unwrapped `choices[0].message.content`.
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, reason: 'parse' };
  }
  const envelope = asObject(parsed);
  if (envelope === null) return { ok: false, reason: 'parse' };

  // 3. A whitespace-only `message` is a 502, never a 200 carrying a blank
  //    coach reply. The cap is the `chat_message.content` CHECK, measured on
  //    the RAW string, so the failure is a clean 502 rather than a Postgres
  //    23514 after the call is already billed.
  if (!isFilled(envelope.message)) {
    return { ok: false, reason: 'message-empty' };
  }
  if (envelope.message.length > CHAT_MESSAGE_CONTENT_MAX) {
    return { ok: false, reason: 'message-too-long' };
  }

  // 4 and 5.
  const script = validateScript(envelope.script);
  if (script === 'invalid') return { ok: false, reason: 'script-shape' };

  return { ok: true, value: { message: envelope.message, script } };
}
