/**
 * /studio/analyzer/[id] — the report. PRD 3 §6.5.
 *
 * This page does NOT poll. A queued or running job renders the static panel and
 * links back to /studio/analyzer, which is the one live-progress surface in the
 * product.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';

import { StudioLocked } from '@gitroom/frontend/components/studio/studio-locked';
import {
  BentoGrid,
  BentoItem,
} from '@gitroom/frontend/components/ui/bento-grid';
import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';
import { ImageWithFallback } from '@gitroom/frontend/components/ui/image-with-fallback';
import {
  SCORE_CARD_LABEL,
  SCORE_KEYS,
  SCORE_MAX,
  errorCopy,
  formatJobDate,
  formatTimecode,
  isCompleteResult,
  splitParagraphs,
  type AnalyzerJob,
  type ScoreKey,
} from '@gitroom/frontend/lib/analyzer-contract';
import { getJob } from '@gitroom/frontend/lib/analyzer';
import { getAuthContext, isStudioMember } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';

import { EmotionCurve } from './emotion-curve';
import { ScoreRadar } from './score-radar';
import { TranscriptPlayer } from './transcript-player';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Report — D3 Creator',
  robots: { index: false, follow: false },
};

/** The one permitted hand-written primary: `Button` cannot be an `<a download>`.
 *  empty-state.tsx's yellow, minus `font-medium` (§0.3) and the focus pair (§0.4). */
const DOWNLOAD_CTA =
  'inline-flex items-center justify-center gap-2 h-10 px-5 rounded-md text-label ' +
  'bg-brand text-fg-on-brand hover:bg-brand-300 transition-colors duration-150 ease-out';

const POSTER_BOX =
  'w-[160px] aspect-video rounded-xl border border-line shrink-0';

function ReportSection({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-subsection text-fg">
        {heading}
      </h2>
      {children}
    </section>
  );
}

/** §0.2's chart-card surface goes on the block's section, outside both chart
 *  components, so §6.6's no-data line sits on the same card as the chart it
 *  replaces. */
function ChartCard({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="bg-surface-subtle border border-line rounded-2xl p-6">
      {children}
    </div>
  );
}

