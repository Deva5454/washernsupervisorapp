-- Run this ONCE in Supabase SQL Editor. Idempotent — safe to re-run.

-- Optional structure for supervisor-filed incident reports (broken part,
-- lost/damaged bottle, repair request), layered onto the existing issues
-- table rather than a new one. Null for the plain free-text issues
-- washers already report from More > Report an Issue.
alter table issues add column if not exists category text;
alter table issues add column if not exists item_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'issues_category_check'
  ) then
    alter table issues add constraint issues_category_check
      check (category is null or category in ('broken_part', 'lost_damaged_bottle', 'repair_request', 'other'));
  end if;
end $$;

select 'migration applied' as result;
