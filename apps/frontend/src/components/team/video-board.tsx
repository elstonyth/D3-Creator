'use client';

/**
 * Video jobs, grouped by where each one is: with its editor, ready to post,
 * or done this month. The admin sees and changes every job and gives out new
 * ones; a staff member sees the jobs they edit or post and moves only their
 * own step — Done with a link, or taking it back.
 *
 * Saves wait for the server (each is one small write) and keep the step open
 * with the reason when refused.
 */

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { dateKeyAt } from '@gitroom/frontend/lib/tracker';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Badge } from '@gitroom/frontend/components/ui/badge';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Field, Input, Select } from '@gitroom/frontend/components/ui/input';
import {
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
  const [error, setError] = useState<string | null>(null);
  // Admin filter: 'all', or a person (as editor or handler).
  const [person, setPerson] = useState('all');

  const nameOf = useMemo(
    () => new Map(people.map((p) => [p.id, p.name])),
    [people],
  );
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

  async function save(
    call: () => Promise<VideoResult>,
    apply: (r: VideoResult) => void,
  ) {
    setSaving(true);
    setError(null);
    const r = await call();
    setSaving(false);
    if (!r.ok) {
      setError(r.message ?? 'Could not save. Try again.');
      return;
    }
    apply(r);
    setOpen(null);
  }
  const replace = (r: VideoResult) =>
    setVideos((p) => p.map((x) => (x.id === r.video!.id ? r.video! : x)));
  const draftInput = (d: VideoDraft) => ({ ...d });

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

      {error ? <Alert tone="danger">{t(error)}</Alert> : null}

      {isAdmin && open?.kind === 'new' ? (
        <VideoForm
          initial={videoDraftOf(null)}
          accounts={accounts}
          editors={editorPicks}
          handlers={handlerPicks}
          assignments={assignments}
          saving={saving}
          onSave={(d) =>
            save(
              () => createVideo(draftInput(d)),
              (r) => setVideos((p) => [r.video!, ...p]),
            )
          }
          onCancel={() => setOpen(null)}
        />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
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
                          editors={editorPicks}
                          handlers={handlerPicks}
                          assignments={assignments}
                          saving={saving}
                          onSave={(d) =>
                            save(
                              () => updateVideo(v.id, draftInput(d)),
                              replace,
                            )
                          }
                          onCancel={() => setOpen(null)}
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
                        editor={
                          v.editorId
                            ? v.editorId === meId
                              ? t('You')
                              : (nameOf.get(v.editorId) ?? '—')
                            : null
                        }
                        handler={
                          v.handlerId
                            ? v.handlerId === meId
                              ? t('You')
                              : (nameOf.get(v.handlerId) ?? '—')
                            : null
                        }
                        canEdit={isAdmin || v.editorId === meId}
                        canPost={isAdmin || v.handlerId === meId}
                        isAdmin={isAdmin}
                        tag={tag}
                        open={
                          open && 'id' in open && open.id === v.id
                            ? open.kind
                            : null
                        }
                        saving={saving}
                        onOpen={(kind) => {
                          setError(null);
                          setOpen({ kind, id: v.id });
                        }}
                        onClose={() => setOpen(null)}
                        onEditDone={(link) =>
                          save(() => finishEdit(v.id, link), replace)
                        }
                        onUndoEdit={() => save(() => undoEdit(v.id), replace)}
                        onSchedule={(day, time) =>
                          save(() => schedulePost(v.id, day, time), replace)
                        }
                        onPostDone={(link) =>
                          save(() => finishPost(v.id, link), replace)
                        }
                        onUndoPost={() => save(() => undoPost(v.id), replace)}
                        onDelete={() =>
                          save(
                            () => deleteVideo(v.id),
                            () =>
                              setVideos((p) => p.filter((x) => x.id !== v.id)),
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
  isAdmin,
  tag,
  open,
  saving,
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
  isAdmin: boolean;
  tag: 'en' | 'zh-CN';
  open: Step | 'new' | null;
  saving: boolean;
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
        <div
          role="group"
          aria-label={t('Delete {title}', { title: v.title })}
          className="mt-3 flex flex-wrap items-center gap-2 text-caption text-fg"
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
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('Keep')}
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-1">
          {stage === 'done' ? (
            <Badge className="mr-auto">{t('Done')}</Badge>
          ) : null}
          {stage === 'editing' && canEdit ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setLink(v.editLink ?? '');
                onOpen('editDone');
              }}
              aria-label={t('Edit done: {title}', { title: v.title })}
            >
              {t('Done')}
            </Button>
          ) : null}
          {stage === 'posting' && v.editedAt && canEdit ? (
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
                onClick={() => onOpen('schedule')}
                aria-label={t('Schedule {title}', { title: v.title })}
              >
                {v.postDate ? t('Reschedule') : t('Schedule')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setLink(v.postLink ?? '');
                  onOpen('postDone');
                }}
                aria-label={t('Posted: {title}', { title: v.title })}
              >
                {t('Done')}
              </Button>
            </>
          ) : null}
          {stage === 'done' && canPost ? (
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
          {isAdmin ? (
            <>
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
            </>
          ) : null}
        </div>
      )}
    </li>
  );
}
