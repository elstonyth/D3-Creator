/**
 * PRD 3 §7.3's clipboard block and shape check, and §7.1's relative date.
 *
 * The clipboard format is pinned character for character because two builders
 * produced two of them; the whitespace IS the contract.
 */

import {
  GENERIC_SEND_FAILURE_COPY,
  THREAD_RAIL_LIMIT,
  THREAD_WINDOW_MESSAGES,
  isValidScript,
  relativeThreadDate,
  scriptToClipboard,
  sendFailureCopy,
  type ChatScript,
} from './studio-chat';

const SCRIPT: ChatScript = {
  script_type: 'Opinion',
  hook: 'Stop buying brand-new phones',
  body: [
    {
      say: 'Most people overpay by half.',
      seconds: 6,
      show: 'The shop counter',
      on_screen_text: 'Overpaying by 50%',
    },
    {
      say: 'Here is what to check first.',
      seconds: 9,
      show: 'Close-up of a battery health screen',
      on_screen_text: '',
    },
  ],
  call_to_action: 'Come by the shop this week.',
  length_seconds: 45,
  lesson_used: '聊观点脚本',
};

describe('the read caps', () => {
  it('are the numbers PRD 2 §10 names', () => {
    // Every query imports these; no query writes 50 or 200 as a literal.
    expect(THREAD_RAIL_LIMIT).toBe(50);
    expect(THREAD_WINDOW_MESSAGES).toBe(200);
  });
});

describe('scriptToClipboard', () => {
  it('emits §7.3 block character for character', () => {
    expect(scriptToClipboard(SCRIPT)).toBe(
      [
        'Script type: Opinion',
        'Hook (0-3s): Stop buying brand-new phones',
        '',
        'Body:',
        '1. Most people overpay by half.  (6s)',
        '   Show: The shop counter',
        '   On screen: Overpaying by 50%',
        '2. Here is what to check first.  (9s)',
        '   Show: Close-up of a battery health screen',
        '   On screen: ',
        '',
        'Call to action: Come by the shop this week.',
        'Length: 45s',
        'Based on 聊观点脚本',
      ].join('\n'),
    );
  });

  it('uses an ASCII hyphen in the hook label, not the card en dash', () => {
    // The on-screen card label is `Hook (0–3s)`. The two are deliberately
    // different and neither is a typo.
    expect(scriptToClipboard(SCRIPT)).toContain('Hook (0-3s):');
    expect(scriptToClipboard(SCRIPT)).not.toContain('Hook (0–3s)');
  });

  it('joins beats with a single newline and ends with no trailing newline', () => {
    const text = scriptToClipboard(SCRIPT);
    expect(text).not.toContain('On screen: Overpaying by 50%\n\n2.');
    expect(text.endsWith('\n')).toBe(false);
  });
});

describe('isValidScript', () => {
  it('accepts a well-formed script', () => {
    expect(isValidScript(SCRIPT)).toBe(true);
  });

  it('accepts a blank lesson_used — a caption must not suppress a card', () => {
    // Same treatment as on_screen_text, and for the same reason. The route
    // checked the enum before the row was stored.
    expect(isValidScript({ ...SCRIPT, lesson_used: '' })).toBe(true);
  });

  it('accepts an empty on_screen_text', () => {
    expect(isValidScript(SCRIPT)).toBe(true);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'script'],
    ['a blank hook', { ...SCRIPT, hook: '  ' }],
    ['a blank script_type', { ...SCRIPT, script_type: '' }],
    ['a blank call_to_action', { ...SCRIPT, call_to_action: ' ' }],
    ['a missing lesson_used', { ...SCRIPT, lesson_used: undefined }],
    ['an empty body', { ...SCRIPT, body: [] }],
    ['a body that is not an array', { ...SCRIPT, body: {} }],
    [
      'a beat with a blank say',
      { ...SCRIPT, body: [{ ...SCRIPT.body[0], say: ' ' }] },
    ],
    [
      'a beat with a blank show',
      { ...SCRIPT, body: [{ ...SCRIPT.body[0], show: '' }] },
    ],
    [
      'a beat with a missing on_screen_text',
      { ...SCRIPT, body: [{ say: 'a', seconds: 1, show: 'b' }] },
    ],
    [
      'a beat with zero seconds',
      { ...SCRIPT, body: [{ ...SCRIPT.body[0], seconds: 0 }] },
    ],
    [
      'a beat with fractional seconds',
      { ...SCRIPT, body: [{ ...SCRIPT.body[0], seconds: 1.5 }] },
    ],
    ['a zero length_seconds', { ...SCRIPT, length_seconds: 0 }],
  ])('rejects %s', (_label, value) => {
    expect(isValidScript(value)).toBe(false);
  });
});

describe('relativeThreadDate', () => {
  const now = new Date(2026, 7, 22, 9, 0, 0); // 22 Aug 2026, local

  it('reads Today on the same calendar day', () => {
    expect(
      relativeThreadDate(new Date(2026, 7, 22, 23, 30).toISOString(), now),
    ).toBe('Today');
  });

  it('reads Yesterday on the previous calendar day', () => {
    expect(
      relativeThreadDate(new Date(2026, 7, 21, 0, 5).toISOString(), now),
    ).toBe('Yesterday');
  });

  it('reads a short date for anything older', () => {
    expect(
      relativeThreadDate(new Date(2026, 7, 12, 12, 0).toISOString(), now),
    ).toBe('12 Aug');
  });

  it('renders nothing rather than "Invalid Date"', () => {
    expect(relativeThreadDate('not a timestamp', now)).toBe('');
    expect(relativeThreadDate('', now)).toBe('');
  });
});

describe('sendFailureCopy', () => {
  it('discriminates the two 502s on the error value', () => {
    // The only status with two sentences. PRD 2 §10A.9 owns both strings.
    expect(sendFailureCopy(502, 'model reply truncated')).toBe(
      'The reply was cut off — try asking for something shorter.',
    );
    expect(sendFailureCopy(502, 'model reply unusable')).toBe(
      'The coach could not answer — try again.',
    );
  });

  it('falls back to the unusable sentence when the 502 carries no error', () => {
    expect(sendFailureCopy(502, undefined)).toBe(
      'The coach could not answer — try again.',
    );
  });

  it('ignores the error string on every other status', () => {
    expect(sendFailureCopy(429, 'anything at all')).toBe(
      'That was quick — wait a few seconds and try again.',
    );
  });

  it('covers every status PRD 2 §10 can return', () => {
    for (const status of [400, 401, 403, 404, 429, 503, 504]) {
      expect(sendFailureCopy(status, null)).not.toBe(GENERIC_SEND_FAILURE_COPY);
    }
  });

  it('falls back to the generic sentence on an unlisted status', () => {
    expect(sendFailureCopy(418, null)).toBe(GENERIC_SEND_FAILURE_COPY);
    expect(sendFailureCopy(500, null)).toBe(GENERIC_SEND_FAILURE_COPY);
  });
});
