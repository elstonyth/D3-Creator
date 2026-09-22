'use client';

/**
 * Personnel & client configuration.
 *
 * One column per person plus an "Unassigned" pool. Each card is one creator
 * account (an IP); dragging it onto a column sets who handles it. The card's
 * own controls set who edits its videos and whether it is on a posting
 * schedule — the same three facts the team keeps in their heads today, fixed
 * per account, never per video. Month output (videos / views) comes from the
 * scraped snapshots and follows the calendar's month.
 *
 * Every card also carries a handler select, because HTML5 drag-and-drop does
 * not exist on touch screens and the board is used from phones.
 */

import { useMemo, useState, type FormEvent } from 'react';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { cn } from '@gitroom/frontend/lib/utils';
import { formatCompact } from '@gitroom/frontend/lib/creator-metrics';
import { ImageWithFallback } from '@gitroom/frontend/components/ui/image-with-fallback';
import {
  PLATFORM_ICONS,
  type PlatformKey,
} from '@gitroom/frontend/components/ui/platform-icons';
import type {
  TrackerCreator,
  TrackerMember,
} from '@gitroom/frontend/lib/tracker';
import {
  addMember,
  removeMember,
  setAssignment,
  type ActionResult,
} from './actions';
import { GlassPanel } from './glass-panel';
import s from './tracker.module.scss';

const UNASSIGNED = '__unassigned__';

function platformKey(p: string): PlatformKey | null {
  if (p === 'rednote') return 'xiaohongshu';
  if (p in PLATFORM_ICONS) return p as PlatformKey;
  return null;
}

interface ColumnStats {
  accounts: number;
  videos: number;
  views: number;
  edits: number;
  editedVideos: number;
}

