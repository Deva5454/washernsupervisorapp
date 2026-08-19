-- Run this ONCE in Supabase SQL Editor. Adds everything the "Active Wash"
-- job-execution flow needs: a granular in-progress stepper, real
-- check-in verification (selfie + GPS), and per-job proof-of-work
-- photos. Safe to run more than once (every statement is idempotent).

-- ── jobs: granular execution stage, separate from the coarse status ──
-- status stays pending/in_progress/done/issue (used by the Jobs list);
-- execution_stage only matters once status = 'in_progress', tracking
-- where the washer actually is in the visit.
alter table jobs add column if not exists execution_stage text
  not null default 'assigned'
  check (execution_stage in ('assigned', 'en_route', 'arrived', 'washing', 'done'));

-- Customer phone, so the Call button has something real to act on. The
-- app never shows this number directly (see README's Access model) -
-- masking/connecting the call is your telephony operator's job; this
-- column is what you'd hand to their API.
alter table jobs add column if not exists customer_phone text;

-- ── attendance: real check-in verification ──────────────────────────
alter table attendance add column if not exists selfie_url text;
alter table attendance add column if not exists gps_lat double precision;
alter table attendance add column if not exists gps_lng double precision;
-- Set when a checked-in washer's location access is lost/revoked mid
-- shift - the trigger for the auto-logout-with-notification flow.
alter table attendance add column if not exists gps_lost_at timestamptz;

-- ── job_photos: proof-of-work photos (4 required directions, up to 4
--    more optional before/after) ────────────────────────────────────
create table if not exists job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  phase text not null default 'after' check (phase in ('before', 'after')),
  direction text not null check (direction in ('front', 'back', 'left', 'right')),
  photo_url text not null,
  created_at timestamptz default now(),
  unique (job_id, phase, direction)
);

alter table job_photos enable row level security;
drop policy if exists "anon_all_job_photos" on job_photos;
create policy "anon_all_job_photos" on job_photos for all to anon using (true) with check (true);

create index if not exists idx_job_photos_job on job_photos(job_id);

-- ── Storage: a public bucket for selfies + proof-of-work photos ─────
insert into storage.buckets (id, name, public)
values ('field-photos', 'field-photos', true)
on conflict (id) do nothing;

drop policy if exists "anon_upload_field_photos" on storage.objects;
create policy "anon_upload_field_photos" on storage.objects
  for insert to anon with check (bucket_id = 'field-photos');

drop policy if exists "anon_read_field_photos" on storage.objects;
create policy "anon_read_field_photos" on storage.objects
  for select to anon using (bucket_id = 'field-photos');

select 'migration applied' as result;
