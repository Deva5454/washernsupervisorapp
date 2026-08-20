-- ============================================================
-- CleanCar Field App — full catch-up migration (v1 → v12)
-- Paste into: Supabase Dashboard → SQL Editor → New Query → Run
--
-- Fixes "column ... does not exist" errors (like cloth_limit) that
-- happen when your database was set up from an older version of
-- supabase_schema.sql and never caught up on the incremental
-- migrations released since. This file is every migration this app
-- has ever shipped, concatenated in order — every single statement in
-- it is `if not exists` / `if exists` guarded, so it's 100% safe to
-- run against a database that already has some or all of these
-- changes: anything you already have is a silent no-op, anything
-- missing gets added. Safe to run more than once, in any state.
--
-- After this finishes, run supabase_seed_testdata.sql.
-- ============================================================

-- Run this ONCE in Supabase SQL Editor. Removes the requirement that a
-- profiles row be tied to a real Supabase Auth account (the app never
-- signs anyone in, so that requirement was pure friction with no
-- security benefit here), and seeds the two people the app needs to
-- show something real immediately — same names as the reference
-- prototype, not placeholder text.

-- 1) Drop the trigger/function that auto-created a profiles row on
--    signup — no longer relevant, nobody signs up.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user();

-- 2) Drop the foreign key so profiles.id no longer has to match a real
--    auth.users row, and give it a real default so future inserts don't
--    need to specify an id by hand.
alter table profiles drop constraint if exists profiles_id_fkey;
alter table profiles alter column id set default gen_random_uuid();

-- 3) Seed the two people the app shows. Safe to run more than once —
--    skips if a row with that name already exists.
insert into profiles (full_name, role, zone)
select 'Ravi Kumar', 'washer', 'Zone 4'
where not exists (select 1 from profiles where full_name = 'Ravi Kumar');

insert into profiles (full_name, role, zone)
select 'Priya Sharma', 'supervisor', 'Zone 4'
where not exists (select 1 from profiles where full_name = 'Priya Sharma');

select id, full_name, role, zone from profiles order by role;
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
-- Run this ONCE in Supabase SQL Editor. Idempotent — safe to re-run.

-- Urgent-job flag, so the Jobs list can highlight it. There's no UI in
-- this app to SET this yet (no "mark urgent" action was requested) — it
-- exists so the column is real and ready for whatever system does set
-- it (e.g. the ERP app this one is meant to connect to).
alter table jobs add column if not exists is_urgent boolean not null default false;

-- Per-washer cap on new cloths receivable in one hand-over. Set/owned
-- by the City Manager role, which lives in a different (ERP) web app —
-- this app only reads and respects the value, never writes it. Null
-- means "no limit enforced."
alter table profiles add column if not exists cloth_limit integer;

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

alter table cloth_exchanges enable row level security;
drop policy if exists "anon_all_cloth_exchanges" on cloth_exchanges;
create policy "anon_all_cloth_exchanges" on cloth_exchanges for all to anon using (true) with check (true);

create index if not exists idx_cloth_exchanges_washer on cloth_exchanges(washer_id, created_at desc);

select 'migration applied' as result;
-- Run this ONCE in Supabase SQL Editor. Idempotent — safe to re-run.

-- Optional structure for supervisor-filed incident reports (broken part,
-- lost/damaged bottle, repair request), layered onto the existing issues
-- table rather than a new one. Null for the plain free-text issues
-- washers already report from More > Report an Issue.
alter table issues add column if not exists category text;
alter table issues add column if not exists item_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'issues_category_check'
  ) then
    alter table issues add constraint issues_category_check
      check (category is null or category in ('broken_part', 'lost_damaged_bottle', 'repair_request', 'other'));
  end if;
end $$;

select 'migration applied' as result;
-- Run this ONCE in Supabase SQL Editor. Idempotent — safe to re-run.

-- Weighting for the daily unit quota (4-wheeler=1.0, 2-wheeler=0.4,
-- add-on=0.5), matching the ERP's real incentive-engine unit counts —
-- this app only counts units from this, it doesn't compute payouts.
alter table jobs add column if not exists vehicle_type text not null default '4w';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'jobs_vehicle_type_check'
  ) then
    alter table jobs add constraint jobs_vehicle_type_check
      check (vehicle_type in ('4w', '2w', 'addon'));
  end if;
