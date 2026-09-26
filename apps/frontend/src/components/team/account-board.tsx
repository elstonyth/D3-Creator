'use client';

/**
 * The account board on the admin's Work Tracker: who handles each creator
 * account and who edits its videos.
 *
 * One column per person who runs accounts (a handler, or someone who does
 * both) plus an "Unassigned" pool. Editors are not columns: they sit in a row
 * of chips under the header and are offered in every card's Editor select
 * next to the handlers. Each card is one account (an IP); dragging it onto a
 * column sets who handles it. The card's own controls set who edits its
 * videos and whether it is on a posting schedule — fixed per account, never
 * per video. Month output (videos / views) comes from the scraped snapshots
 * and follows the calendar's month.
 *
 * Dropping a card on another card puts it in front of that card, so the
 * order inside a column is the team's to set. Every card also carries a
 * handler select and up/down arrows, because HTML5 drag-and-drop does not
 * exist on touch screens and the board is used from phones.
 *
 * People join and leave on the Team page; this board only places accounts.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
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
import {
  placeCard,
  placementChanges,
  restorePlacement,
  type AccountCard,
} from '@gitroom/frontend/lib/team/accounts';
import {
  placeCards,
  setAssignment,
  type BoardResult,
} from '@gitroom/frontend/lib/team/account-actions';
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

/**
 * A server action can throw on the client — a dropped connection on a phone,
 * or a tab opened before a deploy. The board already handles a refusal (roll
 * back, say why), so a throw becomes one.
 */
async function safeCall(
  call: () => Promise<BoardResult>,
): Promise<BoardResult> {
  try {
    return await call();
  } catch {
    return { ok: false, message: 'Could not save. Try again.' };
  }
}

const noSubscribe = () => () => {};

interface HandledStats {
  accounts: number;
  videos: number;
  views: number;
}

interface EditedStats {
  edits: number;
  editedVideos: number;
}

