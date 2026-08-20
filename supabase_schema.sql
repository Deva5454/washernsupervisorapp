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
--   - supabase_urgent_cloth_migration.sql (had v3, missing is_urgent /
--     cloth_limit / cloth_exchanges)
--   - supabase_supervisor_ops_migration.sql (had v4, missing issues.category
--     / issues.item_name for supervisor incident reports)
--   - supabase_washer_ops_migration.sql (had v5, missing vehicle_type /
--     payment_* on jobs, gps_unlock_approved_at on attendance, and the
--     cloth_units table)
--   - supabase_gaps_migration.sql (had v6, missing issues.job_id /
--     photo_url / pre_damage category, jobs.override_reason, and the
--     sos_alerts / notifications / advance_requests / cover_requests /
--     cash_deposits tables)
--   - supabase_leave_audit_migration.sql (had v7, missing the scored-audit
--     columns on audits, and the leave_balances / leave_requests tables)
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
  -- Per-washer cap on new cloths receivable in one hand-over. Owned by
  -- the City Manager role, which lives in a different (ERP) web app —
  -- this app only reads and respects the value, never writes it. Null
  -- means "no limit enforced."
  cloth_limit integer,
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
  -- No UI in this app sets this yet — exists so the column is real and
  -- ready for whatever system does set it.
  is_urgent boolean not null default false,
  -- Weighting for the daily unit quota (4-wheeler=1.0, 2-wheeler=0.4,
  -- add-on=0.5), matching the ERP's real incentive-engine unit counts —
  -- this app only counts units from this, it doesn't compute payouts.
  vehicle_type text not null default '4w' check (vehicle_type in ('4w', '2w', 'addon')),
  -- Doorstep payment collection, logged by the washer using their own
  -- existing collection method (UPI/cash/link) — no payment gateway is
  -- integrated here, this just records what happened.
  payment_required boolean not null default false,
  payment_amount numeric,
  payment_method text check (payment_method in ('cash', 'upi', 'link')),
  payment_reference text,
  payment_collected_at timestamptz,
  -- Latest reassignment reason, not a history — matches this app's
  -- existing "no audit trail" approach to overrides.
  override_reason text,
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
  -- Once gps_lost_at is set, re-check-in stays locked until a supervisor
  -- sets this (their "Unlock Check-In" action) — a scaled-down version
  -- of the ERP's City-Manager GPS-violation approval.
  gps_unlock_approved_at timestamptz,
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
  -- category/item_name are optional structure for structured incident
  -- reports (broken part, lost/damaged bottle, repair request, pre-wash
  -- damage); null for the plain free-text issues either role can report.
  category text check (category is null or category in ('broken_part', 'lost_damaged_bottle', 'repair_request', 'pre_damage', 'other')),
  item_name text,
  -- Set when a report is about a specific job (pre-damage reports
  -- always are; general incidents usually aren't).
  job_id uuid references jobs(id) on delete set null,
  photo_url text,
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
  created_at timestamptz default now(),
  -- Full 6-step scored audit: optionally tied to the job being audited
  -- (its customer/vehicle stand in for the ERP's separate customer
  -- lookup, since this app has no standalone customers table). Score
  -- weights match the ERP: uniform/20, materials/30, process/30,
  -- photo-evidence/20 (photos, not video — no video upload pipeline
  -- exists here). checklist stores the raw per-item answers so the
  -- score is always re-derivable, not just the total.
  job_id uuid references jobs(id) on delete set null,
  uniform_score int,
  materials_score int,
  process_score int,
  photo_score int,
  total_score int,
  grade text check (grade is null or grade in ('pass', 'minor', 'major', 'failed')),
  notes text,
  checklist jsonb
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  zone text,
  message text not null,
  created_at timestamptz default now()
);

-- Audit log of washer <-> supervisor cloth hand-overs: how many used
-- (dirty) cloths the washer returned, how many new (clean) ones they
-- received back.
create table if not exists cloth_exchanges (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid not null references profiles(id) on delete cascade,
  used_returned int not null default 0,
  new_received int not null default 0,
  created_at timestamptz default now()
);

-- Individual barcode-tracked cloths, alongside (not replacing) the
-- aggregate cloth_exchanges hand-over above. A cloth's washer_id is who
-- currently holds it (null = back in central inventory).
create table if not exists cloth_units (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique,
  washer_id uuid references profiles(id) on delete set null,
  state text not null default 'clean' check (state in ('clean', 'dirty', 'locked', 'expired')),
  wash_count int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- A washer's own SOS/emergency alert, with their GPS fix at the moment
-- they sent it.
create table if not exists sos_alerts (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid not null references profiles(id) on delete cascade,
  gps_lat double precision,
  gps_lng double precision,
  message text,
  status text not null default 'active' check (status in ('active', 'resolved')),
  created_at timestamptz default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id)
);

-- In-app notifications, written at real state-change moments (job
-- assigned, check-in unlocked, report resolved, SOS acknowledged) — not
-- a generic pub/sub system, just the specific events this app raises.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text,
  created_at timestamptz default now(),
  read_at timestamptz
);

