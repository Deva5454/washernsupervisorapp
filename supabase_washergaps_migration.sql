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
