'use client';

/**
 * The account board on the admin's Work Tracker: who handles each creator
 * account and who edits its videos. Read-only — staff work sets it: passing
 * a shoot's videos on makes its owner the account's handler and the editor
 * they chose its editor (lib/team/claim-account.ts). The admin only looks.
 *
 * One column per person who runs accounts (a handler, or someone who does
 * both) plus "Unassigned". Editors are not columns: they sit in a row of
 * chips under the header with what they edit. Month output (videos / views)
 * comes from the scraped snapshots and follows the calendar's month.
 */

import { useId } from 'react';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { cn } from '@gitroom/frontend/lib/utils';
// clsx where a custom font-size token sits next to a text colour:
// tailwind-merge would drop the size (see tracker-shell.tsx).
import clsx from 'clsx';
import { formatCompact } from '@gitroom/frontend/lib/creator-metrics';
import { ImageWithFallback } from '@gitroom/frontend/components/ui/image-with-fallback';
import {
  PLATFORM_ICONS,
  type PlatformKey,
} from '@gitroom/frontend/components/ui/platform-icons';
import type { MemberKind } from '@gitroom/frontend/lib/tracker';
import type { AccountCard } from '@gitroom/frontend/lib/team/accounts';
import { GlassPanel } from './glass-panel';
import s from './tracker.module.scss';

const UNASSIGNED = '__unassigned__';

interface Person {
  id: string;
  name: string;
  kind: MemberKind;
  archived: boolean;
}

function platformKey(p: string): PlatformKey | null {
  if (p === 'rednote') return 'xiaohongshu';
  if (p in PLATFORM_ICONS) return p as PlatformKey;
  return null;
}

interface EditedStats {
  edits: number;
  editedVideos: number;
}

