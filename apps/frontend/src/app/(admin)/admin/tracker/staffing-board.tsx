'use client';

/**
 * Personnel & client configuration.
 *
 * One column per handler plus an "Unassigned" pool. Editors are not columns:
 * they sit in a row of chips under the header and are offered in every
 * card's Editor select next to the handlers. Someone who does both jobs has
 * a column and is offered with the editors. Each card is one creator
 * account (an IP); dragging it onto a column sets who handles it. The card's
 * own controls set who edits its videos and whether it is on a posting
 * schedule — the same three facts the team keeps in their heads today, fixed
 * per account, never per video. Month output (videos / views) comes from the
 * scraped snapshots and follows the calendar's month.
 *
 * Dropping a card on another card puts it in front of that card, so the
 * order inside a column is the team's to set. Every card also carries a
 * handler select and up/down arrows, because HTML5 drag-and-drop does not
 * exist on touch screens and the board is used from phones.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type FormEvent,
  type SetStateAction,
} from 'react';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { cn } from '@gitroom/frontend/lib/utils';
// clsx where a custom font-size token sits next to a text colour (see
// work-tracker.tsx): tailwind-merge would drop the size.
import clsx from 'clsx';
import { formatCompact } from '@gitroom/frontend/lib/creator-metrics';
import { ImageWithFallback } from '@gitroom/frontend/components/ui/image-with-fallback';
import {
  PLATFORM_ICONS,
  type PlatformKey,
} from '@gitroom/frontend/components/ui/platform-icons';
import {
  placeCard,
  placementChanges,
  restorePlacement,
  type MemberKind,
  type TrackerCreator,
  type TrackerMember,
} from '@gitroom/frontend/lib/tracker';
import {
  addMember,
  placeCards,
  removeMember,
  setAssignment,
  type ActionResult,
} from './actions';
import { ConfirmRemove } from './confirm-remove';
import { GlassPanel } from './glass-panel';
import { safeCall } from './safe-call';
import s from './tracker.module.scss';

const UNASSIGNED = '__unassigned__';

function platformKey(p: string): PlatformKey | null {
  if (p === 'rednote') return 'xiaohongshu';
  if (p in PLATFORM_ICONS) return p as PlatformKey;
  return null;
}

interface HandledStats {
  accounts: number;
  videos: number;
  views: number;
}

interface EditedStats {
  edits: number;
  editedVideos: number;
}

export function StaffingBoard({
  monthLabel,
  members,
  setMembers,
  creators: initialCreators,
  onFail,
}: {
  monthLabel: string;
  /** The board's people. Held by the page, which shares them with the task
   *  list, so someone added or removed here is offered (or not) there too. */
  members: TrackerMember[];
  setMembers: Dispatch<SetStateAction<TrackerMember[]>>;
  creators: TrackerCreator[];
  onFail: (r: ActionResult, rollback: () => void) => void;
}) {
  const { t, locale } = useI18n();
  const [creators, setCreators] = useState(initialCreators);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  // The card a dragged card would land in front of.
  const [overCard, setOverCard] = useState<string | null>(null);
  // Which add form is open: a handler's sits in the header, an editor's in
  // the editor row.
  const [adding, setAdding] = useState<MemberKind | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftRole, setDraftRole] = useState('Trader');
  // The person whose × was clicked; their column (or, for an editor, the
  // editor row) shows an inline confirmation.
  // Not `window.confirm`: embedded browsers auto-dismiss native dialogs (the
  // Claude desktop pane returns false in 1 ms), which made the button a no-op.
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

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
      ...handlers.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        member: m,
      })),
      { id: UNASSIGNED, name: t('Unassigned'), role: '', member: null },
    ],
    [handlers, t],
  );

  const columnIds = useMemo(
    () => new Set(handlers.map((m) => m.id)),
    [handlers],
  );

  // The column a card sits in. A handler id that is not a column (a person
  // since removed, or an editor) reads as unassigned rather than vanishing.
  const columnOf = useCallback(
    (c: TrackerCreator) =>
      c.handlerId !== null && columnIds.has(c.handlerId)
        ? c.handlerId
        : UNASSIGNED,
    [columnIds],
  );

  // Card placement (column + order) saves one at a time, always from the
  // newest board, like the remarks pad: quick moves queue behind the save in
  // flight instead of racing it. A failed save puts back the placement the
  // server last accepted — never a per-move snapshot, which two overlapping
  // moves would interleave.
  const latest = useRef(initialCreators);
  const confirmed = useRef(initialCreators);
  const saving = useRef(false);
  // The columns as they are now: a save queued behind another must see a
  // column added in between.
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
          onFail(r, () =>
            setCreators((p) => restorePlacement(p, confirmed.current)),
          );
          return;
        }
      }
      confirmed.current = now;
      saving.current = false;
      if (latest.current !== now) void run();
    },
    [onFail],
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

  function patch(creatorId: string, p: Partial<TrackerCreator>) {
    setCreators((prev) =>
      prev.map((c) => (c.id === creatorId ? { ...c, ...p } : c)),
    );
  }

  // A person still waiting for their server id cannot be assigned yet.
  const isTemp = (id: string | null) => id !== null && id.startsWith('temp-');

  // Rollbacks undo only the value this call set, and only if it is still in
  // place — a later edit to the same card must not be reverted with it.
  async function assignEditor(creatorId: string, editorId: string | null) {
    const before = creators.find((c) => c.id === creatorId);
    if (!before || before.editorId === editorId || isTemp(editorId)) return;
    patch(creatorId, { editorId });
    const r = await safeCall(() => setAssignment(creatorId, { editorId }));
    if (!r.ok)
      onFail(r, () =>
        setCreators((p) =>
          p.map((c) =>
            c.id === creatorId && c.editorId === editorId
              ? { ...c, editorId: before.editorId }
              : c,
          ),
        ),
      );
  }

  async function toggleScheduled(creatorId: string) {
    const before = creators.find((c) => c.id === creatorId);
    if (!before) return;
    const next = !before.scheduledPosting;
    patch(creatorId, { scheduledPosting: next });
    const r = await safeCall(() =>
      setAssignment(creatorId, { scheduledPosting: next }),
    );
    if (!r.ok)
      onFail(r, () =>
        setCreators((p) =>
          p.map((c) =>
            c.id === creatorId && c.scheduledPosting === next
              ? { ...c, scheduledPosting: !next }
              : c,
          ),
        ),
      );
  }

  function openAdd(kind: MemberKind) {
    setDraftName('');
    setDraftRole('Trader');
    setAdding(kind);
  }

  async function submitMember(e: FormEvent) {
    e.preventDefault();
    const kind = adding;
    const name = draftName.trim();
    if (!kind || !name) return;
    const role = kind === 'editor' ? 'Editor' : draftRole.trim() || 'Trader';
    const tempId = `temp-${Date.now()}`;
    setMembers((p) => [
      ...p,
      { id: tempId, name, role, kind, sortOrder: p.length },
    ]);
    setDraftName('');
    setAdding(null);
    const r = await safeCall(() => addMember(name, role, kind));
    if (!r.ok || !r.id) {
      onFail(r, () => setMembers((p) => p.filter((m) => m.id !== tempId)));
      return;
    }
    setMembers((p) =>
      p.map((m) => (m.id === tempId ? { ...m, id: r.id! } : m)),
    );
  }

  async function remove(member: TrackerMember) {
    setConfirmRemoveId(null);
    if (isTemp(member.id)) return;
    const beforeCreators = creators;
    setMembers((p) => p.filter((m) => m.id !== member.id));
    setCreators((p) =>
      p.map((c) => ({
        ...c,
        handlerId: c.handlerId === member.id ? null : c.handlerId,
        editorId: c.editorId === member.id ? null : c.editorId,
      })),
    );
    const r = await safeCall(() => removeMember(member.id));
    if (!r.ok)
      onFail(r, () => {
        setMembers((p) =>
          p.some((m) => m.id === member.id) ? p : [...p, member],
        );
        // Re-attach the person only where the slot is still empty.
        setCreators((p) =>
          p.map((c) => {
            const b = beforeCreators.find((x) => x.id === c.id);
            if (!b) return c;
            return {
              ...c,
              handlerId:
                b.handlerId === member.id && c.handlerId === null
                  ? member.id
                  : c.handlerId,
              editorId:
                b.editorId === member.id && c.editorId === null
                  ? member.id
                  : c.editorId,
            };
          }),
        );
      });
  }

  // Card `id` goes into column `colId` in front of `beforeId` (last when
  // null). The save follows on its own (flushPlacement).
  function place(id: string, colId: string, beforeId: string | null) {
    const handlerId = colId === UNASSIGNED ? null : colId;
    if (isTemp(handlerId)) return;
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

  return (
    <GlassPanel className="p-5 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-heading text-fg">
            {t('Personnel & client configuration')}
          </h2>
          <p className="mt-1 text-body-sm text-fg-muted">
            {t(
              'Drag an account onto a person to hand it over. Output is for {month}.',
              {
                month: monthLabel,
              },
            )}
          </p>
          <p className="mt-1 text-caption text-fg-subtle">
            {t(
              'Videos = different videos posted in {month}. The same clip on several platforms counts once.',
              { month: monthLabel },
            )}
          </p>
        </div>
        {adding === 'handler' ? (
          <form
            onSubmit={submitMember}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={40}
              autoFocus
              autoComplete="off"
              placeholder={t('Name')}
              aria-label={t('Name')}
              className={cn(s.field, 'h-10 w-36 px-3 text-body-sm')}
            />
            <input
              value={draftRole}
              onChange={(e) => setDraftRole(e.target.value)}
              maxLength={40}
              autoComplete="off"
              placeholder={t('Role')}
              aria-label={t('Role')}
              className={cn(s.field, 'h-10 w-28 px-3 text-body-sm')}
            />
            <button
              type="submit"
              disabled={!draftName.trim()}
              className={cn(
                s.pill,
                s.pillBrand,
                'h-10 px-4 text-label disabled:opacity-40',
              )}
            >
              {t('Add')}
            </button>
            <button
              type="button"
              onClick={() => setAdding(null)}
              className={clsx(s.pill, 'h-10 px-4 text-label')}
            >
              {t('Cancel')}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => openAdd('handler')}
            className={clsx(s.pill, 'h-10 px-4 text-label')}
          >
            {t('+ Add handler')}
          </button>
        )}
      </div>

      {/* Editors: people who cut video but run no accounts. */}
      <section
        aria-label={t('Editors')}
        className="mb-5 flex flex-wrap items-center gap-2"
      >
        <span className="mr-1 text-micro uppercase tracking-[0.14em] text-fg-subtle">
          {t('Editors')}
        </span>
        {editors.length === 0 && adding !== 'editor' ? (
          <span className="text-caption text-fg-subtle">
            {t('No editors yet.')}
          </span>
        ) : null}
        {editors.map((m) => {
          const st = stats.edited.get(m.id)!;
          return (
            <span
              key={m.id}
              className={clsx(
                s.pill,
                'flex items-center gap-2 py-1 pl-3 pr-1 text-caption text-fg',
              )}
            >
              <span className="text-label">{m.name}</span>
              <span className="text-fg-subtle">
                {st.edits === 1
                  ? t('Edits 1 account · {videos} videos', {
                      videos: st.editedVideos,
                    })
                  : t('Edits {count} accounts · {videos} videos', {
                      count: st.edits,
                      videos: st.editedVideos,
                    })}
              </span>
              <button
                type="button"
                disabled={isTemp(m.id)}
                onClick={() => setConfirmRemoveId(m.id)}
                aria-label={t('Remove {name}', { name: m.name })}
                className="rounded-full p-1 text-fg-subtle transition-colors hover:text-fg"
              >
                <CrossIcon />
              </button>
            </span>
          );
        })}
        {adding === 'editor' ? (
          <form
            onSubmit={submitMember}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={40}
              autoFocus
              autoComplete="off"
              placeholder={t('Name')}
              aria-label={t('Name')}
              className={cn(s.field, 'h-9 w-36 px-3 text-body-sm')}
            />
            <button
              type="submit"
              disabled={!draftName.trim()}
              className={cn(
                s.pill,
                s.pillBrand,
                'h-9 px-4 text-label disabled:opacity-40',
              )}
            >
              {t('Add')}
            </button>
            <button
              type="button"
              onClick={() => setAdding(null)}
              className={clsx(s.pill, 'h-9 px-4 text-label')}
            >
              {t('Cancel')}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => openAdd('editor')}
            className={clsx(s.pill, 'h-9 px-4 text-label')}
          >
            {t('+ Add editor')}
          </button>
        )}
        {editors.map((m) =>
          confirmRemoveId === m.id ? (
            <ConfirmRemove
              key={m.id}
              name={m.name}
              message={t(
                'Remove {name}? Accounts they edit go back to Nobody, their open tasks lose their assignee, and their staff login stops working. Their history is kept.',
                { name: m.name },
              )}
              onConfirm={() => remove(m)}
              onCancel={() => setConfirmRemoveId(null)}
              className="basis-full"
            />
          ) : null,
        )}
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
              aria-label={col.name}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (overCol !== col.id) setOverCol(col.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setOverCol((o) => (o === col.id ? null : o));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropOn(col.id, null);
              }}
              className={cn(
                s.inset,
                'flex min-h-[240px] flex-col p-3 transition-colors',
                isOver && s.dropTarget,
              )}
            >
              <header className="mb-3 px-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-subsection text-fg">
                    {col.name}
                  </h3>
                  {col.member ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={clsx(
                          s.pill,
                          'px-2.5 py-1 text-micro uppercase tracking-[0.1em] text-fg-muted',
                        )}
                      >
                        {col.role}
                      </span>
                      <button
                        type="button"
                        // Until addMember returns the real id there is nothing
                        // to remove, so the control waits rather than offering
                        // a Remove that would do nothing.
                        disabled={isTemp(col.member!.id)}
                        onClick={() => setConfirmRemoveId(col.member!.id)}
                        aria-label={t('Remove {name}', { name: col.name })}
                        className="rounded-full p-1 text-fg-subtle transition-colors hover:text-fg"
                      >
                        <CrossIcon />
                      </button>
                    </div>
                  ) : null}
                </div>
                {col.member && confirmRemoveId === col.member.id ? (
                  <ConfirmRemove
                    name={col.name}
                    message={t(
                      'Remove {name}? Their accounts move to Unassigned, their open tasks lose their assignee, and their staff login stops working. Their history is kept.',
                      { name: col.name },
                    )}
                    onConfirm={() => remove(col.member!)}
                    onCancel={() => setConfirmRemoveId(null)}
                    className="mt-2"
                  />
                ) : null}
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
                    {ed.edits === 1
                      ? t('Edits 1 account · {videos} videos', {
                          videos: ed.editedVideos,
                        })
                      : t('Edits {count} accounts · {videos} videos', {
                          count: ed.edits,
                          videos: ed.editedVideos,
                        })}
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
                        overCard === c.id && dragId !== null && dragId !== c.id
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

function CrossIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5">
      <path
        d="m4 4 8 8M12 4l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
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
  creator: TrackerCreator;
  handlers: TrackerMember[];
  /** Everyone who cuts video: editors, and people who do both. */
  editors: TrackerMember[];
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
          <p className="truncate text-label text-fg">{creator.name}</p>
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
          onClick={onToggleScheduled}
          className={s.switch}
        />
      </div>
    </article>
  );
}