end $$;

-- Doorstep payment collection, logged by the washer using their own
-- existing collection method (UPI/cash/link) — no payment gateway is
-- integrated here, this just records what happened.
alter table jobs add column if not exists payment_required boolean not null default false;
alter table jobs add column if not exists payment_amount numeric;
alter table jobs add column if not exists payment_method text;
alter table jobs add column if not exists payment_reference text;
alter table jobs add column if not exists payment_collected_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'jobs_payment_method_check'
  ) then
    alter table jobs add constraint jobs_payment_method_check
      check (payment_method in ('cash', 'upi', 'link'));
  end if;
end $$;

-- Once gps_lost_at is set, re-check-in stays locked until a supervisor
-- sets this (their "Unlock Check-In" action) — a scaled-down version of
-- the ERP's City-Manager GPS-violation approval.
alter table attendance add column if not exists gps_unlock_approved_at timestamptz;

-- Individual barcode-tracked cloths, alongside (not replacing) the
-- aggregate cloth_exchanges hand-over table. A cloth's washer_id is who
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

alter table cloth_units enable row level security;
drop policy if exists "anon_all_cloth_units" on cloth_units;
create policy "anon_all_cloth_units" on cloth_units for all to anon using (true) with check (true);

create index if not exists idx_cloth_units_washer on cloth_units(washer_id);
create index if not exists idx_cloth_units_barcode on cloth_units(barcode);

select 'migration applied' as result;
-- Run this ONCE in Supabase SQL Editor. Idempotent — safe to re-run.

-- Set when a report is about a specific job (pre-damage reports always
-- are; general incidents usually aren't).
alter table issues add column if not exists job_id uuid references jobs(id) on delete set null;
alter table issues add column if not exists photo_url text;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'issues_category_check') then
    alter table issues drop constraint issues_category_check;
  end if;
  alter table issues add constraint issues_category_check
    check (category is null or category in ('broken_part', 'lost_damaged_bottle', 'repair_request', 'pre_damage', 'other'));
end $$;

-- Latest reassignment reason, not a history — matches this app's
-- existing "no audit trail" approach to overrides.
alter table jobs add column if not exists override_reason text;

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

-- A washer requesting cover for a future date — distinct from the
-- supervisor-initiated same-day cover redistribution for an unexpected
-- absence. Approving this is an acknowledgment; the supervisor still
-- assigns that day's jobs via the normal Job Queue once the date
-- arrives.
create table if not exists cover_requests (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid not null references profiles(id) on delete cascade,
  cover_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- Reconciliation for doorstep cash collected: a supervisor marks a
-- washer's collected cash as deposited. "Pending" for a washer/day is
-- derived (collected cash minus deposits), not stored as its own flag.
create table if not exists cash_deposits (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid not null references profiles(id) on delete cascade,
  amount numeric not null,
  deposit_date date not null default current_date,
  deposited_at timestamptz default now(),
  recorded_by uuid references profiles(id)
);

alter table sos_alerts enable row level security;
alter table notifications enable row level security;
alter table advance_requests enable row level security;
alter table cover_requests enable row level security;
alter table cash_deposits enable row level security;

drop policy if exists "anon_all_sos_alerts" on sos_alerts;
drop policy if exists "anon_all_notifications" on notifications;
drop policy if exists "anon_all_advance_requests" on advance_requests;
drop policy if exists "anon_all_cover_requests" on cover_requests;
drop policy if exists "anon_all_cash_deposits" on cash_deposits;

create policy "anon_all_sos_alerts" on sos_alerts for all to anon using (true) with check (true);
create policy "anon_all_notifications" on notifications for all to anon using (true) with check (true);
create policy "anon_all_advance_requests" on advance_requests for all to anon using (true) with check (true);
create policy "anon_all_cover_requests" on cover_requests for all to anon using (true) with check (true);
create policy "anon_all_cash_deposits" on cash_deposits for all to anon using (true) with check (true);

create index if not exists idx_sos_alerts_status on sos_alerts(status, created_at desc);
create index if not exists idx_notifications_profile on notifications(profile_id, created_at desc);
create index if not exists idx_advance_requests_washer on advance_requests(washer_id, created_at desc);
create index if not exists idx_cover_requests_washer on cover_requests(washer_id, created_at desc);
create index if not exists idx_cash_deposits_washer_date on cash_deposits(washer_id, deposit_date);

select 'migration applied' as result;
-- Run this ONCE in Supabase SQL Editor. Idempotent — safe to re-run.

-- Full 6-step scored audit: optionally tied to the job being audited
-- (its customer/vehicle stand in for the ERP's separate customer
-- lookup, since this app has no standalone customers table). Score
-- weights match the ERP: uniform/20, materials/30, process/30,
-- photo-evidence/20 (photos, not video — no video upload pipeline
-- exists here). checklist stores the raw per-item answers so the score
-- is always re-derivable, not just the total.
alter table audits add column if not exists job_id uuid references jobs(id) on delete set null;
alter table audits add column if not exists uniform_score int;
alter table audits add column if not exists materials_score int;
alter table audits add column if not exists process_score int;
alter table audits add column if not exists photo_score int;
alter table audits add column if not exists total_score int;
alter table audits add column if not exists grade text;
alter table audits add column if not exists notes text;
alter table audits add column if not exists checklist jsonb;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'audits_grade_check') then
    alter table audits drop constraint audits_grade_check;
  end if;
  alter table audits add constraint audits_grade_check
    check (grade is null or grade in ('pass', 'minor', 'major', 'failed'));