export function AccountBoard({
  monthLabel,
  people,
  accounts: initialAccounts,
}: {
  monthLabel: string;
  /** Everyone who is or was on the board; only those still on it are offered. */
  people: Person[];
  accounts: AccountCard[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const titleId = useId();
  const [creators, setCreators] = useState(initialAccounts);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  // The card a dragged card would land in front of.
  const [overCard, setOverCard] = useState<string | null>(null);
  // Why the last save was refused; keyed so a repeat restarts the timer.
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(
    null,
  );

  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

  // Show it for a few seconds, then clear it.
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const fail = useCallback((r: BoardResult, rollback: () => void) => {
    rollback();
    setNotice({
      id: Date.now(),
      text: r.message ?? 'Could not save. Try again.',
    });
  }, []);

  const members = useMemo(() => people.filter((p) => !p.archived), [people]);
  // Columns: everyone who runs accounts, including people who also edit.
  const handlers = useMemo(
    () => members.filter((m) => m.kind !== 'editor'),
    [members],
  );
  // The chip row: people who cut video but run no accounts.
  const editors = useMemo(
    () => members.filter((m) => m.kind === 'editor'),
    [members],
  );
  // A card's Editor select offers everyone who cuts video first.
  const cutters = useMemo(
    () => members.filter((m) => m.kind !== 'handler'),
    [members],
  );

  const columns = useMemo(
    () => [
      ...handlers.map((m) => ({ id: m.id, name: m.name, member: m })),
      { id: UNASSIGNED, name: t('Unassigned'), member: null },
    ],
    [handlers, t],
  );

  const columnIds = useMemo(
    () => new Set(handlers.map((m) => m.id)),
    [handlers],
  );

  // The column a card sits in. A handler id that is not a column (someone who
  // has since left or become an editor) reads as unassigned rather than
  // vanishing.
  const columnOf = useCallback(
    (c: AccountCard) =>
      c.handlerId !== null && columnIds.has(c.handlerId)
        ? c.handlerId
        : UNASSIGNED,
    [columnIds],
  );

  // Card placement (column + order) saves one at a time, always from the
  // newest board: quick moves queue behind the save in flight instead of
  // racing it. A failed save puts back the placement the server last
  // accepted — never a per-move snapshot, which two overlapping moves would
  // interleave.
  const latest = useRef(initialAccounts);
  const confirmed = useRef(initialAccounts);
  const saving = useRef(false);
  // The columns as they are now: a save queued behind another must see them.
  const columnsNow = useRef(columnIds);
  const [placeTick, setPlaceTick] = useState(0);

  useEffect(() => {
    latest.current = creators;
  }, [creators]);
  useEffect(() => {
    columnsNow.current = columnIds;
  }, [columnIds]);

  // A card moved with its own arrow is re-inserted into the page, which drops
  // keyboard focus. Hand it back to that arrow, or to the other one if the
  // card reached the end of its column.
  const refocus = useRef<{ id: string; dir: 'up' | 'down' } | null>(null);
  useLayoutEffect(() => {
    const r = refocus.current;
    if (!r) return;
    refocus.current = null;
    const arrow = (dir: 'up' | 'down') =>
      document.querySelector<HTMLButtonElement>(`[data-move="${dir}:${r.id}"]`);
    const same = arrow(r.dir);
    (same && !same.disabled
      ? same
      : arrow(r.dir === 'up' ? 'down' : 'up')
    )?.focus();
  }, [creators]);

  const flushPlacement = useCallback(
    async function run(): Promise<void> {
      if (saving.current) return;
      const now = latest.current;
      const work = placementChanges(confirmed.current, now, columnsNow.current);
      if (work.length === 0) return;
      saving.current = true;
      // ponytail: columns save one by one; if a later one fails after an
      // earlier one landed, the screen rewinds both until the next reload.
      // Two columns in one save needs two moves inside one save's latency.
      for (const w of work) {
        const r = await safeCall(() => placeCards(w.handlerId, w.ids, w.moved));
        if (!r.ok) {
          saving.current = false;
          fail(r, () =>
            setCreators((p) => restorePlacement(p, confirmed.current)),
          );
          return;
        }
      }
      confirmed.current = now;
      saving.current = false;
      // Drop the router's cached copy after every save that landed, so
      // Back/Forward can't bring back the board as it was before it — even
      // if a save queued behind this one is refused.
      router.refresh();
      if (latest.current !== now) void run();
    },
    [fail, router],
  );

  // After the render that applied a move (so `latest` holds it).
  useEffect(() => {
    if (placeTick === 0) return;
    const id = window.setTimeout(() => void flushPlacement(), 0);
    return () => window.clearTimeout(id);
  }, [placeTick, flushPlacement]);

  const stats = useMemo(() => {
    const handled = new Map<string, HandledStats>();
    for (const c of columns)
      handled.set(c.id, { accounts: 0, videos: 0, views: 0 });
    const edited = new Map<string, EditedStats>();
    for (const m of members) edited.set(m.id, { edits: 0, editedVideos: 0 });
    for (const c of creators) {
      const h = handled.get(columnOf(c))!;
      h.accounts += 1;
      h.videos += c.videos;
      h.views += c.views;
      const e = c.editorId ? edited.get(c.editorId) : undefined;
      if (e) {
        e.edits += 1;
        e.editedVideos += c.videos;
      }
    }
    return { handled, edited };
  }, [columns, members, creators, columnOf]);

  function patch(creatorId: string, p: Partial<AccountCard>) {
    setCreators((prev) =>
      prev.map((c) => (c.id === creatorId ? { ...c, ...p } : c)),
    );
  }

  // Rollbacks undo only the value this call set, and only if it is still in
  // place — a later edit to the same card must not be reverted with it.
  async function assignEditor(creatorId: string, editorId: string | null) {
    const before = creators.find((c) => c.id === creatorId);
    if (!before || before.editorId === editorId) return;
    patch(creatorId, { editorId });
    const r = await safeCall(() => setAssignment(creatorId, { editorId }));
    if (!r.ok) {
      fail(r, () =>
        setCreators((p) =>
          p.map((c) =>
            c.id === creatorId && c.editorId === editorId
              ? { ...c, editorId: before.editorId }
              : c,
          ),
        ),
      );
      return;
    }
    router.refresh();
  }

  async function toggleScheduled(creatorId: string) {
    const before = creators.find((c) => c.id === creatorId);
    if (!before) return;
    const next = !before.scheduledPosting;
    patch(creatorId, { scheduledPosting: next });
    const r = await safeCall(() =>
      setAssignment(creatorId, { scheduledPosting: next }),
    );
    if (!r.ok) {
      fail(r, () =>
        setCreators((p) =>
          p.map((c) =>
            c.id === creatorId && c.scheduledPosting === next
              ? { ...c, scheduledPosting: !next }
              : c,
          ),
        ),
      );
      return;
    }
    router.refresh();
  }

  // Card `id` goes into column `colId` in front of `beforeId` (last when
  // null). The save follows on its own (flushPlacement).
  function place(id: string, colId: string, beforeId: string | null) {
    const handlerId = colId === UNASSIGNED ? null : colId;
    setCreators((p) => placeCard(p, id, handlerId, beforeId));
    setPlaceTick((n) => n + 1);
  }

  function endDrag() {
    setDragId(null);
    setOverCol(null);
    setOverCard(null);
  }

  function dropOn(colId: string, beforeId: string | null) {
    const id = dragId;
    endDrag();
    if (id && id !== beforeId) place(id, colId, beforeId);
  }

  const live = (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-4 bottom-5 z-50 flex justify-center"
    >
      {notice ? (
        <p
          key={notice.id}
          className="min-w-0 max-w-md break-words rounded-xl border border-line bg-surface px-4 py-3 text-body-sm text-fg shadow-glass"
        >
          {t(notice.text)}
        </p>
      ) : null}
    </div>
  );

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
              'Drag an account onto a person to hand it over. Output is for {month}.',
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
                {editsLine(stats.edited.get(m.id)!)}
              </span>
            </span>
          ))}
        </section>

        {/* Columns fit the panel and wrap onto new rows when they run out of
          room — the board never scrolls sideways. */}
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {columns.map((col) => {
            const st = stats.handled.get(col.id)!;
            const ed = col.member ? stats.edited.get(col.member.id) : undefined;
            const cards = creators.filter((c) => columnOf(c) === col.id);
            const isOver = overCol === col.id && dragId !== null;
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
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (overCol !== col.id) setOverCol(col.id);
                }}
                onDragLeave={(e) => {
                  if (
                    !e.currentTarget.contains(e.relatedTarget as Node | null)
                  ) {
                    setOverCol((o) => (o === col.id ? null : o));
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOn(col.id, null);
                }}
                className={cn(
                  s.inset,
                  'flex min-h-[240px] min-w-0 flex-col p-3 transition-colors',
                  isOver && s.dropTarget,
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
                    <Stat label={t('Accounts')} value={String(st.accounts)} />
                    <Stat
                      label={t('Videos')}
                      value={formatCompact(st.videos, locale)}
                    />
                    <Stat
                      label={t('Views')}
                      value={formatCompact(st.views, locale)}
                    />
                  </dl>
                  {ed ? (
                    <p className="mt-1.5 text-caption text-fg-subtle">
                      {editsLine(ed)}
                    </p>
                  ) : null}
                </header>

                <div className="flex flex-1 flex-col gap-2">
                  {cards.length === 0 ? (
                    <p className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 px-3 py-6 text-center text-caption text-fg-subtle">
                      {col.member
                        ? t('Drop an account here.')
                        : t('Every account has a handler.')}
                    </p>
                  ) : (
                    cards.map((c, i) => (
                      <CreatorCard
                        key={c.id}
                        creator={c}
                        handlers={handlers}
                        editors={cutters}
                        dragging={dragId === c.id}
                        dropBefore={
                          overCard === c.id &&
                          dragId !== null &&
                          dragId !== c.id
                        }
                        onDragStart={() => setDragId(c.id)}
                        onDragEnd={endDrag}
                        onDragOverCard={(e) => {
                          if (dragId === null) return;
                          // Never let the column see it: over a card, the drop
                          // means "in front of this card", not "last".
                          e.stopPropagation();
                          if (dragId === c.id) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (overCard !== c.id) setOverCard(c.id);
                          if (overCol !== col.id) setOverCol(col.id);
                        }}
                        onDragLeaveCard={(e) => {
                          if (
                            !e.currentTarget.contains(
                              e.relatedTarget as Node | null,
                            )
                          )
                            setOverCard((o) => (o === c.id ? null : o));
                        }}
                        onDropOnCard={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dropOn(col.id, c.id);
                        }}
                        onUp={
                          i > 0
                            ? () => {
                                refocus.current = { id: c.id, dir: 'up' };
                                place(c.id, col.id, cards[i - 1].id);
                              }
                            : undefined
                        }
                        onDown={
                          i < cards.length - 1
                            ? () => {
                                refocus.current = { id: c.id, dir: 'down' };
                                place(c.id, col.id, cards[i + 2]?.id ?? null);
                              }
                            : undefined
                        }
                        // The select hands the card over and puts it last
                        // in its new column, the same as dropping it there.
                        onHandler={(id) => place(c.id, id ?? UNASSIGNED, null)}
                        onEditor={(id) => assignEditor(c.id, id)}
                        onToggleScheduled={() => toggleScheduled(c.id)}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {/* Always there, so a screen reader reads out each notice put in it.
          Portalled to the body: the glass panel has a backdrop-filter, which
          would pin a fixed child to the panel instead of the window. */}
        {inBrowser ? createPortal(live, document.body) : live}
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

function ArrowIcon({ dir }: { dir: 'up' | 'down' }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5">
      <path
        d={dir === 'up' ? 'M8 13V3M4 7l4-4 4 4' : 'M8 3v10M4 9l4 4 4-4'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CreatorCard({
  creator,
  handlers,
  editors,
  dragging,
  dropBefore,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDragLeaveCard,
  onDropOnCard,
  onUp,
  onDown,
  onHandler,
  onEditor,
  onToggleScheduled,
}: {
  creator: AccountCard;
  handlers: Person[];
  /** Everyone who cuts video: editors, and people who do both. */
  editors: Person[];
  dragging: boolean;
  dropBefore: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverCard: (e: DragEvent<HTMLElement>) => void;
  onDragLeaveCard: (e: DragEvent<HTMLElement>) => void;
  onDropOnCard: (e: DragEvent<HTMLElement>) => void;
  /** Undefined at the top / bottom of the column. */
  onUp?: () => void;
  onDown?: () => void;
  onHandler: (id: string | null) => void;
  onEditor: (id: string | null) => void;
  onToggleScheduled: () => void;
}) {
  const { t, locale } = useI18n();
  const initials = creator.name.slice(0, 1).toUpperCase();
  const handlerId = `h-${creator.id}`;
  const editorId = `e-${creator.id}`;
  // Every card's controls share their labels; each names its account too.
  const nameId = `n-${creator.id}`;

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', creator.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOverCard}
      onDragLeave={onDragLeaveCard}
      onDrop={onDropOnCard}
      className={cn(
        s.inset,
        s.insetHover,
        'cursor-grab select-none p-3 active:cursor-grabbing',
        dragging && s.dragging,
        dropBefore && s.dropBefore,
      )}
    >
      <div className="flex items-center gap-3">
        <ImageWithFallback
          src={creator.avatarUrl}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-white/15"
          fallback={
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-label text-fg ring-1 ring-white/15">
              {initials}
            </span>
          }
        />
        <div className="min-w-0 flex-1">
          <p id={nameId} className="truncate text-label text-fg">
            {creator.name}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-fg-muted">
            {creator.platforms.map((p) => {
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
          <p className="text-heading tnum leading-none text-fg">
            {creator.videos}
          </p>
          <p className="mt-1 text-micro uppercase tracking-[0.1em] text-fg-subtle">
            {t('videos')}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-caption text-fg-muted">
        <span className="tnum">
          {t('{views} views · {posts} posts', {
            views: formatCompact(creator.views, locale),
            posts: creator.posts,
          })}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onUp}
            disabled={!onUp}
            data-move={`up:${creator.id}`}
            aria-label={t('Move {name} up', { name: creator.name })}
            className={clsx(
              s.pill,
              'flex h-7 w-7 items-center justify-center text-fg-muted disabled:opacity-30',
            )}
          >
            <ArrowIcon dir="up" />
          </button>
          <button
            type="button"
            onClick={onDown}
            disabled={!onDown}
            data-move={`down:${creator.id}`}
            aria-label={t('Move {name} down', { name: creator.name })}
            className={clsx(
              s.pill,
              'flex h-7 w-7 items-center justify-center text-fg-muted disabled:opacity-30',
            )}
          >
            <ArrowIcon dir="down" />
          </button>
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label htmlFor={handlerId} className="min-w-0">
          <span className="block text-micro uppercase tracking-[0.1em] text-fg-subtle">
            {t('Handler')}
          </span>
          <select
            id={handlerId}
            aria-describedby={nameId}
            value={creator.handlerId ?? ''}
            onChange={(e) => onHandler(e.target.value || null)}
            className={cn(s.field, 'mt-1 h-9 w-full px-2.5 text-body-sm')}
          >
            <option value="">{t('Unassigned')}</option>
            {handlers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={editorId} className="min-w-0">
          <span className="block text-micro uppercase tracking-[0.1em] text-fg-subtle">
            {t('Editor')}
          </span>
          <select
            id={editorId}
            aria-describedby={nameId}
            value={creator.editorId ?? ''}
            onChange={(e) => onEditor(e.target.value || null)}
            className={cn(s.field, 'mt-1 h-9 w-full px-2.5 text-body-sm')}
          >
            <option value="">{t('Nobody')}</option>
            {editors.length > 0 ? (
              <>
                <optgroup label={t('Editors')}>
                  {editors.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t('Handlers')}>
                  {handlers
                    .filter((m) => m.kind === 'handler')
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </optgroup>
              </>
            ) : (
              handlers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-caption text-fg-muted">
          {t('Scheduled posting')}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={creator.scheduledPosting}
          aria-label={t('Scheduled posting')}
          aria-describedby={nameId}
          onClick={onToggleScheduled}
          className={s.switch}
        />
      </div>
    </article>
  );
}