export function AccountBoard({
  monthLabel,
  people,
  accounts,
}: {
  monthLabel: string;
  /** Everyone who is or was on the board; only those still on it get a place. */
  people: Person[];
  accounts: AccountCard[];
}) {
  const { t, locale } = useI18n();
  const titleId = useId();

  const members = people.filter((p) => !p.archived);
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  // Columns: everyone who runs accounts, including people who also edit.
  const handlers = members.filter((m) => m.kind !== 'editor');
  // The chip row: people who cut video but run no accounts.
  const editors = members.filter((m) => m.kind === 'editor');
  const columnIds = new Set(handlers.map((m) => m.id));
  const columns = [
    ...handlers.map((m) => ({ id: m.id, name: m.name, member: m })),
    { id: UNASSIGNED, name: t('Unassigned'), member: null },
  ];

  // The column a card sits in. A handler id that is not a column (someone who
  // has since become an editor) reads as unassigned rather than vanishing.
  const columnOf = (c: AccountCard) =>
    c.handlerId !== null && columnIds.has(c.handlerId)
      ? c.handlerId
      : UNASSIGNED;

  const edited = new Map<string, EditedStats>(
    members.map((m) => [m.id, { edits: 0, editedVideos: 0 }]),
  );
  for (const c of accounts) {
    const e = c.editorId ? edited.get(c.editorId) : undefined;
    if (e) {
      e.edits += 1;
      e.editedVideos += c.videos;
    }
  }

  const editsLine = (st: EditedStats) =>
    st.edits === 1
      ? t('Edits 1 account · {videos} videos', { videos: st.editedVideos })
      : t('Edits {count} accounts · {videos} videos', {
          count: st.edits,
          videos: st.editedVideos,
        });

  return (
    <GlassPanel className="mt-4 p-4 sm:p-6 md:mt-6">
      <section aria-labelledby={titleId}>
        <div className="mb-5">
          <h2 id={titleId} className="text-heading text-fg">
            {t('Personnel & client configuration')}
          </h2>
          <p className="mt-1 text-body-sm text-fg-muted">
            {t(
              'Who handles and who edits each account, updated as staff pass their videos on. Output is for {month}.',
              { month: monthLabel },
            )}
          </p>
          <p className="mt-1 text-caption text-fg-subtle">
            {t(
              'Videos = different videos posted in {month}. The same clip on several platforms counts once.',
              { month: monthLabel },
            )}
          </p>
        </div>

        {/* Editors: people who cut video but run no accounts. */}
        <section
          aria-label={t('Editors')}
          className="mb-5 flex flex-wrap items-center gap-2"
        >
          <span className="mr-1 text-micro uppercase tracking-[0.14em] text-fg-subtle">
            {t('Editors')}
          </span>
          {editors.length === 0 ? (
            <span className="text-caption text-fg-subtle">
              {t('No editors yet.')}
            </span>
          ) : null}
          {editors.map((m) => (
            <span
              key={m.id}
              className={clsx(
                s.pill,
                'flex items-center gap-2 px-3 py-1 text-caption text-fg',
              )}
            >
              <span className="text-label">{m.name}</span>
              <span className="text-fg-subtle">
                {editsLine(edited.get(m.id)!)}
              </span>
            </span>
          ))}
        </section>

        {/* Columns fit the panel and wrap onto new rows when they run out of
            room — the board never scrolls sideways. */}
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {columns.map((col) => {
            const cards = accounts.filter((c) => columnOf(c) === col.id);
            const ed = col.member ? edited.get(col.member.id) : undefined;
            return (
              <section
                key={col.id}
                // Not just the name: the Team panel above has a region per
                // person too.
                aria-label={
                  col.member
                    ? t('{name}’s accounts', { name: col.name })
                    : t('Unassigned accounts')
                }
                className={cn(s.inset, 'flex min-w-0 flex-col p-3')}
              >
                <header className="mb-3 px-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="min-w-0 break-words text-subsection text-fg">
                      {col.name}
                    </h3>
                    {col.member ? (
                      <span
                        className={clsx(
                          s.pill,
                          'shrink-0 px-2.5 py-1 text-micro uppercase tracking-[0.1em] text-fg-muted',
                        )}
                      >
                        {col.member.kind === 'both'
                          ? t('Handler & editor')
                          : t('Handler')}
                      </span>
                    ) : null}
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2">
                    <Stat label={t('Accounts')} value={String(cards.length)} />
                    <Stat
                      label={t('Videos')}
                      value={formatCompact(
                        cards.reduce((n, c) => n + c.videos, 0),
                        locale,
                      )}
                    />
                    <Stat
                      label={t('Views')}
                      value={formatCompact(
                        cards.reduce((n, c) => n + c.views, 0),
                        locale,
                      )}
                    />
                  </dl>
                  {ed ? (
                    <p className="mt-1.5 text-caption text-fg-subtle">
                      {editsLine(ed)}
                    </p>
                  ) : null}
                </header>

                {cards.length === 0 ? (
                  <p className="flex min-h-[96px] flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 px-3 py-6 text-center text-caption text-fg-subtle">
                    {col.member
                      ? t('No accounts yet.')
                      : t('Every account has a handler.')}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {cards.map((c) => (
                      <AccountItem
                        key={c.id}
                        account={c}
                        handler={
                          c.handlerId ? (nameOf.get(c.handlerId) ?? null) : null
                        }
                        editor={
                          c.editorId ? (nameOf.get(c.editorId) ?? null) : null
                        }
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </section>
    </GlassPanel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-micro uppercase tracking-[0.1em] text-fg-subtle">
        {label}
      </dt>
      <dd className="text-heading tnum text-fg">{value}</dd>
    </div>
  );
}

function AccountItem({
  account: c,
  handler,
  editor,
}: {
  account: AccountCard;
  handler: string | null;
  editor: string | null;
}) {
  const { t, locale } = useI18n();

  return (
    <li className={cn(s.inset, 'p-3')}>
      <div className="flex items-center gap-3">
        <ImageWithFallback
          src={c.avatarUrl}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-white/15"
          fallback={
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-label text-fg ring-1 ring-white/15">
              {c.name.slice(0, 1).toUpperCase()}
            </span>
          }
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-label text-fg">{c.name}</p>
          <div className="mt-1 flex items-center gap-1.5 text-fg-muted">
            {c.platforms.map((p) => {
              const key = platformKey(p);
              if (!key) return null;
              const Icon = PLATFORM_ICONS[key];
              return (
                <Icon key={p} size={12} className="shrink-0" aria-label={p} />
              );
            })}
          </div>
        </div>
        <div className="text-right">
          <p className="text-heading tnum leading-none text-fg">{c.videos}</p>
          <p className="mt-1 text-micro uppercase tracking-[0.1em] text-fg-subtle">
            {t('videos')}
          </p>
        </div>
      </div>

      <p className="mt-3 text-caption tnum text-fg-muted">
        {t('{views} views · {posts} posts', {
          views: formatCompact(c.views, locale),
          posts: c.posts,
        })}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        <Who label={t('Handler')} name={handler ?? t('Unassigned')} />
        <Who label={t('Editor')} name={editor ?? t('Nobody')} />
      </dl>
    </li>
  );
}

function Who({ label, name }: { label: string; name: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-micro uppercase tracking-[0.1em] text-fg-subtle">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-body-sm text-fg">{name}</dd>
    </div>
  );
}
