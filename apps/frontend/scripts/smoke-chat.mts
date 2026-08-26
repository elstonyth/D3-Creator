/**
 * Pre-deploy smoke check for `POST /api/chat` — the one guard that talks to the
 * real model.
 *
 *   pnpm --filter ./apps/frontend run smoke:chat
 *
 * IT COSTS REAL OPENROUTER CREDITS: three full chat completions, about the
 * price of three user messages. Nothing here runs in CI, and nothing here is
 * free. The free half of this guard is the forbidden-vocabulary test in
 * `src/lib/chat-prompt.test.ts`.
 *
 * WHY IT EXISTS. The Script Coach's worst failure mode is invisible to lint,
 * tsc and jest alike. The route sends `RESPONSE_FORMAT` and refuses anything
 * that is not that envelope, so an edit that merely NUDGES the model out of
 * JSON turns every reply into a 502 while every offline check stays green. Two
 * measured regressions, both written up in `src/content/README.md`:
 *
 *   1. A persona paragraph describing the reply's PARTS in prose — naming no
 *      JSON and no field name — made the model answer in Markdown. 4 of 4 calls
 *      failed; 4 of 4 passed with it removed.
 *   2. `max_tokens` of 3,000 truncated the longest legitimate reply into
 *      `finish_reason: 'length'`, i.e. a 502 on a reply written correctly.
 *
 * So this reproduces the route's call exactly, three times, and asserts the two
 * things only a live call can show: that the reply still validates, and that
 * the two-language split still holds.
 *
 * Run it before any deploy that touches `src/content/chatbot-persona.md`,
 * `src/content/d3-method.md`, `src/lib/chat-prompt.ts`, `CHAT_MODEL`, or the
 * route's own model parameters.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  chatCompletion,
  requireModelId,
  type ChatCompletionResult,
} from '@d3/openrouter';

import type { BusinessProfile } from '../src/lib/business-profile';
import {
  buildMessages,
  isPersonaReady,
  isPlaybookReady,
  usesCacheControl,
  validateReply,
  RESPONSE_FORMAT,
  type ChatScript,
} from '../src/lib/chat-prompt';

/* -------------------------------------------------------------------------- */
/* Mirrored route constants                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The route declares both of these module-locally and exports neither, so they
 * are copied rather than imported. Line numbers are as of the commit that added
 * this file. If either value moves in the route, IT MUST MOVE HERE TOO — a
 * smoke check running different parameters from production measures nothing.
 */

/** Mirrors `src/app/api/chat/route.ts` line 67: `const CHAT_MAX_TOKENS = 4000`. */
const CHAT_MAX_TOKENS = 4000;
/** Mirrors `src/app/api/chat/route.ts` line 53: `const CHAT_DEADLINE_MS = 45_000`. */
const CHAT_DEADLINE_MS = 45_000;

/* -------------------------------------------------------------------------- */
/* Thresholds                                                                  */
/* -------------------------------------------------------------------------- */

/** Three, not one: the failure being hunted is intermittent by nature — the
 *  measured persona regression was 4 of 4, but a marginal one shows as 1 of 3. */
const ITERATIONS = 3;

/**
 * A completion landing this close to the cap is one adjective away from
 * `finish_reason: 'length'`, which the route 502s. Fail while there is still
 * headroom, not after the first user hits the wall.
 */
const TOKEN_BUDGET_RATIO = 0.9;

/**
 * The two-language split, as percentages of NON-WHITESPACE code points.
 *
 * The fixture below is `content_language: 'chinese'` with
 * `reply_language: 'english'`, so a correct reply explains itself to the user
 * in English and puts the words they will actually say on camera in Chinese.
 * When those two collapse into one language the coach is still returning valid
 * JSON — nothing 502s, no test fails — and the user silently gets a script they
 * cannot read out. That is the only failure here that has no other detector.
 *
 * Whitespace is excluded from the denominator on purpose: English prose is
 * roughly a sixth spaces and Chinese is almost none, so counting them would
 * deflate every Han percentage against its English counterpart and make one
 * pair of thresholds unable to describe both strings.
 */
const MESSAGE_HAN_MAX_PCT = 30;
const SPOKEN_HAN_MIN_PCT = 50;

/* -------------------------------------------------------------------------- */
/* The fixture                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Hardcoded, never read from Supabase: a smoke check must produce the same
 * prompt on every machine, and reading a real row would leak a real customer's
 * business into a terminal.
 *
 * `content_language: 'chinese'` with `reply_language: 'english'` is deliberate
 * and is the whole point of the fixture. It is simultaneously the LONGEST reply
 * this coach can produce — an English explanation wrapped around a Chinese
 * script, which is what broke the 3,000-token cap — and the only combination
 * that exercises the persona's two-language rule.
 */
