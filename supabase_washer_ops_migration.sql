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
