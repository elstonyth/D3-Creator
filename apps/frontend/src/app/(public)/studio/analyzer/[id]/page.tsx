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
import { Card } from '@gitroom/frontend/components/ui/card';
import {
  EmptyState,
  primaryCta,
} from '@gitroom/frontend/components/ui/empty-state';
import { ImageWithFallback } from '@gitroom/frontend/components/ui/image-with-fallback';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
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

const POSTER_BOX =
  'w-full sm:w-[168px] aspect-video rounded-xl border border-line shrink-0';

function ReportSection({
  id,
  heading,
  scope,
  children,
}: {
  id: string;
  heading: string;
  /** One line saying what the block covers. The #1 confusion is scope. */
  scope?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-subsection text-fg">
          {heading}
        </h2>
        {scope ? <p className="text-caption text-fg-subtle">{scope}</p> : null}
      </div>
      {children}
    </section>
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
    <Section space="md">
      <Container className="flex flex-col gap-12">
        {/* The header always renders — in EVERY state. A user on a failed job
            must still be able to see which file failed and get back. */}
        <header className="flex flex-col gap-5">
          {/* w-fit is load-bearing: without it the anchor stretches the full
              container and a click anywhere on that row navigates away. */}
          <Link
            href="/studio/analyzer"
            className="w-fit text-caption text-fg-muted hover:text-fg transition-colors duration-150 ease-out"
          >
            ← Video Analyzer
          </Link>
          {/* sm:items-center is not optional: the default `stretch` grows the
              poster to the height of the right slot and top-anchors the h1. */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
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
              <h1 className="text-section text-fg break-words">
                {job.filename}
              </h1>
              <p className="tnum text-body-sm text-fg-muted">
                {/* When duration_seconds is null, the duration AND the separator
                    are dropped — never a dangling · */}
                {job.duration_seconds === null
                  ? formatJobDate(job.created_at)
                  : `${formatJobDate(job.created_at)} · ${formatTimecode(job.duration_seconds)}`}
              </p>
            </div>
            {result !== null && (
              <div className="flex items-end sm:flex-col sm:items-end gap-4 sm:gap-3 shrink-0 border-t sm:border-t-0 sm:border-l border-line-subtle pt-5 sm:pt-0 sm:pl-6">
                <div className="flex flex-col gap-1">
                  <p className="text-micro uppercase text-fg-subtle">Overall</p>
                  <p className="tnum text-metric-lg text-fg leading-none">
                    {result.overall_score}
                    <span className="text-body-sm font-normal text-fg-subtle">
                      {' '}
                      / {SCORE_MAX}
                    </span>
                  </p>
                </div>
                {/* `Button` cannot be an `<a download>`, so the shared
                    primaryCta string is what keeps this identical to every
                    other yellow CTA. It is this screen's only yellow. */}
                {job.report_url && (
                  <a
                    href={job.report_url}
                    download
                    className={`${primaryCta} ml-auto sm:ml-0`}
                  >
                    Download report
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
            <ReportSection
              id="analyzer-breakdown"
              heading="What the analyst saw"
              scope="The written breakdown behind the six scores below."
            >
              {/* `report_text` is the written breakdown PRD 1 §1 promises as an
                  output. Before this it existed ONLY inside the downloaded .txt,
                  so the page showed six numbers and no reasoning. */}
              <Card tone="subtle" padding="lg" className="flex flex-col gap-4">
                {/* Keyed by position: this is model-written prose, so two
                    paragraphs can legitimately share their opening. */}
                {splitParagraphs(result.report_text).map((para, index) => (
                  <p
                    key={index}
                    className="max-w-prose text-body text-fg-muted"
                  >
                    {para}
                  </p>
                ))}
              </Card>
            </ReportSection>

            <ReportSection
              id="analyzer-scores"
              heading="Scores"
              scope={`Six dimensions, each out of ${SCORE_MAX}, for this video only.`}
            >
              {/* A plain grid. `h-full` on the card plus `items-stretch` from
                  the grid default keeps a row level when one `why` runs long. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {SCORE_KEYS.map((key) => (
                  <Card
                    key={key}
                    tone="subtle"
                    padding="md"
                    className="h-full flex flex-col gap-2"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-heading text-fg">
                        {SCORE_CARD_LABEL[key]}
                      </h3>
                      <p className="tnum text-metric text-fg leading-none shrink-0">
                        {result.scores[key].score}
                        <span className="text-body-sm font-normal text-fg-subtle">
                          {' '}
                          / {SCORE_MAX}
                        </span>
                      </p>
                    </div>
                    {/* Model-written prose of arbitrary length, not one line.
                        NOT clamped: the clamp's only escape was a `title`
                        tooltip, which no touch device shows, so on a phone the
                        reasoning behind every score was simply unreadable. */}
                    <p className="text-body text-fg-muted">
                      {result.scores[key].why}
                    </p>
                    {/* The moment the score is based on. Showing it is what lets
                        a creator argue with the number instead of just seeing it
                        (PRD 1 §11's "users say a score is wrong" mitigation). */}
                    {result.scores[key].evidence !== '' && (
                      <p className="mt-auto pt-3 border-t border-line-subtle text-caption text-fg-subtle">
                        {result.scores[key].evidence}
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            </ReportSection>

            <ReportSection
              id="analyzer-charts"
              heading="Shape of the video"
              scope="The same six scores as a profile, and how the emotional pitch moves from start to end."
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card tone="subtle" padding="md">
                  <ScoreRadar
                    scores={
                      Object.fromEntries(
                        SCORE_KEYS.map((k) => [k, result.scores[k].score]),
                      ) as Record<ScoreKey, number>
                    }
                  />
                </Card>
                <Card tone="subtle" padding="md">
                  <EmotionCurve
                    samples={result.emotion_curve}
                    durationSeconds={job.duration_seconds}
                  />
                </Card>
              </div>
            </ReportSection>

            <ReportSection
              id="analyzer-transcript"
              heading="Transcript"
              scope={
                job.video_url === null
                  ? 'Spoken words with their timecodes.'
                  : 'Spoken words with their timecodes. Select a line to jump the player there.'
              }
            >
              <TranscriptPlayer
                videoSrc={job.video_url}
                segments={result.transcript}
              />
            </ReportSection>
          </>
        )}
      </Container>
    </Section>
  );
}

function StatusPanel({ job }: { job: AnalyzerJob }): ReactElement {
  const back = { href: '/studio/analyzer', label: 'Back to Video Analyzer' };

  if (job.status === 'queued' || job.status === 'running') {
    return (
      <EmptyState
        size="lg"
        title="Still analysing"
        description="This report isn't ready yet — analysis usually takes a few minutes. Progress is shown on the analyzer page."
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
        description="The analysis finished but the scores came back incomplete. Uploading the video again is the fastest fix."
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