const PROFILE: BusinessProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000002',
  what_you_sell: 'Second-hand iPhones and accessories',
  who_buys_it: 'Students and young workers, 18-30',
  main_platform: 'tiktok',
  on_camera: 'yes',
  content_language: 'chinese',
  business_type: 'retail',
  business_type_other: null,
  location: 'Kuala Lumpur',
  tone: 'friendly',
  business_name: 'Ah Meng Mobile',
  typical_video_seconds: 45,
  already_tried: 'Posted 10 videos, no views',
  things_to_avoid: 'No price talk, no discount claims',
  creator_role: 'business_owner',
  reach: '1k_10k',
  content_pillars: 'Repair tips, buying guides, shop life',
  voice_notes: 'Short sentences, Hokkien slang, no hard sell',
  reply_language: 'english',
  is_active: true,
  created_at: '2026-08-21T00:00:00Z',
  updated_at: '2026-08-21T00:00:00Z',
};

/**
 * An unambiguous script request, not a question. A guardrail reply, a
 * clarifying question and a list of ideas all validate with `script: null` —
 * which would pass validation, skip the language comparison entirely and report
 * a green run that measured nothing.
 */
const QUESTION =
  'Write me a 45-second TikTok script about how to tell a refurbished iPhone ' +
  'from a brand new one before you buy it.';

/* -------------------------------------------------------------------------- */
/* Han-script measurement                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Explicit code-point ranges rather than `\p{Script=Han}`: the repo compiles at
 * `target: es2015` (tsconfig.base.json), where a Unicode property escape is a
 * compile error. These three blocks cover everything a written Chinese script
 * contains.
 */
function isHan(codePoint: number): boolean {
  return (
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK Unified Ideographs
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // Extension A
    (codePoint >= 0xf900 && codePoint <= 0xfaff) //   Compatibility Ideographs
  );
}

/**
 * Percentage of non-whitespace code points that are Han, 0 for empty input.
 *
 * Iterated with the spread, never `charCodeAt`: indexing a UTF-16 string counts
 * one emoji or one Extension-B ideograph as two "characters" and skews a
 * percentage the exit code depends on.
 */
function hanPercent(text: string): number {
  let counted = 0;
  let han = 0;
  for (const char of [...text]) {
    if (/\s/.test(char)) continue;
    counted += 1;
    if (isHan(char.codePointAt(0) ?? 0)) han += 1;
  }
  return counted === 0 ? 0 : (han / counted) * 100;
}

/** `hook` plus every `body[].say` — the words the user actually speaks. `show`
 *  and `on_screen_text` are excluded: they are stage directions, and the
 *  persona is free to write those in either language. */
function spokenText(script: ChatScript): string {
  return [script.hook, ...script.body.map((beat) => beat.say)].join(' ');
}

/* -------------------------------------------------------------------------- */
/* Prompt inputs                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Byte-for-byte the route's `readContent()` — `join(process.cwd(), 'src',
 * 'content', name)`, deliberately cwd-based rather than resolved from this
 * file. pnpm runs a package script with the package directory as cwd, so
 * `pnpm --filter ./apps/frontend run smoke:chat` lands on the same path the
 * deployed route reads, whose Vercel root is `apps/frontend`.
 *
 * (The jest test that guards the persona resolves from `__dirname` instead, and
 * that difference is on purpose: jest's cwd is config-dependent.)
 *
 * If the route ever moves this text to Supabase, this function has to follow
 * it — a smoke check reading a stale local file would pass a deploy that ships
 * different words.
 */
async function readContent(name: string): Promise<string> {
  const path = join(process.cwd(), 'src', 'content', name);
  try {
    return await readFile(path, 'utf8');
  } catch {
    throw new Error(
      `cannot read ${path}. ` +
        'Run this from apps/frontend (the npm script does). Note that ' +
        'd3-method.md is gitignored — a public repo cannot carry the ' +
        "client's course — so a fresh clone needs a working copy of it.",
    );
  }
}

/* -------------------------------------------------------------------------- */
/* One iteration                                                               */
/* -------------------------------------------------------------------------- */

interface Outcome {
  /** Every reason this run failed. Empty means it passed. */
  problems: string[];
  /** null when the provider omitted the count — reported, never coerced to 0. */
  completionTokens: number | null;
}

