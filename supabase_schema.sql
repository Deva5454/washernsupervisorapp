-- ============================================================
-- CleanCar Field App — Supabase Schema v3 (no-login + active wash)
-- Paste ENTIRE file into: Supabase Dashboard → SQL Editor → New Query → Run
-- Expected: "Success. No rows returned."
--
-- This app has no login screen (see README.md's "Access model" section)
-- — every request runs as the Supabase anon key, and profiles are plain
-- rows with no tie to a Supabase Auth account. That means EVERY visitor
-- with the app's URL can read and write EVERYONE's data. Deliberate
-- tradeoff for a small internal single-team tool — not appropriate for
-- sensitive per-employee data or multiple unrelated teams sharing one
-- deployment.
--
-- Already have a project running an earlier version of this schema?
-- This file's `create table if not exists` / `alter table add column
-- if not exists` won't retroactively fix an already-created table in
-- every case. Run the matching migration instead:
--   - supabase_no_login_migration.sql  (had the old auth-tied profiles)
--   - supabase_active_wash_migration.sql (had v2 — no-login, but no
--     Active Wash / job_photos / check-in-verification columns yet)
-- ============================================================

create extension if not exists "pgcrypto";

-- ── Tables ───────────────────────────────────────────────────

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null default 'New User',
  role text not null default 'washer' check (role in ('washer', 'supervisor')),
  phone text,
  zone text,
  avatar_url text,
  created_at timestamptz default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid references profiles(id) on delete set null,
  sequence_number int not null default 1,
  scheduled_time text not null,
  customer_name text not null,
  customer_phone text,
  vehicle_make text not null,
  vehicle_reg text not null,
  package_name text not null,
  area text not null,
  city text not null default 'Pune',
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'issue')),
  -- Granular position within an in-progress visit — only meaningful
  -- once status = 'in_progress'; the Jobs list only cares about status.
  execution_stage text not null default 'assigned'
    check (execution_stage in ('assigned', 'en_route', 'arrived', 'washing', 'done')),
  is_cover boolean not null default false,
  job_date date not null default current_date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid not null references profiles(id) on delete cascade,
  date date not null default current_date,
  status text not null default 'present' check (status in ('present', 'absent', 'late', 'week_off')),
  check_in_time timestamptz,
  check_out_time timestamptz,
  -- Real check-in verification: a selfie and the GPS fix taken at the
  -- moment of check-in.
  selfie_url text,
  gps_lat double precision,
  gps_lng double precision,
  -- Set the moment a checked-in washer's location access is lost/revoked
  -- mid-shift — what the auto-logout-with-notification flow watches for.
  gps_lost_at timestamptz,
  created_at timestamptz default now(),
  unique (washer_id, date)
);

-- Proof-of-work photos for a job: 4 required directions, plus up to 4
-- more optional before/after shots (8 max per job).
create table if not exists job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  phase text not null default 'after' check (phase in ('before', 'after')),
  direction text not null check (direction in ('front', 'back', 'left', 'right')),
  photo_url text not null,
  created_at timestamptz default now(),
  unique (job_id, phase, direction)
);

create table if not exists stock_items (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid not null references profiles(id) on delete cascade,
  material_name text not null,
  issued_qty numeric not null default 0,
  remaining_qty numeric not null default 0,
  unit text not null default 'unit',
  reorder_level numeric not null default 0,
  updated_at timestamptz default now()
);

create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid not null references profiles(id) on delete cascade,
  label text not null,
  amount numeric not null default 0,
  payout_date date not null default current_date,
  created_at timestamptz default now()
);

create table if not exists issues (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid not null references profiles(id) on delete cascade,
  title text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create table if not exists audits (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid not null references profiles(id) on delete cascade,
  vehicle_make text not null,
  vehicle_reg text not null,
  audit_status text not null default 'pending' check (audit_status in ('pending', 'completed')),
  completed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  zone text,
  message text not null,
  created_at timestamptz default now()
);

-- ── Row Level Security — open to the anon key ───────────────────
-- No login means no auth.uid() to scope by, so every policy here is a
-- flat "yes" for anyone holding the anon key. See the file header for
-- what this trades away.

alter table profiles enable row level security;
alter table jobs enable row level security;
alter table attendance enable row level security;
alter table stock_items enable row level security;
alter table payouts enable row level security;
alter table issues enable row level security;
alter table audits enable row level security;
alter table alerts enable row level security;
alter table job_photos enable row level security;

create policy "anon_all_profiles"   on profiles      for all to anon using (true) with check (true);
create policy "anon_all_jobs"       on jobs          for all to anon using (true) with check (true);
create policy "anon_all_attendance" on attendance     for all to anon using (true) with check (true);
create policy "anon_all_stock"      on stock_items    for all to anon using (true) with check (true);
create policy "anon_all_payouts"    on payouts        for all to anon using (true) with check (true);
create policy "anon_all_issues"     on issues         for all to anon using (true) with check (true);
create policy "anon_all_audits"     on audits         for all to anon using (true) with check (true);
create policy "anon_all_alerts"     on alerts         for all to anon using (true) with check (true);
create policy "anon_all_job_photos" on job_photos     for all to anon using (true) with check (true);

-- Storage: a public bucket for check-in selfies + job proof-of-work photos.
insert into storage.buckets (id, name, public)
values ('field-photos', 'field-photos', true)
on conflict (id) do nothing;

create policy "anon_upload_field_photos" on storage.objects
  for insert to anon with check (bucket_id = 'field-photos');
create policy "anon_read_field_photos" on storage.objects
  for select to anon using (bucket_id = 'field-photos');

-- ── Indexes ──────────────────────────────────────────────────
create index if not exists idx_jobs_washer_date on jobs(washer_id, job_date);
create index if not exists idx_attendance_washer_date on attendance(washer_id, date);
create index if not exists idx_stock_washer on stock_items(washer_id);
create index if not exists idx_payouts_washer on payouts(washer_id, payout_date desc);
create index if not exists idx_audits_washer on audits(washer_id);
create index if not exists idx_job_photos_job on job_photos(job_id);

-- ── Seed the two people the app needs to show something real ───
-- Same names as the reference prototype. Safe to run more than once.
insert into profiles (full_name, role, zone)
select 'Ravi Kumar', 'washer', 'Zone 4'
where not exists (select 1 from profiles where full_name = 'Ravi Kumar');

insert into profiles (full_name, role, zone)
select 'Priya Sharma', 'supervisor', 'Zone 4'
where not exists (select 1 from profiles where full_name = 'Priya Sharma');

-- Done: 9 tables, 9 RLS policies, 1 storage bucket, 6 indexes, 2 seeded profiles.