end $$;

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

alter table leave_balances enable row level security;
alter table leave_requests enable row level security;

drop policy if exists "anon_all_leave_balances" on leave_balances;
drop policy if exists "anon_all_leave_requests" on leave_requests;

create policy "anon_all_leave_balances" on leave_balances for all to anon using (true) with check (true);
create policy "anon_all_leave_requests" on leave_requests for all to anon using (true) with check (true);

create index if not exists idx_leave_balances_washer on leave_balances(washer_id);
create index if not exists idx_leave_requests_washer on leave_requests(washer_id, created_at desc);

select 'migration applied' as result;
-- Run this ONCE in Supabase SQL Editor. Idempotent — safe to re-run.

-- Self-service items available to BOTH roles (a supervisor is an
-- employee too, not just a team manager) — profile_id is a generic FK,
-- same pattern as attendance.washer_id / cloth_exchanges.washer_id.

-- Employee-initiated correction of a past attendance record — distinct
-- from a supervisor's direct manual override (Dashboard's Team Status),
-- this is self-requested and needs approval before the attendance row
-- actually changes.
create table if not exists regularization_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  target_date date not null,
  requested_status text not null check (requested_status in ('present', 'absent', 'late', 'week_off')),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- Read-only in this app, same as payouts — a real payroll system is the
-- only thing that should ever write here. Empty until that system (or a
-- human, via the Supabase table editor) puts rows in.
create table if not exists payslips (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  month date not null,
  gross numeric not null default 0,
  deductions numeric not null default 0,
  net numeric not null default 0,
  notes text,
  generated_at timestamptz default now(),
  unique (profile_id, month)
);

-- Travel + general expense claims in one table (category='travel' uses
-- the from/to/distance fields; other categories leave them null) —
-- both are genuinely self-initiated requests, unlike payslips.
create table if not exists expense_claims (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  category text not null check (category in ('travel', 'medical', 'fuel', 'other')),
  amount numeric not null,
  description text,
  from_location text,
  to_location text,
  distance_km numeric,
  receipt_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- Document upload only — no tax-slab/deduction calculation engine here,
-- that's real payroll logic this app doesn't own.
create table if not exists tax_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  label text not null,
  file_url text not null,
  uploaded_at timestamptz default now()
);

alter table regularization_requests enable row level security;
alter table payslips enable row level security;
alter table expense_claims enable row level security;
alter table tax_documents enable row level security;

