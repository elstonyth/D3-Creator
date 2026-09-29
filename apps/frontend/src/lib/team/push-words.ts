/**
 * What each push says (lib/team/push.ts sends them): the pop-up's news
 * (components/team/work-alerts.tsx) in the pop-up's words and by its rules
 * (isNews), in the language of the device it goes to. A push carries about
 * 4 KB at most, so what it says is kept short (clip). Pure: the sender and
 * its tests.
 */

import {
  createTranslator,
  localeTag,
  type Locale,
} from '@gitroom/frontend/lib/i18n';
import { fmtDate, todayKey } from '@gitroom/frontend/lib/tracker';
import { shootDueAt, type Shoot } from './shoots';

// ponytail: fixed caps rather than a byte-budget packer. 30 titles of 200
// Chinese characters (the most a pass allows) still come to ~350 bytes.
const TITLES_SHOWN = 3;
const TITLE_CHARS = 40;
const BODY_BYTES = 600;

const utf8 = new TextEncoder();

/** `text` cut to `maxBytes` of UTF-8, at a character, with … when cut. */
export function clip(text: string, maxBytes: number): string {
  if (utf8.encode(text).length <= maxBytes) return text;
  let out = '';
  let used = utf8.encode('…').length;
  for (const ch of text) {
    used += utf8.encode(ch).length;
    if (used > maxBytes) break;
    out += ch;
  }
  return `${out}…`;
}

const shorten = (title: string) => {
  const chars = Array.from(title);
  return chars.length > TITLE_CHARS
    ? `${chars.slice(0, TITLE_CHARS).join('')}…`
    : title;
};

/** Something that happened, and the person (`to`) it is news for. */
export type PushEvent =
  | {
      /** Videos given to `to` to edit, by `from`. */
      kind: 'edit';
      to: string;
      from: string;
      titles: string[];
      creatorId: string | null;
      /** One of the videos: the notification's tag. */
      ref: string;
    }
  | {
      /** A cut `by` finished, waiting on `to`'s Verify. */
      kind: 'verify';
      to: string;
      by: string;
      title: string;
      creatorId: string | null;
      ref: string;
    }
  | {
      /** A shoot of `to`'s: added or changed by someone else, or due. */
      kind: 'new-shoot' | 'changed-shoot' | 'due';
      to: string;
      shoot: Shoot;
    };

export interface PushText {
  title: string;
  body: string;
  /** A later push with the same tag replaces this one on the device. */
  tag: string;
}

/** Names for the ids an event carries. */
export interface PushNames {
  person: (id: string) => string;
  account: (id: string | null) => string | null;
}

export function pushText(
  e: PushEvent,
  locale: Locale,
  names: PushNames,
  today = todayKey(),
): PushText {
  const t = createTranslator(locale);
  const line = (...parts: (string | null)[]) =>
    parts.filter(Boolean).join(' · ');

  if (e.kind === 'edit') {
    const shown = e.titles
      .slice(0, TITLES_SHOWN)
      .map(shorten)
      .join(locale === 'zh' ? '、' : ', ');
    const more = e.titles.length - TITLES_SHOWN;
    return {
      title: t('New videos to edit'),
      body: clip(
        line(
          more > 0 ? `${shown} ${t('+{count} more', { count: more })}` : shown,
          t('From {name}', { name: names.person(e.from) }),
          names.account(e.creatorId),
        ),
        BODY_BYTES,
      ),
      tag: `edit:${e.ref}`,
    };
  }
  if (e.kind === 'verify')
    return {
      title: t('Edited — ready for you to verify'),
      body: clip(
        line(
          shorten(e.title),
          t('Cut by {name}', { name: names.person(e.by) }),
          names.account(e.creatorId),
        ),
        BODY_BYTES,
      ),
      tag: `verify:${e.ref}`,
    };

  const s = e.shoot;
  const label = line(
    s.date === today
      ? t('Today')
      : fmtDate(s.date, localeTag(locale), {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }),
    s.time,
    s.title ?? names.account(s.creatorId) ?? t('Shoot'),
  );
  if (e.kind === 'due')
    return {
      title: t('Shoot time is up — pass the videos on'),
      body: clip(label, BODY_BYTES),
      tag: `due:${s.id}`,
    };
  if (e.kind === 'new-shoot')
    return {
      title: t('New shoot scheduled for you'),
      body: clip(label, BODY_BYTES),
      tag: `shoot:${s.id}`,
    };
  return {
    title: t('Shoot changed for you'),
    body: clip(
      line(
        label,
        s.status === 'cancelled'
          ? t('Cancelled')
          : s.movedReason
            ? t('Changed: {reason}', { reason: s.movedReason })
            : null,
      ),
      BODY_BYTES,
    ),
    tag: `shoot:${s.id}`,
  };
}

/**
 * Whether an event is still news, by the pop-up's rules: a change to a done
 * shoot is not, and a new or changed shoot that is already due is asked
 * about as due instead (the cron's push, as the pop-up's due list).
 */
export function isNews(e: PushEvent, now: number): boolean {
  if (e.kind !== 'new-shoot' && e.kind !== 'changed-shoot') return true;
  const s = e.shoot;
  if (s.status === 'done') return false;
  return !(s.status === 'planned' && now >= shootDueAt(s));
}