create table if not exists advance_requests (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid not null references profiles(id) on delete cascade,
  amount numeric not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- A washer requesting cover for a future date (e.g. a planned week off)
-- — distinct from the supervisor-initiated same-day cover redistribution
-- for an unexpected absence. Approving this is an acknowledgment; the
-- supervisor still assigns that day's jobs via the normal Job Queue once
-- the date arrives (job assignment only exists for today's jobs).
create table if not exists cover_requests (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid not null references profiles(id) on delete cascade,
  cover_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- Reconciliation for doorstep cash collected (jobs.payment_method =
-- 'cash'): a supervisor marks a washer's collected cash as deposited.
-- "Pending" for a washer/day is derived (sum of collected cash minus
-- sum of deposits), not stored as its own flag.
create table if not exists cash_deposits (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid not null references profiles(id) on delete cascade,
  amount numeric not null,
  deposit_date date not null default current_date,
  deposited_at timestamptz default now(),
  recorded_by uuid references profiles(id)
);

-- Formal leave (distinct from Request Cover, which just acknowledges a
-- future-date staffing need without touching a balance). Real type/
-- balance system matching the ERP's CL/PL/SL/UL types — no pro-rata or
-- probation-based accrual engine here, balances are just totals a
-- washer draws down against as requests are approved.
create table if not exists leave_balances (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid not null references profiles(id) on delete cascade,
  leave_type text not null check (leave_type in ('CL', 'PL', 'SL', 'UL')),
  total numeric not null default 0,
  used numeric not null default 0,
  updated_at timestamptz default now(),
  unique (washer_id, leave_type)
);

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid not null references profiles(id) on delete cascade,
  leave_type text not null check (leave_type in ('CL', 'PL', 'SL', 'UL')),
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now(),
  resolved_at timestamptz
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
alter table cloth_exchanges enable row level security;
alter table cloth_units enable row level security;
alter table sos_alerts enable row level security;
alter table notifications enable row level security;
alter table advance_requests enable row level security;
alter table cover_requests enable row level security;
alter table cash_deposits enable row level security;
alter table leave_balances enable row level security;
alter table leave_requests enable row level security;

create policy "anon_all_profiles"   on profiles      for all to anon using (true) with check (true);
create policy "anon_all_jobs"       on jobs          for all to anon using (true) with check (true);
create policy "anon_all_attendance" on attendance     for all to anon using (true) with check (true);
create policy "anon_all_stock"      on stock_items    for all to anon using (true) with check (true);
create policy "anon_all_payouts"    on payouts        for all to anon using (true) with check (true);
create policy "anon_all_issues"     on issues         for all to anon using (true) with check (true);
create policy "anon_all_audits"     on audits         for all to anon using (true) with check (true);
create policy "anon_all_alerts"     on alerts         for all to anon using (true) with check (true);
create policy "anon_all_job_photos" on job_photos     for all to anon using (true) with check (true);
create policy "anon_all_cloth_exchanges" on cloth_exchanges for all to anon using (true) with check (true);
create policy "anon_all_cloth_units" on cloth_units for all to anon using (true) with check (true);
create policy "anon_all_sos_alerts" on sos_alerts for all to anon using (true) with check (true);
create policy "anon_all_notifications" on notifications for all to anon using (true) with check (true);
create policy "anon_all_advance_requests" on advance_requests for all to anon using (true) with check (true);
create policy "anon_all_cover_requests" on cover_requests for all to anon using (true) with check (true);
create policy "anon_all_cash_deposits" on cash_deposits for all to anon using (true) with check (true);
create policy "anon_all_leave_balances" on leave_balances for all to anon using (true) with check (true);
create policy "anon_all_leave_requests" on leave_requests for all to anon using (true) with check (true);

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
create index if not exists idx_cloth_exchanges_washer on cloth_exchanges(washer_id, created_at desc);
create index if not exists idx_cloth_units_washer on cloth_units(washer_id);
create index if not exists idx_cloth_units_barcode on cloth_units(barcode);
create index if not exists idx_sos_alerts_status on sos_alerts(status, created_at desc);
create index if not exists idx_notifications_profile on notifications(profile_id, created_at desc);
create index if not exists idx_advance_requests_washer on advance_requests(washer_id, created_at desc);
create index if not exists idx_cover_requests_washer on cover_requests(washer_id, created_at desc);
create index if not exists idx_cash_deposits_washer_date on cash_deposits(washer_id, deposit_date);
create index if not exists idx_leave_balances_washer on leave_balances(washer_id);
create index if not exists idx_leave_requests_washer on leave_requests(washer_id, created_at desc);

-- ── Seed the two people the app needs to show something real ───
-- Same names as the reference prototype. Safe to run more than once.
insert into profiles (full_name, role, zone)
select 'Ravi Kumar', 'washer', 'Zone 4'
where not exists (select 1 from profiles where full_name = 'Ravi Kumar');

insert into profiles (full_name, role, zone)
select 'Priya Sharma', 'supervisor', 'Zone 4'
where not exists (select 1 from profiles where full_name = 'Priya Sharma');

-- Done: 18 tables, 18 RLS policies, 1 storage bucket, 16 indexes, 2 seeded profiles.
-- (issues.category / issues.item_name added for supervisor incident reports.
--  jobs.vehicle_type / payment_* , attendance.gps_unlock_approved_at, and
--  cloth_units added for washer-side weighted units / payments / cloth
--  tracking / GPS-lockout unlock. issues.job_id / photo_url / pre_damage
--  category, jobs.override_reason, and sos_alerts / notifications /
--  advance_requests / cover_requests / cash_deposits round out that
--  batch. audits gets real scored-audit columns, and leave_balances /
--  leave_requests add formal CL/PL/SL/UL leave, distinct from the
--  simpler Request Cover flow.)
