/**
 * /studio/analyzer — PRD 3 §6.1, §6.2, §6.4.
 *
 * The seam: this Server Component performs the `listJobs` read and renders the
 * <table> itself, then hands it to the island through `children`. The island
 * owns the three-way branch (rows / empty / unavailable) and the one control
 * that needs its `busy` flag.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { StudioLocked } from '@gitroom/frontend/components/studio/studio-locked';
import { Badge } from '@gitroom/frontend/components/ui/badge';
import { ImageWithFallback } from '@gitroom/frontend/components/ui/image-with-fallback';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import {
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@gitroom/frontend/components/ui/table';
import {
  formatJobDate,
  type AnalyzerJobSummary,
  type JobStatus,
} from '@gitroom/frontend/lib/analyzer-contract';
import { listJobs } from '@gitroom/frontend/lib/analyzer';
import { getAuthContext, isStudioMember } from '@gitroom/frontend/lib/auth';
import type { BusinessProfile } from '@gitroom/frontend/lib/business-profile';
import { renderProfileBlock } from '@gitroom/frontend/lib/chat-prompt';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';

import AnalyzerWorkspace from './analyzer-workspace';

export const dynamic = 'force-dynamic'; // per-user, auth-dependent, never cacheable
export const metadata: Metadata = {
  title: 'Video Analyzer — D3 Creator',
  robots: { index: false, follow: false }, // overrides the (public) layout's index: true
};

/**
 * What a row with no score says instead of a bare em dash.
 *
 * Before this, a job that FAILED and a job still RUNNING rendered identically —
 * `—` in the Score cell and the same live "Open" link — so the list could not
 * tell you which of your past uploads had died. `status` was already on
 * `AnalyzerJobSummary`; it was simply never shown.
 *
 * `done` is deliberately absent. A done job with a null score is an incomplete
 * result, and "Done" next to no number reads as a display bug; the em dash is
 * the honest fallback and §6.5's report page explains it.
 */
const ROW_STATUS_LABEL: Partial<Record<JobStatus, string>> = {
  queued: 'Queued',
  running: 'Analysing',
  failed: 'Failed',
};

const THUMB = 'h-9 w-16 min-w-16 rounded-md object-cover';

