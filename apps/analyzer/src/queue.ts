/**
 * Jobs run ONE AT A TIME, FIFO by `created_at` — PRD 1 §8.5.
 *
 * This file owns §8.5's "Timeout is an abort, not a label": the 15-minute clock,
 * the abort, the re-read, and the two-file intermediate cleanup. `pipeline.ts`
 * deliberately writes no terminal status once the signal has fired, so the
 * transition below is always reachable.
 */

import fs from 'node:fs/promises';

import { JOB_TIMEOUT_MS } from './config';
import { runPipeline } from './pipeline';
import {
  interruptedJobs,
  jobPath,
  nextQueuedJob,
  patchJob,
  readJob,
  type StoredJob,
} from './store';

const nowIso = () => new Date().toISOString();

let running = false;

/**
 * The wake-up has no lost-wakeup race: a job uploaded while the loop is between
 * its last empty queue check and clearing its "running" flag must still start.
 * The flag is cleared FIRST, then the queue is re-checked; the flag is never
 * held across the check.
 */
export function wake(): void {
  if (running) return;
  running = true;
  void drain();
}

async function drain(): Promise<void> {
  try {
    for (;;) {
      const job = await nextQueuedJob();
      if (job !== null) {
        await runJob(job);
        continue;
      }
      running = false; // clear FIRST
      const late = await nextQueuedJob(); // then re-check
      if (late === null) return;
      if (running) return; // a wake() during the re-check already took over
      running = true;
    }
  } catch (cause) {
    console.error('[analyzer] queue drain failed', cause);
    running = false;
  }
}

async function runJob(job: StoredJob): Promise<void> {
  // The clock starts when the worker STARTS the job, not at upload and not at
  // enqueue. Time spent `queued` does not count against it.
  await patchJob(job.id, {
    status: 'running',
    step: 'compressing',
    started_at: nowIso(),
  });

  const controller = new AbortController();
  let expiryWork: Promise<void> | null = null;
  const pipelinePromise = runPipeline(job.id, controller.signal);

  const timer = setTimeout(() => {
    expiryWork = handleExpiry(job.id, controller, pipelinePromise);
  }, JOB_TIMEOUT_MS);

  await pipelinePromise;
  clearTimeout(timer);
  // The timer can fire in the window between the pipeline's terminal patch and
  // clearTimeout. Let that work finish before the next job touches the disk.
  if (expiryWork !== null) await expiryWork;
}

async function handleExpiry(
  jobId: string,
  controller: AbortController,
  pipelinePromise: Promise<void>,
): Promise<void> {
  controller.abort(); // 1 — a no-op on a settled pipeline
  await pipelinePromise; // 2

  const fresh = await readJob(jobId); // 3
  if (fresh === null) return;
  // 4 — a job that already reached a terminal status keeps it. A finished
  // analysis is never overwritten by a clock: no deletes, and no write at all.
  if (fresh.status !== 'queued' && fresh.status !== 'running') return;

  // Best-effort, never fatal. `audio.mp3` always; `compressed.mp4` only when the
  // RE-READ `compressed_bytes` is still null — the encode never finished and the
  // file is a truncated fragment. A completed one is kept, because `video_url`
  // already points at it.
  await fs
    .rm(jobPath(jobId, 'audio.mp3'), { force: true })
    .catch(() => undefined);
  if (fresh.compressed_bytes === null) {
    await fs
      .rm(jobPath(jobId, 'compressed.mp4'), { force: true })
      .catch(() => undefined);
  }

  await patchJob(jobId, {
    status: 'failed',
    step: null,
    error: {
      code: 'timeout',
      message: 'the 15 minute processing budget was exhausted',
    },
    result: null,
    finished_at: nowIso(),
  });
}

/**
 * §8.5. On restart, any job in a non-terminal, non-`queued` state is written
 * `failed` with `interrupted` — its FFmpeg child died with the process and it
 * can never finish. `queued` jobs survive and are picked up.
 *
 * Recovery reads `job.json` only; `worker.json` is not consulted and its absence
 * is not an error.
 */
export async function recoverInterruptedJobs(): Promise<number> {
  const stranded = await interruptedJobs();
  for (const job of stranded) {
    await patchJob(job.id, {
      status: 'failed',
      step: null,
      error: {
        code: 'interrupted',
        message: 'the worker restarted while the job was running',
      },
      result: null,
      finished_at: nowIso(),
    });
  }
  return stranded.length;
}
