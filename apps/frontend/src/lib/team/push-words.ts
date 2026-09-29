/**
 * What each push says (lib/team/push.ts sends them): the pop-up's news
 * (components/team/work-alerts.tsx) in the pop-up's words, in the language of
 * the device it goes to. Pure: the sender and its tests.
 */

import {
  createTranslator,
  localeTag,
  type Locale,
} from '@gitroom/frontend/lib/i18n';
import { fmtDate, todayKey } from '@gitroom/frontend/lib/tracker';
import type { Shoot } from './shoots';

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

  if (e.kind === 'edit')
    return {
      title: t('New videos to edit'),
      body: line(
        e.titles.join(locale === 'zh' ? '、' : ', '),
        t('From {name}', { name: names.person(e.from) }),
        names.account(e.creatorId),
      ),
      tag: `edit:${e.ref}`,
    };
  if (e.kind === 'verify')
    return {
      title: t('Edited — ready for you to verify'),
      body: line(
        e.title,
        t('Cut by {name}', { name: names.person(e.by) }),
        names.account(e.creatorId),
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
      body: label,
      tag: `due:${s.id}`,
    };
  if (e.kind === 'new-shoot')
    return {
      title: t('New shoot scheduled for you'),
      body: label,
      tag: `shoot:${s.id}`,
    };
  return {
    title: t('Shoot changed for you'),
    body: line(
      label,
      s.status === 'cancelled'
        ? t('Cancelled')
        : s.movedReason
          ? t('Changed: {reason}', { reason: s.movedReason })
          : null,
    ),
    tag: `shoot:${s.id}`,
  };
}
