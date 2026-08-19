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