function runLabel(index: number): string {
  return `run ${index + 1}/${ITERATIONS}`;
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Assesses one completed call and prints its whole line. Returns what the
 *  verdict needs; prints everything the maintainer needs. */
function assess(index: number, result: ChatCompletionResult): Outcome {
  const problems: string[] = [];
  const { prompt_tokens, completion_tokens, finish_reason } = result.usage;

  // Exactly the route's own check, on exactly the route's own inputs. A
  // `finish_reason` of null is a SUCCESS here, as it is in the route.
  const validation = validateReply(result.content, finish_reason);

  const stats =
    `prompt=${prompt_tokens ?? 'unknown'} ` +
    `completion=${completion_tokens ?? 'unknown'} ` +
    `finish=${finish_reason ?? 'null (omitted)'}`;

  if (!validation.ok) {
    problems.push(
      `${runLabel(index)}: reply did not validate — ${validation.reason}`,
    );
    console.log(
      `${runLabel(index)}  FAIL  ${stats}  reason=${validation.reason}  han(message)=n/a  han(spoken)=n/a`,
    );
    return { problems, completionTokens: completion_tokens };
  }

  const { message, script } = validation.value;

  // A null script validates, so nothing above catches it — but it means the
  // model answered with a guardrail reply or a clarifying question instead of
  // the script `QUESTION` unambiguously asked for, and the language comparison
  // below has nothing to compare. Treated as a failure rather than a skip: the
  // call already cost credits, and that comparison is why this script exists.
  if (script === null) {
    problems.push(
      `${runLabel(index)}: reply carried no script, so the two-language split was never exercised`,
    );
    console.log(
      `${runLabel(index)}  FAIL  ${stats}  reason=script-null  han(message)=${pct(hanPercent(message))}  han(spoken)=n/a`,
    );
    return { problems, completionTokens: completion_tokens };
  }

  const messageHan = hanPercent(message);
  const spokenHan = hanPercent(spokenText(script));

  if (messageHan > MESSAGE_HAN_MAX_PCT && spokenHan < SPOKEN_HAN_MIN_PCT) {
    problems.push(
      `${runLabel(index)}: two-language split collapsed — message is ${pct(messageHan)} Han ` +
        `(reply_language is English) while the spoken lines are only ${pct(spokenHan)} Han ` +
        '(content_language is Chinese)',
    );
  }

  if (
    completion_tokens !== null &&
    completion_tokens > CHAT_MAX_TOKENS * TOKEN_BUDGET_RATIO
  ) {
    problems.push(
      `${runLabel(index)}: completion of ${completion_tokens} tokens is over ` +
        `${TOKEN_BUDGET_RATIO * 100}% of CHAT_MAX_TOKENS (${CHAT_MAX_TOKENS}) — ` +
        'the next slightly longer reply truncates into a 502',
    );
  }

  console.log(
    `${runLabel(index)}  ${problems.length === 0 ? 'PASS' : 'FAIL'}  ${stats}  ` +
      `han(message)=${pct(messageHan)}  han(spoken)=${pct(spokenHan)}`,
  );
  return { problems, completionTokens: completion_tokens };
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const model = requireModelId('CHAT_MODEL');
  // The route refuses this id outright (route.ts line 184) because the cache
  // marker decision would be unknowable at request time. Smoking a config the
  // route 500s on would be a false green.
  if (model === 'openrouter/auto') {
    throw new Error(
      'CHAT_MODEL must be a pinned model id, not openrouter/auto — the route rejects it too.',
    );
  }

  const [playbook, persona] = await Promise.all([
    readContent('d3-method.md'),
    readContent('chatbot-persona.md'),
  ]);
  // The route 503s on either of these, so a smoke run against a placeholder
  // playbook would measure a prompt production never sends.
  if (!isPlaybookReady(playbook)) throw new Error('d3-method.md is not ready');
  if (!isPersonaReady(persona)) throw new Error('chatbot-persona.md is blank');

  const messages = buildMessages({
    persona,
    playbook,
    profile: PROFILE,
    history: [],
    question: QUESTION,
    cacheControl: usesCacheControl(model),
  });

  console.log(
    `smoke-chat: ${ITERATIONS} live calls to ${model} ` +
      `(cache_control=${usesCacheControl(model)}, max_tokens=${CHAT_MAX_TOKENS}). This costs credits.`,
  );

  const problems: string[] = [];
  const completions: number[] = [];

  for (let index = 0; index < ITERATIONS; index += 1) {
    let result: ChatCompletionResult;
    try {
      result = await chatCompletion({
        model,
        messages,
        max_tokens: CHAT_MAX_TOKENS,
        response_format: RESPONSE_FORMAT,
        // Without this OpenRouter may route to a provider that treats the
        // schema as a hint — route.ts line 293 carries the same comment.
        provider: { require_parameters: true },
        timeoutMs: CHAT_DEADLINE_MS,
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      problems.push(`${runLabel(index)}: the call itself failed — ${reason}`);
      console.log(
        `${runLabel(index)}  FAIL  the call itself failed — ${reason}`,
      );
      continue;
    }

    const outcome = assess(index, result);
    problems.push(...outcome.problems);
    if (outcome.completionTokens !== null) {
      completions.push(outcome.completionTokens);
    }
  }

  const peak = completions.length === 0 ? null : Math.max(...completions);
  const peakText =
    peak === null
      ? 'peak completion unknown (the provider reported no token counts)'
      : `peak completion ${peak}/${CHAT_MAX_TOKENS} tokens ` +
        `(${((peak / CHAT_MAX_TOKENS) * 100).toFixed(0)}%)`;

  console.log('');
  if (problems.length === 0) {
    console.log(
      `SMOKE PASS — ${ITERATIONS}/${ITERATIONS} replies validated, ${peakText}, two-language split held.`,
    );
    return;
  }

  for (const problem of problems) console.log(`  - ${problem}`);
  console.log('');
  console.log(
    `SMOKE FAIL — ${problems.length} problem(s) across ${ITERATIONS} calls, ${peakText}. ` +
      'Do not deploy; see src/content/README.md.',
  );
  process.exitCode = 1;
}

main().catch((cause: unknown) => {
  console.error(
    `SMOKE FAIL — ${cause instanceof Error ? cause.message : String(cause)}`,
  );
  process.exitCode = 1;
});
