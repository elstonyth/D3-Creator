'use client';

/**
 * Video jobs, grouped by where each one is: with its editor, ready to post,
 * or done this month. The admin sees and changes every job and gives out new
 * ones; a staff member sees the jobs they edit or post and moves only their
 * own step — Done with a link, or taking it back.
 *
 * Saves wait for the server (each is one small write). A refusal is shown on
 * the job it belongs to, with its step still open.
 */

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { dateKeyAt } from '@gitroom/frontend/lib/tracker';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Pill } from './pill';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Field, Input, Select } from '@gitroom/frontend/components/ui/input';
import {
  posterOf,
  safeHref,
  videoStage,
  type Video,
  type VideoStage,
} from '@gitroom/frontend/lib/team/videos';
import {
  createVideo,
  deleteVideo,
  finishEdit,
  finishPost,
  schedulePost,
  undoEdit,
  undoPost,
  updateVideo,
  type VideoResult,
} from '@gitroom/frontend/lib/team/video-actions';
import { VideoForm, videoDraftOf, type VideoDraft } from './video-form';

interface Person {
  id: string;
  name: string;
  kind: 'handler' | 'editor';
  archived: boolean;
}

export interface VideoBoardProps {
  videos: Video[];
  people: Person[];
  accounts: { id: string; name: string }[];
  /** The staff member's own person; null when an admin is looking. */
  meId: string | null;
  /** Admin only: today's staffing board, to fill in a new job's people. */
  assignments?: Record<
    string,
    { handlerId: string | null; editorId: string | null }
  >;
}

type Step = 'edit' | 'editDone' | 'schedule' | 'postDone' | 'delete';
type Open = { kind: 'new' } | { kind: Step; id: string } | null;

const STAGES: VideoStage[] = ['editing', 'posting', 'done'];

