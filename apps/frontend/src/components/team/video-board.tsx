'use client';

/**
 * Video jobs, grouped by where each one is. A staff member sees their own:
 * videos to edit, cuts to verify, videos they passed on that are still with
 * the editor, and what they finished this month — and moves only their own
 * step. The admin sees everyone's, read-only: who is editing what now, what
 * waits to be verified, and what was verified this month.
 *
 * Saves wait for the server (each is one small write). A refusal is shown on
 * the video it belongs to, with its step still open. It sits in a work
 * tracker's glass panel, so its cards take the tracker's inset look.
 */

import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { dateKeyAt, type MemberKind } from '@gitroom/frontend/lib/tracker';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Field, Input, Select } from '@gitroom/frontend/components/ui/input';
import {
  isEditorKind,
  mySection,
  safeHref,
  videoStage,
  type MySection,
  type Video,
  type VideoStage,
} from '@gitroom/frontend/lib/team/videos';
import {
  deleteVideo,
  finishEdit,
  undoEdit,
  undoVerify,
  updateVideo,
  verifyVideo,
  type VideoResult,
} from '@gitroom/frontend/lib/team/video-actions';
import { cn } from '@gitroom/frontend/lib/utils';
import { Pill } from './pill';
import s from './tracker.module.scss';

interface Person {
  id: string;
  name: string;
  kind: MemberKind;
  archived: boolean;
}

export interface VideoBoardProps {
  videos: Video[];
  people: Person[];
  accounts: { id: string; name: string }[];
  /** The staff member's own person; null on the admin's view. */
  meId: string | null;
  /**
   * This month (`YYYY-MM`, Malaysia). A staff member's "done this month"
   * and the Done they can still take back are from this month only.
   */
  month: string;
  /** The admin's view: everyone's videos, with nothing to change. */
  readOnly?: boolean;
}

type Step = 'editDone' | 'change' | 'remove';
type Open = { kind: Step; id: string } | null;

const MINE: MySection[] = ['toEdit', 'toVerify', 'withEditor', 'done'];
const ALL: VideoStage[] = ['editing', 'verifying', 'done'];

