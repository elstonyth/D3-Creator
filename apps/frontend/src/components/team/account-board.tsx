'use client';

/**
 * The account board on the admin's Work Tracker: who handles each creator
 * account and who edits its videos.
 *
 * Who handles an account is the admin's to set, once, when a new client
 * comes in: drag its card onto a person's column — with a mouse anywhere on
 * the card, with a finger by its grip (use-drag.tsx). A card dropped between
 * two others lands there: the order of each column is the admin's too.
 * Staff work never moves a card. For the keyboard, each card has a Handler
 * select that shows only when tabbed to (there is no keyboard reorder). The
 * editor is the staff's to choose — passing a shoot's videos on sets it
 * (lib/team/claim-account.ts) — so it only shows here. Without `onPlace` the
 * board is read-only.
 *
 * The order of the columns is the admin's too: a column dragged by its
 * name (a finger: by its grip) and dropped on another takes that one's
 * place. Unassigned stays last. It is the order of people everywhere.
 *
 * One column per person who runs accounts (a handler, or someone who does
 * both) plus "Unassigned". Editors are not columns: they sit in a row of
 * chips under the header with what they edit. Month output (videos / views)
 * comes from the scraped snapshots, Instagram videos only (the owner's call:
 * summed across platforms it did not add up), and follows the calendar's
 * month. An account with no working Instagram shows a dash, not a zero, and
 * each card dims the platforms its numbers leave out.
 */

import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';
import { useRouter } from 'next/navigation';
import { GripVertical } from 'lucide-react';
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
import {
  orderWith,
  slotBefore,
  type AccountCard,
} from '@gitroom/frontend/lib/team/accounts';
import { GlassPanel } from './glass-panel';
import { useDrag } from './use-drag';
import s from './tracker.module.scss';

const UNASSIGNED = '__unassigned__';

interface Person {
  id: string;
  name: string;
  kind: MemberKind;
  archived: boolean;
}

/** A column's new order after a drop, and the card that changed column. */
export type PlaceAccount = (
  order: string[],
  move?: { creatorId: string; handlerId: string | null } | null,
) => Promise<{ ok: boolean; message?: string }>;

/** Everyone on the board, in their new order, after a column is dropped. */
export type OrderPeople = (
  order: string[],
) => Promise<{ ok: boolean; message?: string }>;

