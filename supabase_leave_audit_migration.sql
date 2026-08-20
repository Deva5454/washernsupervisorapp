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
