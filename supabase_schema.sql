-- ============================================================
-- CleanCar Field App — Supabase Schema v1
-- Paste ENTIRE file into: Supabase Dashboard → SQL Editor → New Query → Run
-- Expected: "Success. No rows returned."
-- ============================================================

create extension if not exists "pgcrypto";

-- ── Tables ───────────────────────────────────────────────────

-- One row per app user, keyed to Supabase Auth's own user id. Created
-- automatically by the handle_new_user trigger below whenever someone
-- signs up — role/zone default to 'washer'/NULL and should be corrected
-- by a supervisor/admin afterwards (there is no self-service "sign up as
-- supervisor" — that would let anyone grant themselves the role).
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'New User',
  role text not null default 'washer' check (role in ('washer', 'supervisor')),
  phone text,
  zone text,
  avatar_url text,
  created_at timestamptz default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid references profiles(id) on delete set null,
  sequence_number int not null default 1,
  scheduled_time text not null,
  customer_name text not null,
  vehicle_make text not null,
  vehicle_reg text not null,
  package_name text not null,
  area text not null,
  city text not null default 'Pune',
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'issue')),
  is_cover boolean not null default false,
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
  created_at timestamptz default now(),
  unique (washer_id, date)
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
  created_at timestamptz default now()
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  zone text,
  message text not null,
  created_at timestamptz default now()
);

-- ── Auto-create profile on signup ───────────────────────────────
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── Row Level Security ────────────────────────────────────────

alter table profiles enable row level security;
alter table jobs enable row level security;
alter table attendance enable row level security;
alter table stock_items enable row level security;
alter table payouts enable row level security;
alter table issues enable row level security;
alter table audits enable row level security;
alter table alerts enable row level security;

-- Helper: is the current user a supervisor? Used by every "supervisors
-- see everyone's data" policy below. security definer + a fixed search_path
-- so it can read profiles regardless of the calling policy's own RLS check.
create or replace function is_supervisor()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'supervisor'
  );
$$ language sql security definer set search_path = public stable;

-- profiles: everyone signed in can read (names/roles/zones are low
-- sensitivity and needed for the supervisor's team-status views); a user
-- can only update their own row (never their own role — that's an admin
-- action, done directly in the Supabase dashboard for now).
create policy "profiles_select_all" on profiles for select using (auth.uid() is not null);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

-- jobs: a washer sees/updates only their own jobs; a supervisor sees/
-- updates everyone's (to assign, reassign, and monitor).
create policy "jobs_select" on jobs for select using (washer_id = auth.uid() or is_supervisor());
create policy "jobs_update" on jobs for update using (washer_id = auth.uid() or is_supervisor());
create policy "jobs_insert" on jobs for insert with check (is_supervisor());

create policy "attendance_select" on attendance for select using (washer_id = auth.uid() or is_supervisor());
create policy "attendance_insert" on attendance for insert with check (washer_id = auth.uid() or is_supervisor());
create policy "attendance_update" on attendance for update using (washer_id = auth.uid() or is_supervisor());

create policy "stock_select" on stock_items for select using (washer_id = auth.uid() or is_supervisor());
create policy "stock_update" on stock_items for update using (washer_id = auth.uid() or is_supervisor());
create policy "stock_insert" on stock_items for insert with check (is_supervisor());

create policy "payouts_select" on payouts for select using (washer_id = auth.uid() or is_supervisor());
create policy "payouts_insert" on payouts for insert with check (is_supervisor());

create policy "issues_select" on issues for select using (reported_by = auth.uid() or is_supervisor());
create policy "issues_insert" on issues for insert with check (reported_by = auth.uid());
create policy "issues_update" on issues for update using (is_supervisor());

create policy "audits_select" on audits for select using (washer_id = auth.uid() or is_supervisor());
create policy "audits_insert" on audits for insert with check (is_supervisor());
create policy "audits_update" on audits for update using (is_supervisor());

create policy "alerts_select" on alerts for select using (auth.uid() is not null);
create policy "alerts_insert" on alerts for insert with check (is_supervisor());

-- ── Indexes ──────────────────────────────────────────────────
create index if not exists idx_jobs_washer_date on jobs(washer_id, job_date);
create index if not exists idx_attendance_washer_date on attendance(washer_id, date);
create index if not exists idx_stock_washer on stock_items(washer_id);
create index if not exists idx_payouts_washer on payouts(washer_id, payout_date desc);
create index if not exists idx_audits_washer on audits(washer_id);

-- Done: 8 tables, 1 trigger, 20 RLS policies.
