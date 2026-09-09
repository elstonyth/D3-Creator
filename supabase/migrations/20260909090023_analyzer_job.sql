-- analyzer_job — the Video Analyzer's job store, phase 2 (PRD 1 §8.2).
--
-- Phase 1 kept one job.json per job on a laptop disk behind a loopback Express
-- worker, and production had no worker at all: every /studio/analyzer request
-- answered 503 from 2026-08-30 until this migration. The app runs on Vercel,
-- which has no disk that outlives a request, so the row is the document and
-- the media lives in the private `analyzer` Storage bucket beside it.
--
-- Columns mirror PRD 1 §8.7.9's AnalyzerJob one-to-one, plus the four the
-- worker used to keep in worker.json / on disk (source_ext, has_audio,
-- business_profile, the three object paths). `status` gains the one id PRD 1
-- §8.8.10 reserved for the hosted phase: `awaiting_upload` — the row exists,
-- the bytes are still in the browser. It is never serialised to a client.

create table public.analyzer_job (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  status           text not null
                   check (status in ('awaiting_upload', 'queued', 'running', 'done', 'failed')),
  step             text
                   check (step in ('compressing', 'extracting_audio', 'transcribing', 'analyzing')),
  error            jsonb,
  report_language  text not null check (report_language in ('en', 'zh', 'ms')),
  -- Display only. Never a path: the object paths below are built from `id`.
  filename         text not null check (char_length(filename) between 1 and 512),
  duration_seconds numeric(8, 1),
  source_bytes     bigint not null check (source_bytes >= 0),
  compressed_bytes bigint,
  source_ext       text check (source_ext in ('.mp4', '.mov', '.webm', '.avi')),
  has_audio        boolean,
  -- The already-rendered profile block (PRD 2 §10A.6), bounded as the worker bounded it.
  business_profile text check (char_length(business_profile) <= 3075),
  video_path       text,
  thumbnail_path   text,
  report_path      text,
  result           jsonb,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  updated_at       timestamptz not null default now()
);

-- The history read: one user's rows, newest first, capped at 50.
create index analyzer_job_user_created_idx
  on public.analyzer_job (user_id, created_at desc);

-- The shared trigger from 20260527135229_init_v1_core_tables.sql. `updated_at`
-- is what tells a stale `running` row from a live one after a function dies
-- mid-job (apps/frontend/src/lib/analyzer-store.ts).
create trigger analyzer_job_updated_at before update on public.analyzer_job
  for each row execute function public.set_updated_at();

-- Privileges, written out like 20260826000000_chat_playbook.sql. Every read and
-- write goes through the service-role client on the server; the browser never
-- touches this table through PostgREST. RLS on with NO policies denies every
-- role that respects it, and the revoke is the second lock.
revoke all on table public.analyzer_job from anon, authenticated;
alter table public.analyzer_job enable row level security;

comment on table public.analyzer_job is
  'Video Analyzer jobs (PRD 1 §8.7.9). service_role only — read and written by apps/frontend/src/lib/analyzer-store.ts.';

-- The private bucket the source upload and the three outputs live in. Objects
-- are keyed `<job id>/<name>` and reached only through signed URLs minted by
-- the service-role client; no storage policy exists and none may be added.
-- The per-bucket limit mirrors MAX_UPLOAD_BYTES; the project's global upload
-- limit (dashboard, Storage settings) still caps it from above.
insert into storage.buckets (id, name, public, file_size_limit)
values ('analyzer', 'analyzer', false, 2000000000)
on conflict (id) do nothing;
