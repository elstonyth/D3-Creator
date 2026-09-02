'use client';

/**
 * The one client island on /studio/analyzer — PRD 3 §6.2 and §6.4.
 *
 * The page performs the `listJobs` read and renders the <table> itself, then
 * hands it here through `children`. That keeps the read, the date formatting
 * and the table markup on the server while the one control that needs `busy` —
 * the empty state's "Upload a video" — stays in the island.
 *
 * Polling cadence, the immediate first poll, the 5-consecutive-failure stop and
 * the 16-minute give-up are PRD 1 §8.8.6.
 */

import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Button } from '@gitroom/frontend/components/ui/button';
import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';
import {
  ALLOWED_EXTENSIONS,
  FILE_ACCEPT,
  MAX_DURATION_SECONDS,
  MAX_UPLOAD_BYTES,
  LINK_HINT,
  STEP_LABEL,
  STEP_ORDER,
  errorCopy,
  linkErrorCopy,
  type AnalyzerJob,
  type AnalyzerJobSummary,
} from '@gitroom/frontend/lib/analyzer-contract';
import { cn } from '@gitroom/frontend/lib/utils';

export interface AnalyzerWorkspaceProps {
  /** §6.2 — the newest non-terminal row, or null. */
  initialJob: AnalyzerJobSummary | null;
  /**
   * Amendment 1 Part D. The already-rendered §10A.6 profile block, or null,
   * read server-side by the page.
   *
   * It travels through the browser because the upload route streams its
   * multipart body through with `duplex: 'half'` and cannot inject a field
   * without buffering up to 2 GB. `report_language` works the same way. A user
   * can therefore tamper with their own profile string; the blast radius is
   * their own report, and the worker bounds the length again.
   */
  businessProfile: string | null;
  /**
   * The worker's `report_language`, derived server-side from the profile's
   * `reply_language` (owner request 2026-08-24). `null` leaves the field off
   * entirely and the worker applies its own `'en'` default.
   *
   * It has to be sent. Without it the profile block would carry a
   * `Reply language: Chinese` line into a prompt whose own instruction says to
   * write the report in English — two contradictory orders in one request.
   */
  reportLanguage: 'en' | 'zh' | null;
  hasHistory: boolean;
  /** `listJobs` threw — NOT the same as no rows. */
  historyUnavailable: boolean;
  /** The server-rendered <table>. */
  children: ReactNode;
}

type IslandJob = AnalyzerJob | AnalyzerJobSummary;

/** §6.3's client-side rejections — the file never leaves the browser. */
const COPY = {
  format: 'That file type is not supported. Use MP4, MOV, WebM or AVI.',
  size: 'That file is too big. The limit is 2 GB.',
  duration: 'That video is longer than 5 minutes. Trim it and try again.',
  upload: 'That upload did not go through. Try again in a moment.',
};

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_FAILURES = 5;
const POLL_GIVE_UP_MS = 16 * 60 * 1000;
const DURATION_PROBE_MS = 5000;

/**
 * Probe a detached <video> with a `blob:` URL. Needs the `blob:` token in
 * `media-src`, which C0 added to next.config.js (PRD 1 §8.8.9).
 *
 * Its own 5-second timeout resolves to "unknown", and unknown means the upload
 * proceeds and the worker enforces. FAIL OPEN, never closed: a CSP-blocked
 * <video> is not guaranteed to fire `error`, and without the timeout the
 * promise never settles and the user's click is swallowed with no message.
 */
function probeDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), DURATION_PROBE_MS);
    video.preload = 'metadata';
    video.onloadedmetadata = () =>
      finish(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

function ErrorLine({ children }: { children: ReactNode }): ReactElement {
  return (
    <p role="alert" className="flex items-center gap-1.5 text-caption text-fg">
      <X aria-hidden className="h-3.5 w-3.5 shrink-0" />
      {children}
    </p>
  );
}

export default function AnalyzerWorkspace({
  initialJob,
  businessProfile,
  reportLanguage,
  hasHistory,
  historyUnavailable,
  children,
}: AnalyzerWorkspaceProps): ReactElement {
  const router = useRouter();
  // Read EXACTLY once, as the useState seed. Never re-read on a later render
  // and never wired into a useEffect, so a router.refresh() after a give-up
  // cannot restart the poll loop with a fresh 16-minute clock.
  const [job, setJob] = useState<IslandJob | null>(() => initialJob);
  const [pending, setPending] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [link, setLink] = useState('');
  // The picked file's name, so the panel can say WHAT it is analysing during
  // the upload — before any job exists to carry a `filename`. The link path
  // has no name to show until the worker resolves one, so it clears this.
  const [uploadName, setUploadName] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);
  const deadline = useRef(0);
  const seed = useRef(initialJob);
  const resumed = useRef(false);

  const clearPoll = useCallback(() => {
    if (pollTimer.current !== null) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  /**
   * The give-up path. The synthesised job exists only in client state — nothing
   * is written back to the worker, and the real job keeps running, so the
   * refreshed history row will legitimately still read `running`. That mismatch
   * is expected (PRD 1 §8.8.6, "Giving up is not cancelling").
   */
  const giveUp = useCallback(
    (jobId: string, code: 'internal' | 'timeout', message: string) => {
      clearPoll();
      setJob((prev) =>
        prev === null || prev.id !== jobId
          ? prev
          : { ...prev, status: 'failed', step: null, error: { code, message } },
      );
      router.refresh();
    },
    [clearPoll, router],
  );

  const tick = useCallback(
    async function run(jobId: string): Promise<void> {
      let terminal = false;
      try {
        const res = await fetch(`/api/studio/analyzer/jobs/${jobId}`, {
          cache: 'no-store',
        });
        const body: unknown = await res.json().catch(() => null);
        const envelope = body as { ok?: unknown; job?: AnalyzerJob } | null;
        // A shape failure counts exactly like a transport failure; a body that
        // parses but carries no `job` must not reset the counter to zero.
        if (!res.ok || !envelope || envelope.ok !== true || !envelope.job) {
          throw new Error(`poll answered ${res.status}`);
        }
        failures.current = 0;
        const next = envelope.job;
        setJob(next);
        if (next.status === 'done') {
          terminal = true;
          clearPoll();
          // Do not drop back to the upload zone for even one render — the user
          // waited minutes for that page.
          router.push(`/studio/analyzer/${next.id}`);
        } else if (next.status === 'failed') {
          terminal = true;
          clearPoll();
          router.refresh();
        }
      } catch (cause) {
        console.error('[studio/analyzer] poll failed', cause);
        failures.current += 1;
        if (failures.current >= POLL_MAX_FAILURES) {
          giveUp(jobId, 'internal', 'poll failed 5 times');
          return;
        }
      }
      if (terminal) return;
      // 16 is one minute past the server's 15-minute job timeout, so a worker
      // that dies without stamping a terminal status still ends the loop.
      if (Date.now() >= deadline.current) {
        giveUp(jobId, 'timeout', 'client gave up after 16 minutes');
        return;
      }
      pollTimer.current = setTimeout(() => void run(jobId), POLL_INTERVAL_MS);
    },
    [clearPoll, giveUp, router],
  );

  const beginPolling = useCallback(
    (jobId: string) => {
      failures.current = 0;
      deadline.current = Date.now() + POLL_GIVE_UP_MS;
      void tick(jobId); // fired IMMEDIATELY, not after one interval
    },
    [tick],
  );

  // A running job survives a reload: a reload is a new mount and a deliberate
  // re-entry, not the give-up path.
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    const row = seed.current;
    if (row !== null && (row.status === 'queued' || row.status === 'running')) {
      beginPolling(row.id);
    }
  }, [beginPolling]);

  useEffect(() => clearPoll, [clearPoll]);

  const startUpload = useCallback(
    async (file: File) => {
      // FIRST statement, before the extension, size and duration checks, so a
      // client-side rejection on a retry renders its alert inside the remounted
      // upload zone instead of nowhere.
      setJob(null);
      clearPoll();
      setClientError(null);
      setUploadName(null);

      if (
        !(ALLOWED_EXTENSIONS as readonly string[]).includes(
          extensionOf(file.name),
        )
      ) {
        setClientError(COPY.format);
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setClientError(COPY.size);
        return;
      }

      // Set only after the format and size rejections, which render inside the
      // upload zone: a rejected file never gets a progress panel to be named in.
      setUploadName(file.name);
      setPending(true);
      const seconds = await probeDurationSeconds(file);
      if (seconds !== null && seconds > MAX_DURATION_SECONDS) {
        setPending(false);
        setClientError(COPY.duration);
        return;
      }

      try {
        // There is still no language control on THIS page. The language comes
        // from Settings → Reply language; with none set the field is omitted
        // and the worker applies its "en" default (PRD 1 §8.8.3).
        const form = new FormData();
        // BEFORE the file: multer only populates `req.body` with text fields
        // that precede it in the stream (apps/analyzer/src/upload.ts).
        if (businessProfile !== null) {
          form.append('business_profile', businessProfile);
        }
        if (reportLanguage !== null) {
          form.append('report_language', reportLanguage);
        }
        form.append('video', file);
        const res = await fetch('/api/studio/analyzer/jobs', {
          method: 'POST',
          body: form,
        });
        const body: unknown = await res.json().catch(() => null);
        const envelope = body as {
          ok?: unknown;
          job?: AnalyzerJob;
          error?: string;
        } | null;
        if (!res.ok || !envelope || envelope.ok !== true || !envelope.job) {
          console.error(
            '[studio/analyzer] upload rejected',
            res.status,
            envelope?.error,
          );
          setPending(false);
          setClientError(COPY.upload);
          return;
        }
        setJob(envelope.job);
        setPending(false);
        router.refresh(); // the new `queued` row appears in the table
        beginPolling(envelope.job.id);
      } catch (cause) {
        // No HTTP status on the transport-throw branch: log 0, so one grep
        // finds every rejection and a missing argument never shifts the error
        // into the status slot.
        console.error('[studio/analyzer] upload rejected', 0, cause);
        setPending(false);
        setClientError(COPY.upload);
      }
    },
    [beginPolling, businessProfile, clearPoll, reportLanguage, router],
  );

  /**
   * The link path. Same envelope rules as the upload, same poll, same panel —
   * the only difference is a JSON body instead of a FormData, and that the
   * resolve + download happen on the worker before the 202 comes back.
   */
  const startLink = useCallback(
    async (url: string) => {
      setJob(null);
      clearPoll();
      setClientError(null);
      setUploadName(null);
      if (url.trim() === '') return;

      setPending(true);
      try {
        const res = await fetch('/api/studio/analyzer/jobs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            url: url.trim(),
            ...(businessProfile === null
              ? {}
              : { business_profile: businessProfile }),
            ...(reportLanguage === null
              ? {}
              : { report_language: reportLanguage }),
          }),
        });
        const body: unknown = await res.json().catch(() => null);
        const envelope = body as {
          ok?: unknown;
          job?: AnalyzerJob;
          error?: string;
        } | null;
        if (!res.ok || !envelope || envelope.ok !== true || !envelope.job) {
          console.error(
            '[studio/analyzer] link rejected',
            res.status,
            envelope?.error,
          );
          setPending(false);
          // Switch on the machine-facing diagnostic; render our own copy.
          setClientError(linkErrorCopy(envelope?.error));
          return;
        }
        setLink('');
        setJob(envelope.job);
        setPending(false);
        router.refresh();
        beginPolling(envelope.job.id);
      } catch (cause) {
        console.error('[studio/analyzer] link rejected', 0, cause);
        setPending(false);
        setClientError(linkErrorCopy(null));
      }
    },
    [beginPolling, businessProfile, clearPoll, reportLanguage, router],
  );

  const status = job?.status ?? null;
  const failed = status === 'failed';
  // Derived, never stored.
  const showPanel = pending || job !== null;
  const busy =
    pending || status === 'queued' || status === 'running' || status === 'done';

  // `|| null` and not `??`: a blank filename must collapse the line rather
  // than render an empty <p> that still spends a 16px flex gap.
  const panelName = (job?.filename ?? uploadName)?.trim() || null;

  const stepIndex = job?.step ? STEP_ORDER.indexOf(job.step) : -1;
  const showCaption = !failed && stepIndex < 0 && status !== 'done';

  const openPicker = () => fileInputRef.current?.click();

  return (
    <>
      {/* A SIBLING of the zone / panel branch, never a child of either: the
          panel replaces the zone and "Try again" must still open the picker.
          `hidden` (display:none) rather than sr-only — .click() works on a
          display:none input, and sr-only leaves a second unlabelled file
          control in the accessibility tree. */}
      <input
        ref={fileInputRef}
        type="file"
        accept={FILE_ACCEPT}
        tabIndex={-1}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void startUpload(file);
        }}
      />

      {showPanel ? (
        <section
          aria-label="Analysis progress"
          className="bg-surface-subtle border border-line rounded-2xl p-6 min-h-[240px] flex flex-col items-center justify-center gap-4 text-center"
        >
          {/* Four unlabelled dots for several minutes never say WHICH video is
              being analysed — and a user who re-picked the wrong file has no
              way to tell. The job's own filename wins once it exists, because
              the link path only learns its name from the worker. */}
          {panelName !== null && (
            <p className="max-w-full truncate text-label text-fg">
              {panelName}
            </p>
          )}
          <ol className="flex flex-col gap-3 text-left">
            {STEP_ORDER.map((id, index) => {
              const lit =
                status === 'done' || (stepIndex >= 0 && index <= stepIndex);
              return (
                <li
                  key={id}
                  aria-current={stepIndex === index ? 'step' : undefined}
                  className="flex items-center gap-3 text-body text-fg-muted"
                >
                  {/* The dot is the only thing that changes colour. */}
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full shrink-0 transition-colors duration-150 ease-out',
                      lit ? 'bg-white/[0.78]' : 'bg-white/[0.24]',
                    )}
                  />
                  {STEP_LABEL[id]}
                </li>
              );
            })}
          </ol>
          {showCaption && (
            <p className="text-caption text-fg-muted">
              {job === null ? 'Uploading video…' : 'Queued'}
            </p>
          )}
          {failed && <ErrorLine>{errorCopy(job?.error?.code)}</ErrorLine>}
          {failed && (
            <Button variant="secondary" size="md" onClick={openPicker}>
              Try again
            </Button>
          )}
        </section>
      ) : (
        <div className="flex flex-col gap-3">
          <form
            aria-label="Analyse a video link"
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void startLink(link);
            }}
          >
            <input
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={`Paste a ${LINK_HINT}`}
              aria-label={`Paste a ${LINK_HINT}`}
              className="flex-1 min-w-0 h-10 px-3 rounded-md bg-surface border border-line text-fg placeholder:text-fg-subtle transition-colors duration-150 ease-out"
            />
            <Button
              variant="secondary"
              size="md"
              type="submit"
              disabled={busy || link.trim() === ''}
            >
              Analyse link
            </Button>
          </form>
          <p className="text-caption text-fg-subtle">
            Or upload a file — a draft that isn’t posted yet can only be
            uploaded.
          </p>
          <section
            aria-label="Upload a video"
            onDragEnter={(e) => {
              e.preventDefault();
              dragDepth.current += 1;
              setDragActive(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              e.preventDefault();
              dragDepth.current -= 1;
              if (dragDepth.current <= 0) setDragActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              dragDepth.current = 0;
              setDragActive(false);
              if (busy) return;
              const file = e.dataTransfer.files?.[0];
              if (file) void startUpload(file);
            }}
            className={cn(
              'border border-dashed rounded-2xl min-h-[240px]',
              'flex flex-col items-center justify-center gap-4 px-6 text-center',
              'transition-colors duration-150 ease-out',
              dragActive
                ? 'border-white/[0.24] bg-white/[0.02]'
                : 'border-white/[0.12]',
            )}
          >
            {/* The zone is not a click target and not in the tab order, so
                without this line a pointer user has no signal that a 240px
                dashed box does anything. */}
            <p className="text-body text-fg-muted">Drop a video here</p>
            <Button variant="primary" size="md" onClick={openPicker}>
              Choose file
            </Button>
            {clientError !== null && <ErrorLine>{clientError}</ErrorLine>}
          </section>
          <p className="text-caption text-fg-muted">
            MP4, MOV, WebM or AVI. Up to 5 minutes.
          </p>
        </div>
      )}

      <section
        aria-labelledby="analyzer-history"
        className="flex flex-col gap-4"
      >
        <h2 id="analyzer-history" className="text-subsection text-fg">
          Past reports
        </h2>
        {historyUnavailable ? (
          <p className="text-body text-fg-muted">
            Past reports are unavailable right now.
          </p>
        ) : hasHistory ? (
          children
        ) : (
          <EmptyState
            size="sm"
            title="No reports yet"
            description="Analyse a video and it will show up here."
          >
            {/* Through `children`, not `action`: `action` renders a yellow
                <Link>, which cannot open a file picker and would put a second
                yellow primary on the screen. */}
            <Button
              variant="secondary"
              size="md"
              onClick={openPicker}
              disabled={busy}
            >
              Upload a video
            </Button>
          </EmptyState>
        )}
      </section>
    </>
  );
}
