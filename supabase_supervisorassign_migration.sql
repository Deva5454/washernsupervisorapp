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