drop policy if exists "anon_all_regularization_requests" on regularization_requests;
drop policy if exists "anon_all_payslips" on payslips;
drop policy if exists "anon_all_expense_claims" on expense_claims;
drop policy if exists "anon_all_tax_documents" on tax_documents;

create policy "anon_all_regularization_requests" on regularization_requests for all to anon using (true) with check (true);
create policy "anon_all_payslips" on payslips for all to anon using (true) with check (true);
create policy "anon_all_expense_claims" on expense_claims for all to anon using (true) with check (true);
create policy "anon_all_tax_documents" on tax_documents for all to anon using (true) with check (true);

create index if not exists idx_regularization_requests_profile on regularization_requests(profile_id, created_at desc);
create index if not exists idx_payslips_profile on payslips(profile_id, month desc);
create index if not exists idx_expense_claims_profile on expense_claims(profile_id, created_at desc);
create index if not exists idx_tax_documents_profile on tax_documents(profile_id);

select 'migration applied' as result;
-- ============================================================
-- CleanCar Field App — v9 migration (washer ERP-gap sweep)
-- Run this if your database already has v8 (regularization_requests /
-- payslips / expense_claims / tax_documents) but not yet:
--   - jobs.failure_reason / auto_reschedule ("Mark Job as Failed")
--   - stock_requests (washer stock replenishment requests)
--   - demo_requests (sales/subscription demo-visit assignments)
--
-- Safe to run more than once. Paste into: Supabase Dashboard → SQL
-- Editor → New Query → Run. If you're setting up a brand-new project,
-- just run supabase_schema.sql instead — it already includes all this.
-- ============================================================

alter table jobs add column if not exists failure_reason text check (
  failure_reason in (
    'customer_unavailable', 'vehicle_unavailable', 'equipment_failure',
    'weather', 'safety', 'access_denied', 'other'
  )
);
alter table jobs add column if not exists auto_reschedule boolean not null default false;

