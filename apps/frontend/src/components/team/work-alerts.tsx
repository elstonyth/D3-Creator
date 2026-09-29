'use client';

/**
 * What needs the staff member now, as a pop-up over their tracker (the
 * owner's call):
 * - a shoot an hour past its start (shootDueAt), with Pass videos right in
 *   the pop-up;
 * - videos just passed to them to edit;
 * - cuts just finished that wait on their Verify.
 *
 * In-app only: the tracker re-reads the page every minute while it is on
 * screen, so a pass or a Done shows up here without a reload, but nothing
 * reaches a phone while the portal is closed. What has been seen is kept per
 * device (localStorage), by list and video, so a video given to a new editor
 * still pops up for them. A due shoot comes back on every visit until its
 * videos are passed on or it is cancelled.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { Button } from '@gitroom/frontend/components/ui/button';
import { isDue, type Shoot } from '@gitroom/frontend/lib/team/shoots';
import {
  mySection,
  type PassRow,
  type Video,
} from '@gitroom/frontend/lib/team/videos';
import {
  passVideos,
  type PassResult,
} from '@gitroom/frontend/lib/team/shoot-actions';
import { cn } from '@gitroom/frontend/lib/utils';
import { PassVideosForm } from './pass-videos-form';
import { fmtDate } from './tracker-shell';
import s from './tracker.module.scss';

const SEEN_EVENT = 'd3:work-seen';
// ponytail: a capped list of seen keys per device; enough for months of work.
const SEEN_MAX = 300;
const seenKey = (me: string) => `d3:work-seen:${me}`;

function onSeenChange(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener(SEEN_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(SEEN_EVENT, cb);
  };
}

function readSeen(me: string): string | null {
  try {
    return window.localStorage.getItem(seenKey(me));
  } catch {
    return null;
  }
}

function parseSeen(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

export function WorkAlerts({
  meId,
  month,
  today,
  now,
  shoots,
  videos,
  people,
  accounts,
  editors,
  onPassed,
}: {
  meId: string;
  /** This month (`YYYY-MM`), for which of their lists a video is on. */
  month: string;
  today: string;
  /** The time now (useNow); null while rendering on the server. */
  now: number | null;
  /** The staff member's own shoots. */
  shoots: Shoot[];
  videos: Video[];
  people: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
  /** Who a video can be given to. */
  editors: { id: string; name: string }[];
  /** A shoot whose videos were just passed on, as saved. */
  onPassed: (shoot: Shoot) => void;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const raw = useSyncExternalStore(
    onSeenChange,
    () => readSeen(meId),
    () => null,
  );
  // Put away on this visit: hides them even where storage is blocked, and
  // holds a due shoot back until the next visit.
  const [later, setLater] = useState<string[]>([]);
  const [passing, setPassing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seen = parseSeen(raw);
  const known = (key: string) => seen.includes(key) || later.includes(key);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const accountOf = new Map(accounts.map((a) => [a.id, a.name]));

  // A shoot from a closed month can no longer be cancelled, so once put
  // away it stays away on this device; this month's keep asking each visit.
  const closed = (x: Shoot) => x.date < `${today.slice(0, 7)}-01`;
  const due =
    now === null
      ? []
      : shoots.filter(
          (x) =>
            isDue(x, meId, now) &&
            !(closed(x)
              ? known(`shoot:${x.id}`)
              : later.includes(`shoot:${x.id}`)),
        );
  const toEdit = videos.filter((v) => mySection(v, meId, month) === 'toEdit');
  // A cut of their own is no news to them.
  const toVerify = videos.filter(
    (v) => mySection(v, meId, month) === 'toVerify' && v.editedBy !== meId,
  );
  const newEdit = toEdit.filter((v) => !known(`edit:${v.id}`));
  const newVerify = toVerify.filter((v) => !known(`verify:${v.id}`));
  const open =
    now !== null && due.length + newEdit.length + newVerify.length > 0;

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  }, [open]);

  function putAway() {
    const keys = [
      ...toEdit.map((v) => `edit:${v.id}`),
      ...toVerify.map((v) => `verify:${v.id}`),
      ...due.filter(closed).map((x) => `shoot:${x.id}`),
    ];
    try {
      window.localStorage.setItem(
        seenKey(meId),
        JSON.stringify([...new Set([...keys, ...seen])].slice(0, SEEN_MAX)),
      );
      window.dispatchEvent(new Event(SEEN_EVENT));
    } catch {
      // Blocked storage: `later` still puts them away for this visit.
    }
    setLater((p) => [...p, ...keys, ...due.map((x) => `shoot:${x.id}`)]);
    setPassing(null);
    setError(null);
  }

  async function pass(x: Shoot, rows: PassRow[]) {
    setSaving(true);
    setError(null);
    let r: PassResult;
    try {
      r = await passVideos(x.id, rows);
    } catch {
      // A dropped connection or a stale deploy: a refusal, not a frozen form.
      r = { ok: false, message: 'Could not save. Try again.' };
    } finally {
      setSaving(false);
    }
    if (!r.ok) {
      setError(t(r.message ?? 'Could not save. Try again.'));
      return;
    }
    // Done now, so it leaves the list; the pop-up closes if nothing is left.
    if (r.shoot) onPassed(r.shoot);
    setPassing(null);
    router.refresh();
  }

  const tag = localeTag(locale);
  const shootLabel = (x: Shoot) => {
    const account = x.creatorId ? accountOf.get(x.creatorId) : null;
    return [
      x.date === today
        ? t('Today')
        : fmtDate(x.date, tag, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          }),
      x.time,
      x.title ?? account ?? t('Shoot'),
    ]
      .filter(Boolean)
      .join(' · ');
  };
  const videoMeta = (v: Video, who: string) =>
    [who, v.creatorId ? accountOf.get(v.creatorId) : null]
      .filter(Boolean)
      .join(' · ');

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={open ? titleId : undefined}
      // Escape closes an open pass form (keeping the pop-up), else is Later.
      onCancel={(e) => {
        e.preventDefault();
        if (passing) {
          setPassing(null);
          setError(null);
        } else putAway();
      }}
      className="m-auto w-[min(94vw,560px)] max-w-[560px] bg-transparent p-0 text-fg backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      {open ? (
        <div className="max-h-[85vh] overflow-y-auto rounded-[28px] border border-white/10 bg-surface p-5 shadow-glass sm:p-6">
          <h2 id={titleId} className="text-heading text-fg">
            {t('Waiting for you')}
          </h2>

          {due.length > 0 ? (
            <section className="mt-4">
              <h3 className="text-label text-fg">
                {t('Shoot time is up — pass the videos on')}
              </h3>
              <ul className="mt-2 space-y-2">
                {due.map((x) => (
                  <li key={x.id} className={cn(s.inset, 'p-3')}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 break-words text-body">
                        {shootLabel(x)}
                      </span>
                      {passing === x.id ? null : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setError(null);
                            setPassing(x.id);
                          }}
                          aria-label={t('Pass videos: {title}', {
                            title: shootLabel(x),
                          })}
                        >
                          {t('Pass videos')}
                        </Button>
                      )}
                    </div>
                    {passing === x.id ? (
                      <PassVideosForm
                        editors={editors}
                        saving={saving}
                        error={error}
                        onSave={(rows) => pass(x, rows)}
                        onCancel={() => {
                          setPassing(null);
                          setError(null);
                        }}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {newEdit.length > 0 ? (
            <section className="mt-5">
              <h3 className="text-label text-fg">{t('New videos to edit')}</h3>
              <ul className="mt-2 space-y-1.5">
                {newEdit.map((v) => (
                  <li key={v.id} className={cn(s.inset, 'px-3 py-2')}>
                    <p className="break-words text-body">{v.title}</p>
                    <p className="text-caption text-fg-muted">
                      {videoMeta(
                        v,
                        t('From {name}', {
                          name: nameOf.get(v.handlerId) ?? '—',
                        }),
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {newVerify.length > 0 ? (
            <section className="mt-5">
              <h3 className="text-label text-fg">
                {t('Edited — ready for you to verify')}
              </h3>
              <ul className="mt-2 space-y-1.5">
                {newVerify.map((v) => (
                  <li key={v.id} className={cn(s.inset, 'px-3 py-2')}>
                    <p className="break-words text-body">{v.title}</p>
                    <p className="text-caption text-fg-muted">
                      {videoMeta(
                        v,
                        t('Cut by {name}', {
                          name: nameOf.get(v.editedBy ?? v.editorId) ?? '—',
                        }),
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            {newEdit.length + newVerify.length > 0 ? (
              <Button
                variant="secondary"
                onClick={() => {
                  dialogRef.current?.close();
                  putAway();
                  document
                    .getElementById('my-videos')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                {t('Go to my videos')}
              </Button>
            ) : null}
            <Button onClick={putAway}>
              {due.length > 0 ? t('Later') : t('Got it')}
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
