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
