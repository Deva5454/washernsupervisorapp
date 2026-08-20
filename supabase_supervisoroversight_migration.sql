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