function fmtDay(key: string, tag: 'en' | 'zh-CN'): string {
  return new Intl.DateTimeFormat(tag, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${key}T00:00:00Z`));
}

export function VideoBoard({
  videos: initialVideos,
  people,
  accounts,
  meId,
  assignments = {},
}: VideoBoardProps) {
  const { t, locale } = useI18n();
  const tag = localeTag(locale);
  const isAdmin = meId === null;
  const [videos, setVideos] = useState(initialVideos);
  const [open, setOpen] = useState<Open>(null);
  const [saving, setSaving] = useState(false);
  // A refusal, and the job ('new' for the new-job form) it belongs to.
  const [error, setError] = useState<{ at: string; text: string } | null>(null);
  // Admin filter: 'all', or a person (as editor or handler).
  const [person, setPerson] = useState('all');

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const accountOf = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );
  const onBoard = people.filter((p) => !p.archived);
  const editorPicks = [
    ...onBoard.filter((p) => p.kind === 'editor'),
    ...onBoard.filter((p) => p.kind === 'handler'),
  ];
  const handlerPicks = [
    ...onBoard.filter((p) => p.kind === 'handler'),
    ...onBoard.filter((p) => p.kind === 'editor'),
  ];
  const left = (name: string) => t('{name} (left)', { name });
  const nameOf = (id: string | null): string | null => {
    if (!id) return null;
    if (id === meId) return t('You');
    const p = byId.get(id);
    if (!p) return '—';
    return p.archived ? left(p.name) : p.name;
  };
  // A job may still name someone who has left; keep them pickable on it.
  const withCurrent = (list: Person[], id: string | null) => {
    const p = id ? byId.get(id) : undefined;
    return !p || list.some((x) => x.id === p.id)
      ? list
      : [...list, { ...p, name: left(p.name) }];
  };

  const shown = videos.filter(
    (v) => person === 'all' || v.editorId === person || v.handlerId === person,
  );
  const byStage = (stage: VideoStage) => {
    const list = shown.filter((v) => videoStage(v) === stage);
    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    // Soonest out first, not yet scheduled last; finished newest first.
    if (stage === 'posting')
      list.sort((a, b) =>
        cmp(
          `${a.postDate ?? '9999-12-31'} ${a.postTime ?? '99:99'}`,
          `${b.postDate ?? '9999-12-31'} ${b.postTime ?? '99:99'}`,
        ),
      );
    if (stage === 'done')
      list.sort((a, b) => cmp(b.postedAt ?? '', a.postedAt ?? ''));
    return list;
  };

  /**
   * One save. `started` is the form it came from: only that form closes when
   * it succeeds, so a slow one-click step never closes a form opened since.
   */
  async function save(
    at: string,
    call: () => Promise<VideoResult>,
    apply: (r: VideoResult) => void,
    started: Open = null,
  ) {
    setSaving(true);
    setError(null);
    const r = await call();
    setSaving(false);
    if (!r.ok) {
      setError({ at, text: r.message ?? 'Could not save. Try again.' });
      return;
    }
    apply(r);
    if (started) setOpen((cur) => (cur === started ? null : cur));
  }
  const replace = (r: VideoResult) =>
    setVideos((p) => p.map((x) => (x.id === r.video!.id ? r.video! : x)));
  const draftInput = (d: VideoDraft) => ({ ...d });
  const errorAt = (at: string) => (error?.at === at ? t(error.text) : null);
  const close = () => {
    setOpen(null);
    setError(null);
  };

  const title = {
    editing: t('Being edited'),
    posting: t('Ready to post'),
    done: t('Done this month'),
  } as const;
  const empty = {
    editing: t('Nothing waiting on an edit.'),
    posting: t('Nothing waiting to go out.'),
    done: t('Nothing finished yet this month.'),
  } as const;

  return (
    <div className="space-y-5">
      {isAdmin ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:w-56">
            <label htmlFor="videos-person" className="sr-only">
              {t('Show whose videos')}
            </label>
            <Select
              id="videos-person"
              value={person}
              onChange={(e) => setPerson(e.target.value)}
            >
              <option value="all">{t('Everyone')}</option>
              {onBoard.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          {open?.kind === 'new' ? null : (
            <Button
              // One yellow per view: an open form's own submit has it then.
              variant={open ? 'secondary' : 'primary'}
              onClick={() => {
                setError(null);
                setOpen({ kind: 'new' });
              }}
            >
              {t('+ New video')}
            </Button>
          )}
        </div>
      ) : null}

      {isAdmin && open?.kind === 'new' ? (
        <VideoForm
          initial={videoDraftOf(null)}
          accounts={accounts}
          editors={editorPicks}
          handlers={handlerPicks}
          assignments={assignments}
          saving={saving}
          error={errorAt('new')}
          onSave={(d) =>
            save(
              'new',
              () => createVideo(draftInput(d)),
              (r) => setVideos((p) => [r.video!, ...p]),
              open,
            )
          }
          onCancel={close}
        />
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-3">
        {STAGES.map((stage) => {
          const list = byStage(stage);
          return (
            <section key={stage} aria-label={title[stage]} className="min-w-0">
              <h2 className="mb-3 flex items-baseline justify-between gap-2 text-heading text-fg">
                {title[stage]}
                <span className="text-caption tnum text-fg-subtle">
                  {list.length}
                </span>
              </h2>
              {list.length === 0 ? (
                <p className="rounded-2xl border border-line bg-surface p-4 text-body-sm text-fg-muted">
                  {empty[stage]}
                </p>
              ) : (
                <ul className="space-y-3">
                  {list.map((v) =>
                    isAdmin && open?.kind === 'edit' && open.id === v.id ? (
                      <li key={v.id}>
                        <VideoForm
                          initial={videoDraftOf(v)}
                          accounts={accounts}
                          editors={withCurrent(editorPicks, v.editorId)}
                          handlers={withCurrent(handlerPicks, v.handlerId)}
                          assignments={assignments}
                          saving={saving}
                          error={errorAt(v.id)}
                          onSave={(d) =>
                            save(
                              v.id,
                              () => updateVideo(v.id, draftInput(d)),
                              replace,
                              open,
                            )
                          }
                          onCancel={close}
                        />
                      </li>
                    ) : (
                      <VideoCard
                        key={v.id}
                        video={v}
                        account={
                          v.creatorId
                            ? (accountOf.get(v.creatorId) ?? '—')
                            : '—'
                        }
                        // A finished step names who it counts for.
                        editor={nameOf(
                          v.editedAt ? (v.editedBy ?? v.editorId) : v.editorId,
                        )}
                        handler={nameOf(
                          v.postedAt
                            ? (v.postedBy ?? v.handlerId)
                            : v.handlerId,
                        )}
                        canEdit={isAdmin || v.editorId === meId}
                        canPost={isAdmin || posterOf(v) === meId}
                        canUndoEdit={isAdmin || v.editedBy === meId}
                        canUndoPost={isAdmin || v.postedBy === meId}
                        isAdmin={isAdmin}
                        tag={tag}
                        open={
                          open && 'id' in open && open.id === v.id
                            ? open.kind
                            : null
                        }
                        saving={saving}
                        error={errorAt(v.id)}
                        onOpen={(kind) => {
                          setError(null);
                          setOpen({ kind, id: v.id });
                        }}
                        onClose={close}
                        onEditDone={(link) =>
                          save(
                            v.id,
                            () => finishEdit(v.id, link),
                            replace,
                            open,
                          )
                        }
                        onUndoEdit={() =>
                          save(v.id, () => undoEdit(v.id), replace)
                        }
                        onSchedule={(day, time) =>
                          save(
                            v.id,
                            () => schedulePost(v.id, day, time),
                            replace,
                            open,
                          )
                        }
                        onPostDone={(link) =>
                          save(
                            v.id,
                            () => finishPost(v.id, link),
                            replace,
                            open,
                          )
                        }
                        onUndoPost={() =>
                          save(v.id, () => undoPost(v.id), replace)
                        }
                        onDelete={() =>
                          save(
                            v.id,
                            () => deleteVideo(v.id),
                            () =>
                              setVideos((p) => p.filter((x) => x.id !== v.id)),
                            open,
                          )
                        }
                      />
                    ),
                  )}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string | null;
  children: ReactNode;
}) {
  const safe = safeHref(href);
  if (!safe) return null;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded text-fg underline underline-offset-4 hover:text-fg-muted focus-visible:outline-none focus-visible:shadow-focusRing"
    >
      {children}
    </a>
  );
}

function VideoCard({
  video: v,
  account,
  editor,
  handler,
  canEdit,
  canPost,
  canUndoEdit,
  canUndoPost,
  isAdmin,
  tag,
  open,
  saving,
  error,
  onOpen,
  onClose,
  onEditDone,
  onUndoEdit,
  onSchedule,
  onPostDone,
  onUndoPost,
  onDelete,
}: {
  video: Video;
  account: string;
  editor: string | null;
  handler: string | null;
  canEdit: boolean;
  canPost: boolean;
  canUndoEdit: boolean;
  canUndoPost: boolean;
  isAdmin: boolean;
  tag: 'en' | 'zh-CN';
  open: Step | 'new' | null;
  saving: boolean;
  /** Why the last save on this job was refused. */
  error: string | null;
  onOpen: (kind: Step) => void;
  onClose: () => void;
  onEditDone: (link: string) => void;
  onUndoEdit: () => void;
  onSchedule: (day: string, time: string) => void;
  onPostDone: (link: string) => void;
  onUndoPost: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const stage = videoStage(v);
  const [link, setLink] = useState('');
  const [day, setDay] = useState(v.postDate ?? '');
  const [time, setTime] = useState(v.postTime ?? '');
  const doneOn = (iso: string) => fmtDay(dateKeyAt(new Date(iso)), tag);

  function submit(e: FormEvent, fn: () => void) {
    e.preventDefault();
    fn();
  }

  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-caption text-fg-muted">{account}</p>
      <p className="mt-0.5 break-words text-body text-fg">{v.title}</p>
      {v.note ? (
        <p className="mt-1 break-words text-caption text-fg-subtle">{v.note}</p>
      ) : null}

      <dl className="mt-3 space-y-1.5 text-caption">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-fg-subtle">{t('Editor')}</dt>
          <dd className="text-fg">
            {editor ?? t('Nobody')}
            {v.editedAt ? (
              <>
                {' · '}
                {t('done {day}', { day: doneOn(v.editedAt) })}
                {v.editLink ? ' · ' : null}
                <ExternalLink href={v.editLink}>
                  {t('Edited video')}
                </ExternalLink>
              </>
            ) : editor ? (
              <span className="text-fg-muted"> · {t('editing')}</span>
            ) : null}
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-fg-subtle">{t('Handler')}</dt>
          <dd className="text-fg">
            {handler ?? t('Nobody')}
            {v.postedAt ? (
              <>
                {' · '}
                {t('posted {day}', { day: doneOn(v.postedAt) })}
                {v.postLink ? ' · ' : null}
                <ExternalLink href={v.postLink}>{t('Live post')}</ExternalLink>
              </>
            ) : v.postDate ? (
              <span className="text-fg-muted">
                {' · '}
                {t('goes out {day}', {
                  day: `${fmtDay(v.postDate, tag)}${v.postTime ? ` ${v.postTime}` : ''}`,
                })}
              </span>
            ) : (
              <span className="text-fg-muted"> · {t('not scheduled')}</span>
            )}
          </dd>
        </div>
      </dl>

      {open === 'editDone' && canEdit ? (
        <form
          onSubmit={(e) => submit(e, () => onEditDone(link))}
          className="mt-3 space-y-2"
        >
          <Field label={t('Link to the edited video')} htmlFor={`edl-${v.id}`}>
            <Input
              id={`edl-${v.id}`}
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://"
              autoComplete="off"
              autoFocus
              required
            />
          </Field>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              {t('Done')}
            </Button>
          </div>
        </form>
      ) : open === 'postDone' && canPost ? (
        <form
          onSubmit={(e) => submit(e, () => onPostDone(link))}
          className="mt-3 space-y-2"
        >
          <Field label={t('Link to the live post')} htmlFor={`pl-${v.id}`}>
            <Input
              id={`pl-${v.id}`}
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://"
              autoComplete="off"
              autoFocus
              required
            />
          </Field>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              {t('Done')}
            </Button>
          </div>
        </form>
      ) : open === 'schedule' && canPost ? (
        <form
          onSubmit={(e) => submit(e, () => onSchedule(day, time))}
          className="mt-3 space-y-2"
        >
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('Posting day')} htmlFor={`pd-${v.id}`}>
              <Input
                id={`pd-${v.id}`}
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label={t('Time')} htmlFor={`pt-${v.id}`} optional>
              <Input
                id={`pt-${v.id}`}
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Field>
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              {t('Save')}
            </Button>
          </div>
        </form>
      ) : open === 'delete' && isAdmin ? (
        <div className="mt-3 space-y-2">
          <div
            role="group"
            aria-label={t('Delete {title}', { title: v.title })}
            className="flex flex-wrap items-center gap-2 text-caption text-fg"
          >
            <span className="min-w-0 flex-1">
              {t('Delete this video job for good?')}
            </span>
            <Button
              size="sm"
              variant="danger"
              loading={saving}
              onClick={onDelete}
            >
              {t('Delete')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} autoFocus>
              {t('Keep')}
            </Button>
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <div className="flex flex-wrap items-center gap-1">
              {stage === 'done' ? <Pill>{t('Done')}</Pill> : null}
              {stage === 'editing' && canEdit ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setLink(v.editLink ?? '');
                    onOpen('editDone');
                  }}
                  aria-label={t('Done editing: {title}', { title: v.title })}
                >
                  {t('Done')}
                </Button>
              ) : null}
              {stage === 'posting' && v.editedAt && canUndoEdit ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={onUndoEdit}
                  aria-label={t('Undo edit: {title}', { title: v.title })}
                >
                  {t('Undo edit')}
                </Button>
              ) : null}
              {stage === 'posting' && canPost ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      // Start from what is saved, not an abandoned draft.
                      setDay(v.postDate ?? '');
                      setTime(v.postTime ?? '');
                      onOpen('schedule');
                    }}
                    aria-label={
                      v.postDate
                        ? t('Reschedule: {title}', { title: v.title })
                        : t('Schedule post: {title}', { title: v.title })
                    }
                  >
                    {v.postDate ? t('Reschedule') : t('Schedule post')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setLink(v.postLink ?? '');
                      onOpen('postDone');
                    }}
                    aria-label={t('Done posting: {title}', { title: v.title })}
                  >
                    {t('Done')}
                  </Button>
                </>
              ) : null}
              {stage === 'done' && canUndoPost ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={onUndoPost}
                  aria-label={t('Undo post: {title}', { title: v.title })}
                >
                  {t('Undo')}
                </Button>
              ) : null}
            </div>
            {isAdmin ? (
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onOpen('edit')}
                  aria-label={t('Change {title}', { title: v.title })}
                >
                  {t('Change')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onOpen('delete')}
                  aria-label={t('Delete {title}', { title: v.title })}
                >
                  {t('Delete')}
                </Button>
              </div>
            ) : null}
          </div>
          {/* A one-click step (Undo) that was refused says why here. */}
          {error ? (
            <div className="mt-2">
              <Alert tone="danger">{error}</Alert>
            </div>
          ) : null}
        </>
      )}
    </li>
  );
}