export default async function AnalyzerReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const auth = await getAuthContext();
  if (!auth) redirect(`/login?redirectTo=/studio/analyzer/${id}`);
  if (!isStudioMember(auth)) return <StudioLocked />;

  const job = await getJob(auth.userId, id);
  if (job === null) notFound();

  const complete = job.status === 'done' && isCompleteResult(job.result);
  const result = complete
    ? (job.result as NonNullable<AnalyzerJob['result']>)
    : null;

  return (
    <div className="max-w-[1100px] mx-auto py-12 flex flex-col gap-12">
      {/* The header always renders — in EVERY state. A user on a failed job
          must still be able to see which file failed and get back. */}
      <header className="flex flex-col gap-4">
        {/* w-fit is load-bearing: without it the anchor stretches the full
            1100px and a click anywhere on that row navigates away. */}
        <Link
          href="/studio/analyzer"
          className="w-fit text-caption text-fg-muted hover:text-fg transition-colors duration-150 ease-out"
        >
          ← Video Analyzer
        </Link>
        {/* sm:items-center is not optional: the default `stretch` grows the
            poster to the height of the right slot and top-anchors the h1. */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <ImageWithFallback
            src={job.thumbnail_url}
            alt=""
            loading="eager"
            className={`${POSTER_BOX} object-cover`}
            fallback={
              <div
                className={`${POSTER_BOX} bg-surface flex items-center justify-center text-caption text-fg-subtle`}
              >
                No preview
              </div>
            }
          />
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <h1 className="text-section text-fg break-words">{job.filename}</h1>
            <p className="text-body-sm text-fg-muted">
              {/* When duration_seconds is null, the duration AND the separator
                  are dropped — never a dangling · */}
              {job.duration_seconds === null
                ? formatJobDate(job.created_at)
                : `${formatJobDate(job.created_at)} · ${formatTimecode(job.duration_seconds)}`}
            </p>
          </div>
          {result !== null && (
            <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
              <p className="text-display-2 text-fg tabular-nums leading-none">
                {result.overall_score}
              </p>
              <p className="text-caption text-fg-subtle">
                Overall / {SCORE_MAX}
              </p>
              {job.report_url && (
                <a href={job.report_url} download className={DOWNLOAD_CTA}>
                  Download
                </a>
              )}
            </div>
          )}
        </div>
      </header>

      {result === null ? (
        <StatusPanel job={job} />
      ) : (
        <>
          <ReportSection id="analyzer-breakdown" heading="What the analyst saw">
            {/* `report_text` is the written breakdown PRD 1 §1 promises as an
                output. Before this it existed ONLY inside the downloaded .txt,
                so the page showed six numbers and no reasoning. */}
            <div className="bg-surface-subtle border border-line rounded-2xl p-6 flex flex-col gap-4">
              {splitParagraphs(result.report_text).map((para) => (
                <p key={para.slice(0, 48)} className="text-body text-fg-muted">
                  {para}
                </p>
              ))}
            </div>
          </ReportSection>

          <ReportSection id="analyzer-scores" heading="Scores">
            <BentoGrid gap="md">
              {SCORE_KEYS.map((key) => (
                <BentoItem
                  key={key}
                  colSpan={4}
                  tabletColSpan={3}
                  className="h-full bg-surface-subtle border border-line rounded-2xl p-6 flex flex-col gap-2"
                >
                  <h3 className="text-heading text-fg">
                    {SCORE_CARD_LABEL[key]}
                  </h3>
                  <p className="text-section text-fg tabular-nums leading-none">
                    {result.scores[key].score}
                    <span className="text-body-sm text-fg-subtle">
                      {' '}
                      / {SCORE_MAX}
                    </span>
                  </p>
                  {/* Model-written prose of arbitrary length, not one line.
                      NOT clamped: the clamp's only escape was a `title`
                      tooltip, which no touch device shows, so on a phone the
                      reasoning behind every score was simply unreadable. The
                      cards are `h-full` in a bento grid and already absorb
                      ragged heights. */}
                  <p className="text-body text-fg-muted">
                    {result.scores[key].why}
                  </p>
                  {/* The moment the score is based on. Showing it is what lets
                      a creator argue with the number instead of just seeing it
                      (PRD 1 §11's "users say a score is wrong" mitigation). */}
                  {result.scores[key].evidence !== '' && (
                    <p className="mt-auto pt-2 border-t border-line text-caption text-fg-subtle">
                      {result.scores[key].evidence}
                    </p>
                  )}
                </BentoItem>
              ))}
            </BentoGrid>
          </ReportSection>

          <ReportSection id="analyzer-radar" heading="Shape of the video">
            <ChartCard>
              <ScoreRadar
                scores={
                  Object.fromEntries(
                    SCORE_KEYS.map((k) => [k, result.scores[k].score]),
                  ) as Record<ScoreKey, number>
                }
              />
            </ChartCard>
          </ReportSection>

          <ReportSection id="analyzer-curve" heading="Emotion curve">
            <ChartCard>
              <EmotionCurve
                samples={result.emotion_curve}
                durationSeconds={job.duration_seconds}
              />
            </ChartCard>
          </ReportSection>

          <ReportSection id="analyzer-transcript" heading="Transcript">
            <TranscriptPlayer
              videoSrc={job.video_url}
              segments={result.transcript}
            />
          </ReportSection>
        </>
      )}
    </div>
  );
}

function StatusPanel({ job }: { job: AnalyzerJob }): ReactElement {
  const back = { href: '/studio/analyzer', label: 'Back to Video Analyzer' };

  if (job.status === 'queued' || job.status === 'running') {
    return (
      <EmptyState
        size="lg"
        title="Still analysing"
        description="This report isn't ready yet — analysis usually takes a few minutes."
        action={{ href: '/studio/analyzer', label: 'See progress' }}
      />
    );
  }

  if (job.status === 'failed') {
    return (
      <EmptyState
        size="lg"
        title="This analysis failed"
        description={errorCopy(job.error?.code)}
        action={back}
      />
    );
  }

  if (job.status === 'done') {
    return (
      <EmptyState
        size="lg"
        title="This report can't be displayed"
        description="The analysis finished but the scores came back incomplete."
        action={back}
      />
    );
  }

  // Any other value is a service bug: render the `internal` copy — NOT
  // errorCopy(job.error?.code), which would put a stale, unrelated sentence
  // under an unrecognised status.
  console.error('[studio/analyzer] unrecognised job status', job.status);
  return (
    <EmptyState
      size="lg"
      title="This analysis failed"
      description={errorCopy(null)}
      action={back}
    />
  );
}
