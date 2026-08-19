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
