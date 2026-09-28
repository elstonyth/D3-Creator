'use client';

/**
 * The account board on the admin's Work Tracker: who handles each creator
 * account and who edits its videos.
 *
 * Who handles an account is the admin's to set, once, when a new client
 * comes in: drag its card onto a person's column, or pick them in the card's
 * Handler select (drag and drop does not exist on touch screens). Staff work
 * never moves it. The editor is the staff's to choose — passing a shoot's
 * videos on sets it (lib/team/claim-account.ts) — so it only shows here.
 * Without `onMove` the board is read-only.
 *
 * One column per person who runs accounts (a handler, or someone who does
 * both) plus "Unassigned". Editors are not columns: they sit in a row of
 * chips under the header with what they edit. Month output (videos / views)
 * comes from the scraped snapshots and follows the calendar's month.
 */

import { useEffect, useId, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { cn } from '@gitroom/frontend/lib/utils';
// clsx where a custom font-size token sits next to a text colour:
// tailwind-merge would drop the size (see tracker-shell.tsx).
import clsx from 'clsx';
import { formatCompact } from '@gitroom/frontend/lib/creator-metrics';
import { ImageWithFallback } from '@gitroom/frontend/components/ui/image-with-fallback';
import { Select } from '@gitroom/frontend/components/ui/input';
import {
  PLATFORM_ICONS,
  PLATFORM_LABELS,
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
  accounts: initialAccounts,
  onMove,
}: {
  monthLabel: string;
  /** Everyone who is or was on the board; only those still on it get a place. */
  people: Person[];
  accounts: AccountCard[];
  /** The admin's handover: who handles an account (null = Unassigned). */
  onMove?: (
    creatorId: string,
    handlerId: string | null,
  ) => Promise<{ ok: boolean; message?: string }>;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const titleId = useId();
  const [accounts, setAccounts] = useState(initialAccounts);
  // A refresh brings the server's board again: it replaces this copy. The
  // page hands the same array through until then.
  const [fromServer, setFromServer] = useState(initialAccounts);
  if (fromServer !== initialAccounts) {
    setFromServer(initialAccounts);
    setAccounts(initialAccounts);
  }
  // One handover at a time: a second can't land before a refused first
  // is put back.
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  // What the last handover did, or why it was refused.
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(
    null,
  );

  // Show it for a few seconds, then clear it.
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);

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

  async function move(creatorId: string, col: string) {
    const card = accounts.find((c) => c.id === creatorId);
    if (!onMove || busy || !card || columnOf(card) === col) return;
    const handlerId = col === UNASSIGNED ? null : col;
    const place = (id: string | null) =>
      setAccounts((p) =>
        p.map((c) => (c.id === creatorId ? { ...c, handlerId: id } : c)),
      );
    place(handlerId);
    setBusy(true);
    let r: { ok: boolean; message?: string };
    try {
      r = await onMove(creatorId, handlerId);
    } catch {
      // A dropped connection or a stale deploy: a refusal, not a stuck card.
      r = { ok: false, message: 'Could not save. Try again.' };
    } finally {
      setBusy(false);
    }
    if (!r.ok) {
      place(card.handlerId);
      setNotice({
        id: Date.now(),
        text: t(r.message ?? 'Could not save. Try again.'),
      });
      return;
    }
    setNotice({
      id: Date.now(),
      text: handlerId
        ? t('{account} is now handled by {name}.', {
            account: card.name,
            name: nameOf.get(handlerId) ?? '—',
          })
        : t('{account} is now unassigned.', { account: card.name }),
    });
    router.refresh();
  }

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

  const dropOn = (col: string) =>
    onMove
      ? {
          onDragOver: (e: DragEvent) => {
            if (!dragId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (overCol !== col) setOverCol(col);
          },
          onDragLeave: (e: DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null))
              setOverCol((c) => (c === col ? null : c));
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            const id = dragId;
            setDragId(null);
            setOverCol(null);
            if (id) void move(id, col);
          },
        }
      : {};

  return (
    <GlassPanel className="mt-4 p-4 sm:p-6 md:mt-6">
      <section aria-labelledby={titleId}>
        <div className="mb-5">
          <h2 id={titleId} className="text-heading text-fg">
            {t('Personnel & client configuration')}
          </h2>
          <p className="mt-1 text-body-sm text-fg-muted">
            {t(
              'Who handles and who edits each account. Output is for {month}.',
              { month: monthLabel },
            )}
          </p>
          {onMove ? (
            <p className="mt-1 text-body-sm text-fg-muted">
              {t(
                'Drag an account onto the person who handles it, or pick them on its card. Editors follow what staff choose when they pass videos on.',
              )}
            </p>
          ) : null}
          <p className="mt-1 text-caption text-fg-subtle">
            {t(
              'Videos = different videos posted in {month}. The same clip on several platforms counts once.',
              { month: monthLabel },
            )}
          </p>
          <p role="status" className="mt-2 text-body-sm text-fg">
            {notice?.text}
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
                {...dropOn(col.id)}
                className={cn(
                  s.inset,
                  'flex min-w-0 flex-col p-3 transition-shadow',
                  overCol === col.id && 'ring-2 ring-brand/60',
                )}
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
                        // As the column says: a card in Unassigned has no
                        // handler, even if its old one is still on the team.
                        handler={
                          col.member
                            ? (nameOf.get(col.member.id) ?? null)
                            : null
                        }
                        editor={
                          c.editorId ? (nameOf.get(c.editorId) ?? null) : null
                        }
                        column={col.id}
                        handlers={handlers}
                        movable={!!onMove}
                        busy={busy}
                        dragging={dragId === c.id}
                        onPick={(to) => void move(c.id, to)}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          // Firefox starts no drag without data.
                          e.dataTransfer.setData('text/plain', c.id);
                          setDragId(c.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverCol(null);
                        }}
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
  column,
  handlers,
  movable,
  busy,
  dragging,
  onPick,
  onDragStart,
  onDragEnd,
}: {
  account: AccountCard;
  handler: string | null;
  editor: string | null;
  /** The column it sits in: a handler's id, or Unassigned. */
  column: string;
  /** Who can be picked to handle it. */
  handlers: { id: string; name: string }[];
  movable: boolean;
  /** A handover is being saved. */
  busy: boolean;
  dragging: boolean;
  onPick: (column: string) => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
}) {
  const { t, locale } = useI18n();
  const pickId = useId();

  return (
    <li
      draggable={movable && !busy}
      onDragStart={movable ? onDragStart : undefined}
      onDragEnd={movable ? onDragEnd : undefined}
      className={cn(
        s.inset,
        'p-3',
        movable && 'cursor-grab active:cursor-grabbing',
        dragging && 'opacity-50',
      )}
    >
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
              // The icons are aria-hidden by default; these carry meaning.
              return (
                <Icon
                  key={p}
                  size={12}
                  className="shrink-0"
                  role="img"
                  aria-hidden={false}
                  aria-label={PLATFORM_LABELS[key]}
                />
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

      {movable ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="min-w-0">
            <label
              htmlFor={pickId}
              className="text-micro uppercase tracking-[0.1em] text-fg-subtle"
            >
              {t('Handler')}
            </label>
            <Select
              id={pickId}
              aria-label={t('Handler for {account}', { account: c.name })}
              value={column === UNASSIGNED ? '' : column}
              onChange={(e) => onPick(e.target.value || UNASSIGNED)}
              disabled={busy}
              // No text size here: cn() would read it as a colour and drop
              // the control's own (see tracker-shell.tsx).
              className="mt-0.5 h-9"
            >
              <option value="">{t('Unassigned')}</option>
              {handlers.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </div>
          <dl className="min-w-0">
            <Who label={t('Editor')} name={editor ?? t('Nobody')} />
          </dl>
        </div>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-2">
          <Who label={t('Handler')} name={handler ?? t('Unassigned')} />
          <Who label={t('Editor')} name={editor ?? t('Nobody')} />
        </dl>
      )}
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
