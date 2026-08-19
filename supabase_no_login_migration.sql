-- Run this ONCE in Supabase SQL Editor. Removes the requirement that a
-- profiles row be tied to a real Supabase Auth account (the app never
-- signs anyone in, so that requirement was pure friction with no
-- security benefit here), and seeds the two people the app needs to
-- show something real immediately — same names as the reference
-- prototype, not placeholder text.

-- 1) Drop the trigger/function that auto-created a profiles row on
--    signup — no longer relevant, nobody signs up.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user();

-- 2) Drop the foreign key so profiles.id no longer has to match a real
--    auth.users row, and give it a real default so future inserts don't
--    need to specify an id by hand.
alter table profiles drop constraint if exists profiles_id_fkey;
alter table profiles alter column id set default gen_random_uuid();

-- 3) Seed the two people the app shows. Safe to run more than once —
--    skips if a row with that name already exists.
insert into profiles (full_name, role, zone)
select 'Ravi Kumar', 'washer', 'Zone 4'
where not exists (select 1 from profiles where full_name = 'Ravi Kumar');

insert into profiles (full_name, role, zone)
select 'Priya Sharma', 'supervisor', 'Zone 4'
where not exists (select 1 from profiles where full_name = 'Priya Sharma');

select id, full_name, role, zone from profiles order by role;
