-- Safe to run multiple times. Paste this WHOLE file into Supabase
-- SQL Editor → New Query → Run. Read the result table at the bottom —
-- that's what actually decides what to do next.

-- 1) Make sure the anon-access policies exist (re-creating them is a
--    no-op if you already ran supabase_no_auth_policies.sql once).
drop policy if exists "anon_all_profiles"   on profiles;
drop policy if exists "anon_all_jobs"       on jobs;
drop policy if exists "anon_all_attendance" on attendance;
drop policy if exists "anon_all_stock"      on stock_items;
drop policy if exists "anon_all_payouts"    on payouts;
drop policy if exists "anon_all_issues"     on issues;
drop policy if exists "anon_all_audits"     on audits;
drop policy if exists "anon_all_alerts"     on alerts;

create policy "anon_all_profiles"   on profiles      for all to anon using (true) with check (true);
create policy "anon_all_jobs"       on jobs          for all to anon using (true) with check (true);
create policy "anon_all_attendance" on attendance     for all to anon using (true) with check (true);
create policy "anon_all_stock"      on stock_items    for all to anon using (true) with check (true);
create policy "anon_all_payouts"    on payouts        for all to anon using (true) with check (true);
create policy "anon_all_issues"     on issues         for all to anon using (true) with check (true);
create policy "anon_all_audits"     on audits         for all to anon using (true) with check (true);
create policy "anon_all_alerts"     on alerts         for all to anon using (true) with check (true);

-- 2) Show what's actually in the profiles table right now.
--    - Zero rows at all -> no Supabase Auth user has ever been created.
--      Go to Authentication -> Users -> Add User first.
--    - Rows exist but none say role = 'washer' -> edit one row's role
--      in Table Editor -> profiles.
--    - A row with role = 'washer' already exists -> the policies above
--      were the actual fix; reload the app now.
select id, full_name, role, zone, created_at from profiles order by created_at;
