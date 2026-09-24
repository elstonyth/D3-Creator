/**
 * A person's accounts for one month — the ones they handle and the ones they
 * edit — each with that month's output. Server component; used by the staff
 * portal's My accounts page and by the history pages.
 */

import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { formatCompact } from '@gitroom/frontend/lib/creator-metrics';
import { ImageWithFallback } from '@gitroom/frontend/components/ui/image-with-fallback';
import {
  PLATFORM_ICONS,
  PLATFORM_LABELS,
  type PlatformKey,
} from '@gitroom/frontend/components/ui/platform-icons';
import type { AccountMonth } from '@gitroom/frontend/lib/team/load';

function platformKey(p: string): PlatformKey | null {
  if (p === 'rednote') return 'xiaohongshu';
  return p in PLATFORM_ICONS ? (p as PlatformKey) : null;
}

export async function AccountsView({
  handled,
  edited,
}: {
  handled: AccountMonth[];
  edited: AccountMonth[];
}) {
  const { t } = await getI18n();
  return (
    <div className="space-y-8">
      <AccountList
        title={t('Accounts handled')}
        empty={t('No accounts handled this month.')}
        accounts={handled}
      />
      <AccountList
        title={t('Accounts edited')}
        empty={t('No accounts edited this month.')}
        accounts={edited}
      />
    </div>
  );
}

async function AccountList({
  title,
  empty,
  accounts,
}: {
  title: string;
  empty: string;
  accounts: AccountMonth[];
}) {
  const { t, locale } = await getI18n();
  const videos = accounts.reduce((n, a) => n + a.videos, 0);
  const views = accounts.reduce((n, a) => n + a.views, 0);
  return (
    <section aria-label={title}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-heading text-fg">{title}</h2>
        {accounts.length > 0 ? (
          <p className="text-caption tnum text-fg-muted">
            {t('{accounts} accounts · {videos} videos · {views} views', {
              accounts: accounts.length,
              videos,
              views: formatCompact(views, locale),
            })}
          </p>
        ) : null}
      </div>
      {accounts.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-4 text-body-sm text-fg-muted">
          {empty}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4"
            >
              <ImageWithFallback
                src={a.avatarUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover"
                fallback={
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-label text-fg">
                    {a.name.slice(0, 1).toUpperCase()}
                  </span>
                }
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-label text-fg">{a.name}</p>
                <div className="mt-1 flex items-center gap-1.5 text-fg-muted">
                  {a.platforms.map((p) => {
                    const key = platformKey(p);
                    if (!key) return null;
                    const Icon = PLATFORM_ICONS[key];
                    // The icons are aria-hidden by default; these carry
                    // meaning, so they are named images here.
                    return (
                      <Icon
                        key={p}
                        size={12}
                        role="img"
                        aria-hidden={false}
                        aria-label={PLATFORM_LABELS[key]}
                      />
                    );
                  })}
                </div>
                <p className="mt-1.5 text-caption tnum text-fg-muted">
                  {t('{videos} videos · {views} views', {
                    videos: a.videos,
                    views: formatCompact(a.views, locale),
                  })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