/** Where a dragged card would land: its column, before which card. */
type Slot = { col: string; before: string | null };

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
  people: initialPeople,
  accounts: initialAccounts,
  onPlace,
  onOrder,
}: {
  monthLabel: string;
  /** Everyone who is or was on the board; only those still on it get a place. */
  people: Person[];
  accounts: AccountCard[];
  /** The admin's drop: a column's new order, and a handover if any. */
  onPlace?: PlaceAccount;
  /** The admin's drop of a column: everyone, in their new order. */
  onOrder?: OrderPeople;
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
  // …and the same for the order of the people.
  const [people, setPeople] = useState(initialPeople);
  const [peopleFromServer, setPeopleFromServer] = useState(initialPeople);
  if (peopleFromServer !== initialPeople) {
    setPeopleFromServer(initialPeople);
    setPeople(initialPeople);
  }
  // One drop at a time: a second can't land before a refused first is put
  // back.
  const [busy, setBusy] = useState(false);
  // Where the dragged card would land; the ref is what a drop reads, since
  // it can come before the render that shows it.
  const [slot, setSlot] = useState<Slot | null>(null);
  const slotRef = useRef<Slot | null>(null);
  // The card whose Handler select was just used: it moves column, which
  // remounts it, so focus is put back on it there — once the save is done,
  // as the select is disabled until then.
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    const id = refocus.current;
    if (!id || busy) return;
    refocus.current = null;
    document.querySelector<HTMLSelectElement>(`[data-pick="${id}"]`)?.focus();
  });
  // What the last drop did, or why it was refused.
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

  /**
   * One drop, shown at once, then saved. If the save is refused, it is put
   * back as it was — unless a refresh since has brought newer — and the
   * notice says why. True once saved.
   */
  async function saveDrop<T>(
    set: Dispatch<SetStateAction<T>>,
    prior: T,
    after: T,
    call: () => Promise<{ ok: boolean; message?: string }>,
  ): Promise<boolean> {
    set(after);
    setBusy(true);
    let r: { ok: boolean; message?: string };
    try {
      r = await call();
    } catch {
      // A dropped connection or a stale deploy: a refusal, not a stuck card.
      r = { ok: false, message: 'Could not save. Try again.' };
    } finally {
      setBusy(false);
    }
    if (r.ok) return true;
    set((cur) => (cur === after ? prior : cur));
    setNotice({
      id: Date.now(),
      text: t(r.message ?? 'Could not save. Try again.'),
    });
    return false;
  }

  /** Put `id` in column `col`, before `before` (null = at the end). */
  async function place(id: string, col: string, before: string | null) {
    const card = accounts.find((c) => c.id === id);
    if (!onPlace || busy || !card) return;
    const was = accounts.filter((c) => columnOf(c) === col).map((c) => c.id);
    const order = orderWith(was, id, before);
    const moving = columnOf(card) !== col;
    if (!moving && order.join() === was.join()) return;
    const handlerId = col === UNASSIGNED ? null : col;
    const byId = new Map(accounts.map((c) => [c.id, c]));
    const after = [
      ...accounts.filter((c) => !order.includes(c.id)),
      ...order.map((cid, i) => ({
        ...byId.get(cid)!,
        sortOrder: i,
        ...(cid === id ? { handlerId } : {}),
      })),
    ];
    const save = onPlace;
    const saved = await saveDrop(setAccounts, accounts, after, () =>
      save(order, moving ? { creatorId: id, handlerId } : null),
    );
    if (!saved) return;
    if (moving)
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

  const drag = useDrag({
    accepts: (_id, key) => !!onPlace && !busy && key.startsWith('col:'),
    onOver: (id, over, y) => {
      let next: Slot | null = null;
      if (over) {
        // The column's other cards, where they are on screen right now.
        const cards = Array.from(
          over.el.querySelectorAll<HTMLElement>('[data-card]'),
        )
          .filter((n) => n.dataset.card !== id)
          .map((n) => {
            const r = n.getBoundingClientRect();
            return { id: n.dataset.card!, top: r.top, bottom: r.bottom };
          });
        next = { col: over.key.slice(4), before: slotBefore(y, cards) };
      }
      const cur = slotRef.current;
      if (cur?.col === next?.col && cur?.before === next?.before) return;
      slotRef.current = next;
      setSlot(next);
    },
    onDrop: (id, key) => {
      const col = key.slice(4);
      const at = slotRef.current;
      slotRef.current = null;
      setSlot(null);
      void place(id, col, at?.col === col ? at.before : null);
    },
  });
  // A cancelled drag leaves no line behind.
  const line = drag.dragId ? slot : null;

  /** Put column `id` where column `onto` is; the ones between shift over. */
  async function reorder(id: string, onto: string) {
    if (!onOrder || busy) return;
    const cols = handlers.map((m) => m.id);
    const rest = people.filter((p) => p.id !== id);
    // Moving right lands after `onto`, not before: its place, not beside it.
    const at =
      rest.findIndex((p) => p.id === onto) +
      (cols.indexOf(id) < cols.indexOf(onto) ? 1 : 0);
    const after = [
      ...rest.slice(0, at),
      people.find((p) => p.id === id)!,
      ...rest.slice(at),
    ];
    const save = onOrder;
    if (
      await saveDrop(setPeople, people, after, () =>
        save(after.map((p) => p.id)),
      )
    )
      router.refresh();
  }

  const colDrag = useDrag({
    // Another person's column only: never Unassigned, never its own.
    accepts: (id, key) =>
      !!onOrder && !busy && key.slice(4) !== id && columnIds.has(key.slice(4)),
    onDrop: (id, key) => void reorder(id, key.slice(4)),
  });

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
      ? t('Edits 1 account · {videos} IG videos', { videos: st.editedVideos })
      : t('Edits {count} accounts · {videos} IG videos', {
          count: st.edits,
          videos: st.editedVideos,
        });

  const insertLine = <li aria-hidden className="h-0.5 rounded-full bg-brand" />;

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
          {onPlace ? (
            <p className="mt-1 text-body-sm text-fg-muted">
              {t(
                'Drag an account onto the person who handles it, and up or down to set the order. Editors follow what staff choose when they pass videos on.',
              )}
            </p>
          ) : null}
          {onOrder ? (
            <p className="mt-1 text-body-sm text-fg-muted">
              {t(
                'Drag a person by their name onto another column to change the order of the columns.',
              )}
            </p>
          ) : null}
          <p className="mt-1 text-caption text-fg-subtle">
            {t(
              'Videos and views count Instagram videos posted in {month} only.',
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
            const lineHere = line?.col === col.id ? line : null;
            // A person's column moves by its header; Unassigned stays last.
            const orderable = !!onOrder && col.member !== null;
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
                data-drop={onPlace || onOrder ? `col:${col.id}` : undefined}
                className={cn(
                  s.inset,
                  s.dropZone,
                  'flex min-w-0 flex-col p-3',
                  colDrag.dragId === col.id && 'opacity-40',
                )}
              >
                <header
                  onPointerDown={
                    orderable
                      ? (e) => {
                          if (!busy) colDrag.start(col.id, e);
                        }
                      : undefined
                  }
                  className={cn(
                    'mb-3 px-1',
                    orderable && 'cursor-grab active:cursor-grabbing',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1">
                      {orderable ? (
                        // The grip: where a finger picks the column up.
                        <span
                          data-drag-handle
                          title={t('Drag to move')}
                          className="-ml-1 flex h-8 w-5 shrink-0 touch-none items-center justify-center text-fg-subtle"
                        >
                          <GripVertical size={16} aria-hidden />
                        </span>
                      ) : null}
                      <h3 className="min-w-0 break-words text-subsection text-fg">
                        {col.name}
                      </h3>
                    </div>
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
                      label={t('IG videos')}
                      value={formatCompact(
                        cards.reduce((n, c) => n + c.videos, 0),
                        locale,
                      )}
                    />
                    <Stat
                      label={t('IG views')}
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
                      <Fragment key={c.id}>
                        {lineHere?.before === c.id ? insertLine : null}
                        <AccountItem
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
                          movable={!!onPlace}
                          busy={busy}
                          dragging={drag.dragId === c.id}
                          onPointerDown={(e) => {
                            if (onPlace && !busy) drag.start(c.id, e);
                          }}
                          onPick={(to) => {
                            refocus.current = c.id;
                            void place(c.id, to, null);
                          }}
                        />
                      </Fragment>
                    ))}
                    {lineHere && lineHere.before === null ? insertLine : null}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </section>
      {drag.ghostOf(accounts.find((c) => c.id === drag.dragId)?.name)}
      {colDrag.ghostOf(columns.find((c) => c.id === colDrag.dragId)?.name)}
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
  onPointerDown,
  onPick,
}: {
  account: AccountCard;
  handler: string | null;
  editor: string | null;
  /** The column it sits in: a handler's id, or Unassigned. */
  column: string;
  /** Who can be picked to handle it. */
  handlers: { id: string; name: string }[];
  movable: boolean;
  /** A drop is being saved. */
  busy: boolean;
  dragging: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPick: (column: string) => void;
}) {
  const { t, locale } = useI18n();
  const pickId = useId();

  return (
    <li
      data-card={c.id}
      onPointerDown={movable ? onPointerDown : undefined}
      className={cn(
        s.inset,
        'p-3',
        movable && 'cursor-grab active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-center gap-3">
        {movable ? (
          // The grip: where a finger picks the card up (the page scrolls
          // under a finger anywhere else).
          <span
            data-drag-handle
            title={t('Drag to move')}
            className="-ml-1 flex h-10 w-6 shrink-0 touch-none items-center justify-center text-fg-subtle"
          >
            <GripVertical size={16} aria-hidden />
          </span>
        ) : null}
        <ImageWithFallback
          src={c.avatarUrl}
          alt=""
          className="pointer-events-none h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-white/15"
          fallback={
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-label text-fg ring-1 ring-white/15">
              {c.name.slice(0, 1).toUpperCase()}
            </span>
          }
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-label text-fg">{c.name}</p>
          {/* Wraps in a narrow column rather than running under the count. */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-fg-muted">
            {c.platforms.map((p) => {
              const key = platformKey(p);
              if (!key) return null;
              const Icon = PLATFORM_ICONS[key];
              // The icons are aria-hidden by default; these carry meaning.
              // Dimmed: the numbers count Instagram only.
              return (
                <Icon
                  key={p}
                  size={12}
                  className={cn('shrink-0', p !== 'instagram' && 'opacity-40')}
                  role="img"
                  aria-hidden={false}
                  aria-label={PLATFORM_LABELS[key]}
                />
              );
            })}
          </div>
        </div>
        <div className="text-right">
          <p className="text-heading tnum leading-none text-fg">
            {/* No working Instagram: nothing to count, not a quiet month. */}
            {c.igLive ? c.videos : '—'}
          </p>
          {/* Short: a longer label squeezes the account's name. The line
              below and the column say it is Instagram. */}
          <p className="mt-1 text-micro uppercase tracking-[0.1em] text-fg-subtle">
            {t('videos')}
          </p>
        </div>
      </div>

      <p className="mt-3 text-caption tnum text-fg-muted">
        {c.igLive
          ? t('{views} IG views', { views: formatCompact(c.views, locale) })
          : t('No working Instagram account')}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        <Who label={t('Handler')} name={handler ?? t('Unassigned')} />
        <Who label={t('Editor')} name={editor ?? t('Nobody')} />
      </dl>

      {movable ? (
        // For the keyboard: hidden until tabbed to (drag is pointer-only).
        <div className="sr-only focus-within:not-sr-only focus-within:mt-3 focus-within:block">
          <label
            htmlFor={pickId}
            className="text-micro uppercase tracking-[0.1em] text-fg-subtle"
          >
            {t('Handler')}
          </label>
          <Select
            id={pickId}
            data-pick={c.id}
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
      ) : null}
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