function HistoryTable({ rows }: { rows: AnalyzerJobSummary[] }): ReactElement {
  return (
    <TableWrap>
      {/* 700, not §6.4's 560: five columns at their real widths — 96px
          thumbnail + 280px name cap + date + result + Open — clip into each
          other at 560, and the Result column's status words made it worse.
          TableWrap is the overflow-x box, so a narrow screen scrolls the
          table and never the page. */}
      <Table className="min-w-[700px]">
        <thead>
          <tr>
            {/* The column MUST reserve its width: auto table-layout gives an
                image column no intrinsic size, so `w-16` on the <img> lost and
                thumbnails rendered ~1.5px wide. 64px tile + px-4 both sides. */}
            <Th className="w-[96px]">
              <span className="sr-only">Thumbnail</span>
            </Th>
            <Th>Video</Th>
            <Th>Analysed</Th>
            {/* "Result", not "Score": the cell below carries a status word for
                every row that has no number yet. */}
            <Th numeric>Result</Th>
            <Th numeric>
              <span className="sr-only">Open report</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Tr key={row.id}>
              <Td>
                {/* src is already the same-origin path (§5.9.3) — never built
                    by hand. A null src, a 404 and a blocked load all reach the
                    same fallback tile. */}
                <ImageWithFallback
                  src={row.thumbnail_url}
                  alt=""
                  className={THUMB}
                  fallback={
                    <div
                      className={`${THUMB} bg-surface-subtle border border-line`}
                    />
                  }
                />
              </Td>
              <Td>
                {/* `truncate` does nothing on a bare <td> — the span and its
                    max-w are load-bearing. */}
                <span className="block max-w-[280px] truncate">
                  {row.filename}
                </span>
              </Td>
              <Td className="tnum whitespace-nowrap text-fg-muted">
                {formatJobDate(row.created_at)}
              </Td>
              <Td numeric className="whitespace-nowrap">
                {row.overall_score === null ? (
                  ROW_STATUS_LABEL[row.status] === undefined ? (
                    <span className="text-fg-subtle">—</span>
                  ) : (
                    // Neutral, never brand: yellow on this screen belongs to
                    // "Choose file" alone.
                    <Badge tone="muted">{ROW_STATUS_LABEL[row.status]}</Badge>
                  )
                ) : (
                  <>
                    <span>{row.overall_score.toFixed(1)}</span>
                    <span className="text-fg-subtle">/10</span>
                  </>
                )}
              </Td>
              <Td numeric>
                <Link
                  href={`/studio/analyzer/${row.id}`}
                  className="text-fg-muted hover:text-fg transition-colors duration-150 ease-out"
                >
                  Open
                  <span className="sr-only"> {row.filename} report</span>
                </Link>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

export default async function VideoAnalyzerPage(): Promise<ReactElement> {
  const auth = await getAuthContext();
  if (!auth) redirect('/login?redirectTo=/studio/analyzer');
  if (!isStudioMember(auth)) return <StudioLocked />;

  // Amendment 1 Part D. The ONE serialiser (PRD 2 §10A.6) renders it here; the
  // worker never reads Supabase and never learns the column set.
  //
  // A profile outage must not block uploading, the same rule the history read
  // below already follows — the analysis simply runs without the context.
  let businessProfile: string | null = null;
  // Owner request 2026-08-24. Settings → Reply language, mapped to the worker's
  // two-letter `report_language`. Stays null when the user has not chosen one,
  // and the worker's own 'en' default applies — mapping null to 'en' here would
  // freeze that default into the request and make the worker's unchangeable.
  let reportLanguage: 'en' | 'zh' | null = null;
  try {
    const supabase = await getSupabaseRoute();
    const { data, error } = await supabase
      .from('user_profile')
      .select('*')
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .maybeSingle();
    // PostgREST RESOLVES with `{ data: null, error }` — it does not throw — so
    // without this the catch below never fires and a failed read is
    // indistinguishable from "no profile": every analysis silently drops its
    // business context with no log line anywhere.
    if (error) console.error('[studio/analyzer] profile read failed', error);
    const block = renderProfileBlock(data as BusinessProfile | null);
    // `NO PROFILE ON FILE` is the chat guardrail's sentinel and means nothing
    // to the analyzer prompt: send null instead of a line saying there is none.
    businessProfile = data === null ? null : block;
    // `REPLY_LANGUAGES` has two members and so does this map. A third value
    // added to the column with no entry here falls to null, which is the
    // worker's default rather than a crash — but it is also silent, so add the
    // entry in the same change.
    reportLanguage =
      { english: 'en' as const, chinese: 'zh' as const }[
        (data as BusinessProfile | null)?.reply_language ?? ''
      ] ?? null;
  } catch (cause) {
    console.error('[studio/analyzer] profile read failed', cause);
  }

  let rows: AnalyzerJobSummary[] = [];
  let historyUnavailable = false;
  try {
    rows = await listJobs(auth.userId);
  } catch (cause) {
    // A history outage may not 500 the page or block uploading — a deliberate
    // divergence from /classes, where `if (error) throw error` fails closed.
    console.error('[studio/analyzer] listJobs failed', cause);
    historyUnavailable = true;
  }

  // Not `rows[0]` gated on being non-terminal: a user whose newest job failed
  // while an earlier one is still running must still see the running one
  // resume. A terminal job is never restored into the panel.
  const initialJob =
    rows.find((r) => r.status === 'queued' || r.status === 'running') ?? null;

  return (
    <Section space="md">
      <Container className="flex flex-col gap-10">
        <header className="max-w-prose flex flex-col gap-3">
          <h1 className="text-display-2 text-fg">Video Analyzer.</h1>
          <p className="text-body-lg text-fg-muted">
            Upload a short video, or paste a link to one you have posted. You
            get six scores out of ten, the reasoning behind each, and a
            transcript you can jump around in.
          </p>
          {/* Amendment 1's open item: the profile silently steered every
              analysis and nothing on this page said so. One caption, only when
              a profile is actually in play — a user without one sees nothing. */}
          {businessProfile !== null && (
            <p className="text-caption text-fg-subtle">
              Scored against your business profile — edit it in{' '}
              <Link
                href="/studio/settings"
                className="underline underline-offset-4 hover:text-fg transition-colors duration-150 ease-out"
              >
                Settings
              </Link>
              .
            </p>
          )}
        </header>
        <AnalyzerWorkspace
          initialJob={initialJob}
          businessProfile={businessProfile}
          reportLanguage={reportLanguage}
          hasHistory={rows.length > 0}
          historyUnavailable={historyUnavailable}
        >
          <HistoryTable rows={rows} />
        </AnalyzerWorkspace>
      </Container>
    </Section>
  );
}