function fmtDay(key: string, tag: 'en' | 'zh-CN'): string {
  return new Intl.DateTimeFormat(tag, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${key}T00:00:00Z`));
}

// Whether this render is in the browser (false on the server and while
// hydrating), without a setState in an effect.
const noSubscribe = () => () => {};

export function VideoBoard({
  videos: initialVideos,
  people,
  accounts,
  meId,
  month,
  readOnly = false,
}: VideoBoardProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const tag = localeTag(locale);
  // Whose steps can be moved here: nobody's on the admin's view.
  const me = readOnly ? null : meId;
  const [videos, setVideos] = useState(initialVideos);
  // A refresh brings the server's list again (videos just passed on from a
  // shoot on the same page, a step taken elsewhere): it replaces this copy.
  // The page hands the same array through until then.
  const [fromServer, setFromServer] = useState(initialVideos);
  if (fromServer !== initialVideos) {
    setFromServer(initialVideos);
    setVideos(initialVideos);
  }
  const [open, setOpen] = useState<Open>(null);
  const [saving, setSaving] = useState(false);
  // A refusal, and the video it belongs to.
  const [error, setError] = useState<{ at: string; text: string } | null>(null);
  // The admin's filter: 'all', or a person (as editor or handler).
  const [person, setPerson] = useState('all');
  // What a step just did: its card has usually moved to another list.
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

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const accountOf = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );
  const onBoard = people.filter((p) => !p.archived);
  const editors = onBoard.filter((p) => isEditorKind(p.kind));
  const left = (name: string) => t('{name} (left)', { name });
  const nameOf = (id: string | null): string | null => {
    if (!id) return null;
    if (id === me) return t('You');
    const p = byId.get(id);
    if (!p) return '—';
    return p.archived ? left(p.name) : p.name;
  };
  const inMonth = (iso: string | null) =>
    iso !== null && dateKeyAt(new Date(iso)).slice(0, 7) === month;

  const cmpDesc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
  const newestDone = (list: Video[]) =>
    list.sort((a, b) =>
      cmpDesc(
        a.verifiedAt ?? a.editedAt ?? '',
        b.verifiedAt ?? b.editedAt ?? '',
      ),
    );

  const sections =
    me === null
      ? ALL.map((stage) => {
          const list = videos.filter(
            (v) =>
              videoStage(v) === stage &&
              (person === 'all' ||
                v.editorId === person ||
                v.handlerId === person),
          );
          return {
            key: stage,
            list: stage === 'done' ? newestDone(list) : list,
          };
        })
      : MINE.map((section) => {
          const list = videos.filter(
            (v) => mySection(v, me, month) === section,
          );
          return {
            key: section,
            list: section === 'done' ? newestDone(list) : list,
          };
        });

  const title: Record<VideoStage | MySection, string> = {
    editing: t('Being edited'),
    verifying: t('Waiting to verify'),
    done: me === null ? t('Verified this month') : t('Done this month'),
    toEdit: t('To edit'),
    toVerify: t('To verify'),
    withEditor: t('With the editor'),
  };
  const empty: Record<VideoStage | MySection, string> = {
    editing: t('Nothing is being edited.'),
    verifying: t('Nothing is waiting to be verified.'),
    done:
      me === null
        ? t('Nothing verified yet this month.')
        : t('Nothing finished yet this month.'),
    toEdit: t('Nothing to edit right now.'),
    toVerify: t('Nothing to verify right now.'),
    withEditor: t('Nothing waiting on an editor.'),
  };

  /**
   * One save. `started` is the form it came from: only that form closes when
   * it succeeds, so a slow one-click step never closes a form opened since.
   * `done` is what to say once it has saved.
   */
  async function save(
    at: string,
    call: () => Promise<VideoResult>,
    apply: (r: VideoResult) => void,
    started: Open = null,
    done?: string,
  ) {
    setSaving(true);
    setError(null);
    let r: VideoResult;
    try {
      r = await call();
    } catch {
      // A dropped connection or a stale deploy: a refusal, not a frozen board.
      r = { ok: false, message: 'Could not save. Try again.' };
    } finally {
      setSaving(false);
    }
    if (!r.ok) {
      setError({ at, text: r.message ?? 'Could not save. Try again.' });
      return;
    }
    apply(r);
    if (done) setNotice({ id: Date.now(), text: done });
    if (started) setOpen((cur) => (cur === started ? null : cur));
    // These actions don't revalidate the page (the board keeps its own
    // state); drop the router's cached copy so Back/Forward can't bring back
    // the page as it was before this save.
    router.refresh();
  }
  const replace = (r: VideoResult) =>
    setVideos((p) => p.map((x) => (x.id === r.video!.id ? r.video! : x)));
  const errorAt = (at: string) => (error?.at === at ? t(error.text) : null);
  const close = () => {
    setOpen(null);
    setError(null);
  };

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
          {notice.text}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-5">
      {me === null ? (
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
      ) : null}

      <div
        className={
          me === null
            ? 'grid items-start gap-5 lg:grid-cols-3'
            : 'grid items-start gap-5 lg:grid-cols-2'
        }
      >
        {sections.map(({ key, list }) => (
          <section key={key} aria-label={title[key]} className="min-w-0">
            <h3 className="mb-3 flex items-baseline justify-between gap-2 px-1 text-heading text-fg">
              {title[key]}
              <span className="text-caption tnum text-fg-subtle">
                {list.length}
              </span>
            </h3>
            {list.length === 0 ? (
              <p className="rounded-[18px] border border-dashed border-white/10 px-4 py-6 text-center text-body-sm text-fg-subtle">
                {empty[key]}
              </p>
            ) : (
              <ul className="space-y-3">
                {list.map((v) => {
                  // The current editor stays pickable, even after leaving.
                  const cur = byId.get(v.editorId);
                  const editorPicks =
                    !cur || editors.some((x) => x.id === cur.id)
                      ? editors
                      : [...editors, { ...cur, name: left(cur.name) }];
                  return (
                    <VideoCard
                      key={v.id}
                      video={v}
                      account={
                        v.creatorId ? (accountOf.get(v.creatorId) ?? '—') : '—'
                      }
                      // A finished step names who it counts for.
                      editor={nameOf(
                        v.editedAt ? (v.editedBy ?? v.editorId) : v.editorId,
                      )}
                      handler={nameOf(
                        v.verifiedAt
                          ? (v.verifiedBy ?? v.handlerId)
                          : v.handlerId,
                      )}
                      editors={editorPicks}
                      canEditDone={v.editorId === me && !v.editedAt}
                      canChange={v.handlerId === me && !v.editedAt}
                      canVerify={
                        v.handlerId === me && !!v.editedAt && !v.verifiedAt
                      }
                      canUndoEdit={
                        v.editedBy === me &&
                        inMonth(v.editedAt) &&
                        !v.verifiedAt
                      }
                      canUndoVerify={
                        v.verifiedBy === me && inMonth(v.verifiedAt)
                      }
                      tag={tag}
                      open={open?.id === v.id ? open.kind : null}
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
                          t('Edit done: “{title}” is waiting to be verified.', {
                            title: v.title,
                          }),
                        )
                      }
                      onUndoEdit={() =>
                        save(
                          v.id,
                          () => undoEdit(v.id),
                          replace,
                          null,
                          t('Taken back: “{title}”.', { title: v.title }),
                        )
                      }
                      onChange={(next) =>
                        save(
                          v.id,
                          () =>
                            updateVideo(v.id, next, {
                              title: v.title,
                              editorId: v.editorId,
                            }),
                          replace,
                          open,
                        )
                      }
                      onRemove={() =>
                        save(
                          v.id,
                          () => deleteVideo(v.id),
                          () =>
                            setVideos((p) => p.filter((x) => x.id !== v.id)),
                          open,
                          t('Removed: “{title}”.', { title: v.title }),
                        )
                      }
                      onVerify={() =>
                        save(
                          v.id,
                          () => verifyVideo(v.id),
                          replace,
                          null,
                          t('Verified: “{title}”.', { title: v.title }),
                        )
                      }
                      onUndoVerify={() =>
                        save(
                          v.id,
                          () => undoVerify(v.id),
                          replace,
                          null,
                          t('Taken back: “{title}”.', { title: v.title }),
                        )
                      }
                    />
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>

      {/* Always there, so a screen reader reads out each notice put in it.
          Portalled to the body: the glass panel around the board has a
          backdrop-filter, which would pin a fixed child to the panel instead
          of the window. */}
      {inBrowser ? createPortal(live, document.body) : live}
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
  editors,
  canEditDone,
  canChange,
  canVerify,
  canUndoEdit,
  canUndoVerify,
  tag,
  open,
  saving,
  error,
  onOpen,
  onClose,
  onEditDone,
  onUndoEdit,
  onChange,
  onRemove,
  onVerify,
  onUndoVerify,
}: {
  video: Video;
  account: string;
  editor: string | null;
  handler: string | null;
  /** Who the video can be given to instead. */
  editors: { id: string; name: string }[];
  canEditDone: boolean;
  canChange: boolean;
  canVerify: boolean;
  canUndoEdit: boolean;
  canUndoVerify: boolean;
  tag: 'en' | 'zh-CN';
  open: Step | null;
  saving: boolean;
  /** Why the last save on this video was refused. */
  error: string | null;
  onOpen: (kind: Step) => void;
  onClose: () => void;
  onEditDone: (link: string) => void;
  onUndoEdit: () => void;
  onChange: (next: { title: string; editorId: string }) => void;
  onRemove: () => void;
  onVerify: () => void;
  onUndoVerify: () => void;
}) {
  const { t } = useI18n();
  const [link, setLink] = useState('');
  const [title, setTitle] = useState(v.title);
  const [editorId, setEditorId] = useState(v.editorId);
  const doneOn = (iso: string) => fmtDay(dateKeyAt(new Date(iso)), tag);

  function submit(e: FormEvent, fn: () => void) {
    e.preventDefault();
    fn();
  }

  const stage = videoStage(v);

  return (
    <li className={cn(s.inset, 'p-4')}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-caption text-fg-muted">{account}</p>
        <Pill
          tone={stage === 'done' ? 'neutral' : 'muted'}
          className="shrink-0"
        >
          {stage === 'done'
            ? t('Verified')
            : stage === 'verifying'
              ? t('Waiting to verify')
              : t('Being edited')}
        </Pill>
      </div>
      <p className="mt-1 break-words text-body text-fg">{v.title}</p>

      <dl className="mt-3 space-y-1.5 text-caption">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-fg-subtle">{t('Editor')}</dt>
          <dd className="text-fg">
            {editor}
            {v.editedAt ? (
              <>
                {' · '}
                {t('done {day}', { day: doneOn(v.editedAt) })}
                {safeHref(v.editLink) ? ' · ' : null}
                <ExternalLink href={v.editLink}>
                  {t('Edited video')}
                </ExternalLink>
              </>
            ) : (
              <span className="text-fg-muted"> · {t('editing')}</span>
            )}
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-fg-subtle">{t('Handler')}</dt>
          <dd className="text-fg">
            {handler}
            {v.verifiedAt ? (
              <>
                {' · '}
                {t('verified {day}', { day: doneOn(v.verifiedAt) })}
              </>
            ) : (
              <span className="text-fg-muted"> · {t('not verified yet')}</span>
            )}
          </dd>
        </div>
      </dl>

      {open === 'editDone' && canEditDone ? (
        <form
          onSubmit={(e) => submit(e, () => onEditDone(link))}
          className="mt-3 space-y-2"
        >
          <Field
            label={t('Link to the edited video')}
            htmlFor={`edl-${v.id}`}
            optional
          >
            <Input
              id={`edl-${v.id}`}
              type="text"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://"
              autoComplete="off"
              autoFocus
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
      ) : open === 'change' && canChange ? (
        <form
          onSubmit={(e) => submit(e, () => onChange({ title, editorId }))}
          className="mt-3 space-y-2"
        >
          <Field label={t('Title')} htmlFor={`vt-${v.id}`}>
            <Input
              id={`vt-${v.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              autoFocus
              autoComplete="off"
            />
          </Field>
          <Field label={t('Editor')} htmlFor={`ve-${v.id}`}>
            <Select
              id={`ve-${v.id}`}
              value={editorId}
              onChange={(e) => setEditorId(e.target.value)}
              required
            >
              {editors.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={saving}
              disabled={!title.trim()}
            >
              {t('Save')}
            </Button>
          </div>
        </form>
      ) : open === 'remove' && canChange ? (
        <div className="mt-3 space-y-2">
          <div
            role="group"
            aria-label={t('Remove {title}', { title: v.title })}
            className="flex flex-wrap items-center gap-2 text-caption text-fg"
          >
            <span className="min-w-0 flex-1">
              {t('Remove this video? It leaves the editor’s list too.')}
            </span>
            <Button
              size="sm"
              variant="danger"
              loading={saving}
              onClick={onRemove}
            >
              {t('Remove')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} autoFocus>
              {t('Keep')}
            </Button>
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </div>
      ) : canEditDone ||
        canChange ||
        canVerify ||
        canUndoEdit ||
        canUndoVerify ? (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-1">
            {canEditDone ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setLink('');
                  onOpen('editDone');
                }}
                aria-label={t('Done editing: {title}', { title: v.title })}
              >
                {t('Done')}
              </Button>
            ) : null}
            {canVerify ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={onVerify}
                aria-label={t('Verify: {title}', { title: v.title })}
              >
                {t('Verify')}
              </Button>
            ) : null}
            {canChange ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    // Start from what is saved, not an abandoned draft.
                    setTitle(v.title);
                    setEditorId(v.editorId);
                    onOpen('change');
                  }}
                  aria-label={t('Change {title}', { title: v.title })}
                >
                  {t('Change')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onOpen('remove')}
                  aria-label={t('Remove {title}', { title: v.title })}
                >
                  {t('Remove')}
                </Button>
              </>
            ) : null}
            {canUndoEdit ? (
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
            {canUndoVerify ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={onUndoVerify}
                aria-label={t('Undo verify: {title}', { title: v.title })}
              >
                {t('Undo verify')}
              </Button>
            ) : null}
          </div>
          {/* A one-click step (Verify, Undo) that was refused says why here. */}
          {error ? (
            <div className="mt-2">
              <Alert tone="danger">{error}</Alert>
            </div>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