create table if not exists stock_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  material_name text not null,
  requested_qty numeric not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create table if not exists demo_requests (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid not null references profiles(id) on delete cascade,
  customer_name text not null,
  customer_phone text,
  vehicle_info text,
  area text,
  scheduled_time text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

alter table stock_requests enable row level security;
alter table demo_requests enable row level security;

drop policy if exists "anon_all_stock_requests" on stock_requests;
create policy "anon_all_stock_requests" on stock_requests for all to anon using (true) with check (true);

drop policy if exists "anon_all_demo_requests" on demo_requests;
create policy "anon_all_demo_requests" on demo_requests for all to anon using (true) with check (true);

create index if not exists idx_stock_requests_profile on stock_requests(profile_id, created_at desc);
create index if not exists idx_demo_requests_washer on demo_requests(washer_id, created_at desc);

select 'migration applied' as result;
-- ============================================================
-- CleanCar Field App — v10 migration (supervisor stock/inventory ERP-gap sweep)
-- Run this if your database already has v9 (jobs.failure_reason /
-- auto_reschedule, stock_requests, demo_requests) but not yet:
--   - issues.qty_deducted / routing_status / spare_issued
--   - stock_receipts (Branch → supervisor stock receipt confirmation)
--   - supervisor_stock (supervisor's own buffer inventory)
--   - material_issuances (buffer → washer issuance log)
--   - uniform_issuances (annual entitlement + damaged replacement)
--
-- Safe to run more than once. Paste into: Supabase Dashboard → SQL
-- Editor → New Query → Run. If you're setting up a brand-new project,
-- just run supabase_schema.sql instead — it already includes all this.
-- ============================================================

alter table issues add column if not exists qty_deducted numeric;
alter table issues add column if not exists routing_status text not null default 'none' check (
  routing_status in ('none', 'pending_branch', 'pending_central', 'resolved')
);
alter table issues add column if not exists spare_issued boolean not null default false;

create table if not exists stock_receipts (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references profiles(id) on delete cascade,
  challan_number text not null,
  material_name text not null,
  received_qty numeric not null default 0,
  damaged_qty numeric not null default 0,
  shortfall_notes text,
  received_at timestamptz default now()
);

create table if not exists supervisor_stock (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references profiles(id) on delete cascade,
  material_name text not null,
  buffer_qty numeric not null default 0,
  unit text not null default 'unit',
  updated_at timestamptz default now(),
  unique (supervisor_id, material_name)
);

create table if not exists material_issuances (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references profiles(id) on delete cascade,
  washer_id uuid not null references profiles(id) on delete cascade,
  material_name text not null,
  qty numeric not null,
  issued_at timestamptz default now()
);

create table if not exists uniform_issuances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  issued_by uuid not null references profiles(id) on delete cascade,
  reason text not null check (reason in ('entitlement', 'replacement')),
  notes text,
  damaged_returned boolean not null default false,
  created_at timestamptz default now()
);

alter table stock_receipts enable row level security;
alter table supervisor_stock enable row level security;
alter table material_issuances enable row level security;
alter table uniform_issuances enable row level security;

drop policy if exists "anon_all_stock_receipts" on stock_receipts;
create policy "anon_all_stock_receipts" on stock_receipts for all to anon using (true) with check (true);

drop policy if exists "anon_all_supervisor_stock" on supervisor_stock;
create policy "anon_all_supervisor_stock" on supervisor_stock for all to anon using (true) with check (true);

drop policy if exists "anon_all_material_issuances" on material_issuances;
create policy "anon_all_material_issuances" on material_issuances for all to anon using (true) with check (true);

drop policy if exists "anon_all_uniform_issuances" on uniform_issuances;
create policy "anon_all_uniform_issuances" on uniform_issuances for all to anon using (true) with check (true);

create index if not exists idx_stock_receipts_supervisor on stock_receipts(supervisor_id, received_at desc);
create index if not exists idx_supervisor_stock_supervisor on supervisor_stock(supervisor_id);
create index if not exists idx_material_issuances_supervisor on material_issuances(supervisor_id, issued_at desc);
create index if not exists idx_material_issuances_washer on material_issuances(washer_id, issued_at desc);
create index if not exists idx_uniform_issuances_profile on uniform_issuances(profile_id, created_at desc);

select 'migration applied' as result;
-- ============================================================
-- CleanCar Field App — v11 migration (supervisor assignment/finance ERP-gap sweep)
-- Run this if your database already has v10 (issues.qty_deducted/
-- routing_status/spare_issued, stock_receipts, supervisor_stock,
-- material_issuances, uniform_issuances) but not yet:
--   - cash_registers (shift-level cash/UPI/link reconciliation)
--   - subscription_cash_deposits (customer subscription cash collection)
--
-- Job Assignment Queue and the Team Washer Job History Browser need no
-- schema changes — they reuse the existing jobs table.
--
-- Safe to run more than once. Paste into: Supabase Dashboard → SQL
-- Editor → New Query → Run. If you're setting up a brand-new project,
-- just run supabase_schema.sql instead — it already includes all this.
-- ============================================================

create table if not exists cash_registers (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references profiles(id) on delete cascade,
  shift_date date not null default current_date,
  cash_total numeric not null default 0,
  upi_total numeric not null default 0,
  link_total numeric not null default 0,
  deposit_reference text not null,
  submitted_at timestamptz default now(),
  unique (supervisor_id, shift_date)
);

create table if not exists subscription_cash_deposits (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references profiles(id) on delete cascade,
  customer_name text not null,
  customer_phone text,
  amount numeric not null,
  bank_reference text,
  notes text,
  deposited_at timestamptz default now()
);

alter table cash_registers enable row level security;
alter table subscription_cash_deposits enable row level security;

drop policy if exists "anon_all_cash_registers" on cash_registers;
create policy "anon_all_cash_registers" on cash_registers for all to anon using (true) with check (true);

drop policy if exists "anon_all_subscription_cash_deposits" on subscription_cash_deposits;
create policy "anon_all_subscription_cash_deposits" on subscription_cash_deposits for all to anon using (true) with check (true);

create index if not exists idx_cash_registers_supervisor on cash_registers(supervisor_id, shift_date desc);
create index if not exists idx_subscription_cash_deposits_supervisor on subscription_cash_deposits(supervisor_id, deposited_at desc);

select 'migration applied' as result;
-- ============================================================
-- CleanCar Field App — v12 migration (supervisor scheduling/oversight ERP-gap sweep)
-- Run this if your database already has v11 (cash_registers,
-- subscription_cash_deposits) but not yet:
--   - audits.gps_exception_reason / photo_authenticity_flagged / photo_authenticity_note
--   - attendance.supervisor_note
--   - periodic_schedules / daily_flow_progress / activity_log /
--     escalations / schedule_pauses / batch_invalidations
--
-- Safe to run more than once. Paste into: Supabase Dashboard → SQL
-- Editor → New Query → Run. If you're setting up a brand-new project,
-- just run supabase_schema.sql instead — it already includes all this.
-- ============================================================

alter table audits add column if not exists gps_exception_reason text;
alter table audits add column if not exists photo_authenticity_flagged boolean not null default false;
alter table audits add column if not exists photo_authenticity_note text;

alter table attendance add column if not exists supervisor_note text;

create table if not exists periodic_schedules (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text,
  area text,
  zone text,
  service_name text not null,
  frequency_days int not null default 30,
  next_due_date date not null,
  monthly_cap int not null default 1,
  used_this_month int not null default 0,
  last_serviced_at date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists daily_flow_progress (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references profiles(id) on delete cascade,
  flow_date date not null default current_date,
  completed_steps jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now(),
  unique (supervisor_id, flow_date)
);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references profiles(id) on delete cascade,
  category text not null check (category in ('attendance', 'audit', 'lead', 'cloth', 'escalation', 'other')),
  action text not null,
  details text,
  gps_lat double precision,
  gps_lng double precision,
  gps_verified boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists escalations (
  id uuid primary key default gen_random_uuid(),
  raised_by uuid not null references profiles(id) on delete cascade,
  washer_id uuid references profiles(id) on delete set null,
  case_type text not null check (case_type in ('missed_visit_credit', 'quality_dispute', 'bonus_correction', 'other')),
  reason text not null,
  details text,
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create table if not exists schedule_pauses (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid not null references profiles(id) on delete cascade,
  reason text not null,
  paused_by uuid not null references profiles(id) on delete cascade,
  paused_at timestamptz default now(),
  resumed_at timestamptz
);

create table if not exists batch_invalidations (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null,
  reason text not null,
  invalidated_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now()
);

alter table periodic_schedules enable row level security;
alter table daily_flow_progress enable row level security;
alter table activity_log enable row level security;
alter table escalations enable row level security;
alter table schedule_pauses enable row level security;
alter table batch_invalidations enable row level security;

drop policy if exists "anon_all_periodic_schedules" on periodic_schedules;
create policy "anon_all_periodic_schedules" on periodic_schedules for all to anon using (true) with check (true);

drop policy if exists "anon_all_daily_flow_progress" on daily_flow_progress;
create policy "anon_all_daily_flow_progress" on daily_flow_progress for all to anon using (true) with check (true);

drop policy if exists "anon_all_activity_log" on activity_log;
create policy "anon_all_activity_log" on activity_log for all to anon using (true) with check (true);

drop policy if exists "anon_all_escalations" on escalations;
create policy "anon_all_escalations" on escalations for all to anon using (true) with check (true);

drop policy if exists "anon_all_schedule_pauses" on schedule_pauses;
create policy "anon_all_schedule_pauses" on schedule_pauses for all to anon using (true) with check (true);

drop policy if exists "anon_all_batch_invalidations" on batch_invalidations;
create policy "anon_all_batch_invalidations" on batch_invalidations for all to anon using (true) with check (true);

create index if not exists idx_periodic_schedules_due on periodic_schedules(next_due_date);
create index if not exists idx_daily_flow_progress_supervisor on daily_flow_progress(supervisor_id, flow_date desc);
create index if not exists idx_activity_log_actor on activity_log(actor_id, created_at desc);
create index if not exists idx_activity_log_category on activity_log(category, created_at desc);
create index if not exists idx_escalations_status on escalations(status, created_at desc);
create index if not exists idx_schedule_pauses_washer on schedule_pauses(washer_id, resumed_at);
create index if not exists idx_batch_invalidations_batch on batch_invalidations(batch_id);

select 'migration applied' as result;
