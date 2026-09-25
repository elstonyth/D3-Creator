/**
 * One person's month: the shoots they did (or called off), the videos that
 * came out of them, the accounts they held when the month ended and what
 * those accounts put out, and every handover that touched them. Server
 * component; the staff portal shows your own, the admin's Team page anyone's.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { formatCompact } from '@gitroom/frontend/lib/creator-metrics';
import { addMonths, dateKeyAt } from '@gitroom/frontend/lib/tracker';
import { Pill } from './pill';
import { Stat, StatRow } from '@gitroom/frontend/components/ui/stat';
import type { Shoot } from '@gitroom/frontend/lib/team/shoots';
import type { AccountMonth, Handover } from '@gitroom/frontend/lib/team/load';
import { AccountsView } from './accounts-view';

function fmt(
  key: string,
  tag: 'en' | 'zh-CN',
  opts: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(tag, { timeZone: 'UTC', ...opts }).format(
    new Date(key.length === 7 ? `${key}-01T00:00:00Z` : `${key}T00:00:00Z`),
  );
}

export async function HistoryView({
  month,
  thisMonth,
  monthHref,
  shoots,
  accountName,
  handled,
  edited,
  handovers,
  children,
}: {
  /** `YYYY-MM` on screen. */
  month: string;
  /** `YYYY-MM` today; the month nav stops there. */
  thisMonth: string;
  /** Link to another month of this same history. */
  monthHref: (month: string) => string;
  shoots: Shoot[];
  accountName: Map<string, string>;
  handled: AccountMonth[];
  edited: AccountMonth[];
  handovers: Handover[];
  /** Month-scoped extras shown under the totals (the person's videos). */
  children?: ReactNode;
}) {
  const { t, locale } = await getI18n();
  const tag = localeTag(locale);
  const done = shoots.filter((s) => s.status === 'done');
  const cancelled = shoots.filter((s) => s.status === 'cancelled').length;
  const planned = shoots.length - done.length - cancelled;
  const shot = done.reduce((n, s) => n + (s.videosShot ?? 0), 0);
  const handledVideos = handled.reduce((n, a) => n + a.videos, 0);
  const handledViews = handled.reduce((n, a) => n + a.views, 0);
  const days = Array.from(new Set(shoots.map((s) => s.date)));
  const next = addMonths(month, 1);

  return (
    <div className="space-y-10">
      <nav
        aria-label={t('Month')}
        className="flex flex-wrap items-center gap-2"
      >
        <Link
          href={monthHref(addMonths(month, -1))}
          className="rounded-md px-2 py-1 text-label text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:shadow-focusRing"
          aria-label={t('Previous month')}
        >
          ←
        </Link>
        <h2 className="text-heading text-fg">
          {fmt(month, tag, { month: 'long', year: 'numeric' })}
        </h2>
        {next <= thisMonth ? (
          <Link
            href={monthHref(next)}
            className="rounded-md px-2 py-1 text-label text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:shadow-focusRing"
            aria-label={t('Next month')}
          >
            →
          </Link>
        ) : null}
      </nav>

      <StatRow>
        <Stat
          label={t('Shoots done')}
          value={done.length}
          meta={t('{planned} still planned · {cancelled} cancelled', {
            planned,
            cancelled,
          })}
        />
        <Stat
          label={t('Videos shot')}
          value={shot}
          meta={t('From shoots marked done')}
        />
        <Stat
          label={t('Accounts handled')}
          value={handled.length}
          meta={t('{videos} videos · {views} views', {
            videos: handledVideos,
            views: formatCompact(handledViews, locale),
          })}
        />
      </StatRow>

      {children}

      <section aria-label={t('Shoots')}>
        <h2 className="mb-3 text-heading text-fg">{t('Shoots')}</h2>
        {shoots.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-4 text-body-sm text-fg-muted">
            {t('No shoots this month.')}
          </p>
        ) : (
          <ol className="space-y-3">
            {days.map((day) => (
              <li
                key={day}
                className="rounded-2xl border border-line bg-surface p-4"
              >
                <p className="mb-2 text-label text-fg">
                  {fmt(day, tag, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
                <ul className="space-y-1.5">
                  {shoots
                    .filter((s) => s.date === day)
                    .map((s) => (
                      <li key={s.id} className="flex items-start gap-3">
                        <span className="w-12 shrink-0 text-label tnum text-fg-muted">
                          {s.time ?? '—'}
                        </span>
                        <span
                          className={
                            s.status === 'cancelled'
                              ? 'min-w-0 flex-1 break-words text-body-sm text-fg-muted line-through'
                              : 'min-w-0 flex-1 break-words text-body-sm text-fg'
                          }
                        >
                          {s.title}
                          {s.creatorId && accountName.get(s.creatorId) ? (
                            <span className="text-fg-muted">
                              {' · '}
                              {accountName.get(s.creatorId)}
                            </span>
                          ) : null}
                        </span>
                        {s.status === 'done' ? (
                          <Pill className="shrink-0">
                            {s.videosShot != null
                              ? t('Finished · {count} videos', {
                                  count: s.videosShot,
                                })
                              : t('Finished')}
                          </Pill>
                        ) : s.status === 'cancelled' ? (
                          <Pill tone="muted" className="shrink-0">
                            {t('Cancelled')}
                          </Pill>
                        ) : (
                          <Pill tone="muted" className="shrink-0">
                            {t('Planned')}
                          </Pill>
                        )}
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>

      <AccountsView handled={handled} edited={edited} />

      <section aria-label={t('Handovers')}>
        <h2 className="mb-1 text-heading text-fg">{t('Handovers')}</h2>
        <p className="mb-3 text-caption text-fg-subtle">
          {t('Accounts handed over during the month.')}
        </p>
        {handovers.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-4 text-body-sm text-fg-muted">
            {t('No handovers this month.')}
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {handovers.map((h, i) => (
              <li
                key={`${h.creatorId}-${h.at}-${i}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-body-sm"
              >
                <span className="w-16 shrink-0 text-caption tnum text-fg-subtle">
                  {fmt(dateKeyAt(new Date(h.at)), tag, {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                <span className="text-fg">{h.creatorName}</span>
                <span className="text-fg-muted">
                  {t('{role}: {from} → {to}', {
                    role: h.field === 'handler' ? t('handler') : t('editor'),
                    from: h.from ?? t('nobody'),
                    to: h.to ?? t('nobody'),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