export function StaffingBoard({
  month,
  monthLabel,
  members: initialMembers,
  creators: initialCreators,
  onFail,
}: {
  month: string;
  monthLabel: string;
  members: TrackerMember[];
  creators: TrackerCreator[];
  onFail: (r: ActionResult, rollback: () => void) => void;
}) {
  const { t, locale } = useI18n();
  const [members, setMembers] = useState(initialMembers);
  const [creators, setCreators] = useState(initialCreators);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftRole, setDraftRole] = useState('Trader');

  const columns = useMemo(
    () => [
      ...members.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        member: m,
      })),
      { id: UNASSIGNED, name: t('Unassigned'), role: '', member: null },
    ],
    [members, t],
  );

  const stats = useMemo(() => {
    const out = new Map<string, ColumnStats>();
    for (const c of columns)
      out.set(c.id, {
        accounts: 0,
        videos: 0,
        views: 0,
        edits: 0,
        editedVideos: 0,
      });
    for (const c of creators) {
      const h = out.get(c.handlerId ?? UNASSIGNED) ?? out.get(UNASSIGNED)!;
      h.accounts += 1;
      h.videos += c.videos;
      h.views += c.views;
      if (c.editorId) {
        const e = out.get(c.editorId);
        if (e) {
          e.edits += 1;
          e.editedVideos += c.videos;
        }
      }
    }
    return out;
  }, [columns, creators]);

  function patch(creatorId: string, p: Partial<TrackerCreator>) {
    setCreators((prev) =>
      prev.map((c) => (c.id === creatorId ? { ...c, ...p } : c)),
    );
  }

  async function assignHandler(creatorId: string, handlerId: string | null) {
    const before = creators.find((c) => c.id === creatorId);
    if (!before || before.handlerId === handlerId) return;
    patch(creatorId, { handlerId });
    const r = await setAssignment(creatorId, { handlerId });
    if (!r.ok)
      onFail(r, () => patch(creatorId, { handlerId: before.handlerId }));
  }

  async function assignEditor(creatorId: string, editorId: string | null) {
    const before = creators.find((c) => c.id === creatorId);
    if (!before || before.editorId === editorId) return;
    patch(creatorId, { editorId });
    const r = await setAssignment(creatorId, { editorId });
    if (!r.ok) onFail(r, () => patch(creatorId, { editorId: before.editorId }));
  }

  async function toggleScheduled(creatorId: string) {
    const before = creators.find((c) => c.id === creatorId);
    if (!before) return;
    const next = !before.scheduledPosting;
    patch(creatorId, { scheduledPosting: next });
    const r = await setAssignment(creatorId, { scheduledPosting: next });
    if (!r.ok) onFail(r, () => patch(creatorId, { scheduledPosting: !next }));
  }

  async function submitMember(e: FormEvent) {
    e.preventDefault();
    const name = draftName.trim();
    if (!name) return;
    const role = draftRole.trim() || 'Trader';
    const tempId = `temp-${Date.now()}`;
    setMembers((p) => [...p, { id: tempId, name, role, sortOrder: p.length }]);
    setDraftName('');
    setAdding(false);
    const r = await addMember(name, role);
    if (!r.ok || !r.id) {
      onFail(r, () => setMembers((p) => p.filter((m) => m.id !== tempId)));
      return;
    }
    setMembers((p) =>
      p.map((m) => (m.id === tempId ? { ...m, id: r.id! } : m)),
    );
  }

  async function remove(member: TrackerMember) {
    if (
      !window.confirm(
        t('Remove {name}? Their accounts move to Unassigned.', {
          name: member.name,
        }),
      )
    )
      return;
    const beforeMembers = members;
    const beforeCreators = creators;
    setMembers((p) => p.filter((m) => m.id !== member.id));
    setCreators((p) =>
      p.map((c) => ({
        ...c,
        handlerId: c.handlerId === member.id ? null : c.handlerId,
        editorId: c.editorId === member.id ? null : c.editorId,
      })),
    );
    const r = await removeMember(member.id);
    if (!r.ok)
      onFail(r, () => {
        setMembers(beforeMembers);
        setCreators(beforeCreators);
      });
  }

  function dropOn(colId: string) {
    if (!dragId) return;
    const id = dragId;
    setDragId(null);
    setOverCol(null);
    void assignHandler(id, colId === UNASSIGNED ? null : colId);
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
        </div>
        {adding ? (
          <form
            onSubmit={submitMember}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={40}
              autoFocus
              placeholder={t('Name')}
              aria-label={t('Name')}
              className={cn(s.field, 'h-10 w-36 px-3 text-body-sm')}
            />
            <input
              value={draftRole}
              onChange={(e) => setDraftRole(e.target.value)}
              maxLength={40}
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
              onClick={() => setAdding(false)}
              className={cn(s.pill, 'h-10 px-4 text-label text-fg')}
            >
              {t('Cancel')}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(s.pill, 'h-10 px-4 text-label text-fg')}
          >
            {t('+ Add person')}
          </button>
        )}
      </div>

      <div className="-mx-5 overflow-x-auto px-5 pb-2 sm:-mx-6 sm:px-6">
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${columns.length}, minmax(260px, 1fr))`,
            minWidth: `${columns.length * 260 + (columns.length - 1) * 16}px`,
          }}
        >
          {columns.map((col) => {
            const st = stats.get(col.id)!;
            const cards = creators.filter(
              (c) => (c.handlerId ?? UNASSIGNED) === col.id,
            );
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
                  if (
                    !e.currentTarget.contains(e.relatedTarget as Node | null)
                  ) {
                    setOverCol((o) => (o === col.id ? null : o));
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOn(col.id);
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
                          className={cn(
                            s.pill,
                            'px-2.5 py-1 text-micro uppercase tracking-[0.1em] text-fg-muted',
                          )}
                        >
                          {col.role}
                        </span>
                        <button
                          type="button"
                          onClick={() => remove(col.member!)}
                          aria-label={t('Remove {name}', { name: col.name })}
                          className="rounded-full p-1 text-fg-subtle transition-colors hover:text-fg"
                        >
                          <svg
                            viewBox="0 0 16 16"
                            aria-hidden
                            className="h-3.5 w-3.5"
                          >
                            <path
                              d="m4 4 8 8M12 4l-8 8"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
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
                  {col.member ? (
                    <p className="mt-1.5 text-caption text-fg-subtle">
                      {t('Edits {count} accounts · {videos} videos', {
                        count: st.edits,
                        videos: st.editedVideos,
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
                    cards.map((c) => (
                      <CreatorCard
                        key={c.id}
                        creator={c}
                        members={members}
                        month={month}
                        dragging={dragId === c.id}
                        onDragStart={() => setDragId(c.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverCol(null);
                        }}
                        onHandler={(id) => assignHandler(c.id, id)}
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

function CreatorCard({
  creator,
  members,
  month,
  dragging,
  onDragStart,
  onDragEnd,
  onHandler,
  onEditor,
  onToggleScheduled,
}: {
  creator: TrackerCreator;
  members: TrackerMember[];
  month: string;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
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
      className={cn(
        s.inset,
        s.insetHover,
        'cursor-grab select-none p-3 active:cursor-grabbing',
        dragging && s.dragging,
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
        <span className="text-fg-subtle">{month}</span>
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
            {members.map((m) => (
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
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
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
