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
