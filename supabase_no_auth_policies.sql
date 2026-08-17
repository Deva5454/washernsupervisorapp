-- ============================================================
-- Run this AFTER supabase_schema.sql, only if you're running the app in
-- no-login mode (no login screen, anyone with the URL uses the app
-- directly). It grants the anon (unauthenticated) key full read/write on
-- every table, on top of the existing per-user policies from
-- supabase_schema.sql — those stay in place but become irrelevant here
-- since the app never signs anyone in, so auth.uid() is always null for
-- every request it makes.
--
-- This means EVERY visitor with the app's URL can read and write
-- EVERYONE's jobs, attendance, stock, payouts, issues, audits, and
-- alerts — there is no per-user data protection left. Only run this if
-- you deliberately want that (e.g. a small internal single-team tool),
-- not for anything with sensitive per-employee data or multiple
-- unrelated teams sharing one deployment.
-- ============================================================

create policy "anon_all_profiles"   on profiles      for all to anon using (true) with check (true);
create policy "anon_all_jobs"       on jobs          for all to anon using (true) with check (true);
create policy "anon_all_attendance" on attendance     for all to anon using (true) with check (true);
create policy "anon_all_stock"      on stock_items    for all to anon using (true) with check (true);
create policy "anon_all_payouts"    on payouts        for all to anon using (true) with check (true);
create policy "anon_all_issues"     on issues         for all to anon using (true) with check (true);
create policy "anon_all_audits"     on audits         for all to anon using (true) with check (true);
create policy "anon_all_alerts"     on alerts         for all to anon using (true) with check (true);

-- To undo this later and go back to per-user protection, drop these 8
-- policies (Supabase Dashboard → Authentication → Policies, or:
--   drop policy "anon_all_profiles" on profiles;  (repeat per table)
-- ) and reintroduce a real login step in the app.
