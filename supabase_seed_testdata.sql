-- ============================================================
-- CleanCar Field App — Test seed data
-- Paste into: Supabase Dashboard → SQL Editor → New Query → Run
-- Requires: supabase_schema.sql already applied (all 36 tables).
--
-- Purpose: populate every table with data that exercises every status,
-- edge case, and cross-cutting scenario in the app — not just a happy
-- path. In particular this seeds TWO zones (Zone 4 and Zone 7) so you
-- can verify the zone-scoping fix actually isolates one supervisor's
-- team from another's, plus a zone-less washer, a self-submitted
-- supervisor request (to confirm self-approval is correctly blocked),
-- a GPS-locked washer, a paused washer, a periodic schedule stuck at
-- last month's cap (to see the lazy reset fire), and more — each
-- block below says what it's specifically there to test.
--
-- NOT idempotent the way supabase_schema.sql is: profile creation is
-- guarded (safe to re-run), but re-running this whole file will
-- duplicate the transactional rows (jobs, requests, logs, etc.) since
-- those don't have natural unique keys to guard against. Meant to be
-- run once against a fresh/test project. If you need a clean slate,
-- truncate every table below `profiles` first (cascades will handle
-- most FKs) or just start a new Supabase project.
--
-- Placeholder images (selfies/photos/receipts) point to placehold.co,
-- a public placeholder-image service — not real photos, just something
-- that actually renders in the app's <img> tags.
-- ============================================================

do $$
declare
  ravi_id uuid;
  priya_id uuid;
  suresh_id uuid;
  anita_id uuid;
  vikram_id uuid;
  meena_id uuid;
  arjun_id uuid;
  deepak_id uuid;

  job1 uuid; job2 uuid; job3 uuid; job4 uuid; job5 uuid; job6 uuid; job7 uuid; job8 uuid;
  job_unassigned1 uuid; job_unassigned2 uuid; job_zone7 uuid;
  photo_job uuid;

  today date := current_date;
  yesterday date := current_date - 1;
  two_days_ago date := current_date - 2;
  last_week date := current_date - 7;
  two_weeks_ago date := current_date - 14;
  this_month_start date := date_trunc('month', current_date)::date;
  last_month_date date := (date_trunc('month', current_date) - interval '10 days')::date;

  placeholder text := 'https://placehold.co/400x400/1e3a5f/ffffff?text=Test';
begin

  -- ── Profiles (2 zones + 1 zone-less, so zone-scoping is testable) ──
  insert into profiles (full_name, role, zone, phone, cloth_limit)
  select 'Ravi Kumar', 'washer', 'Zone 4', '9876500001', 8
  where not exists (select 1 from profiles where full_name = 'Ravi Kumar');

  insert into profiles (full_name, role, zone, phone)
  select 'Priya Sharma', 'supervisor', 'Zone 4', '9876500002'
  where not exists (select 1 from profiles where full_name = 'Priya Sharma');

  insert into profiles (full_name, role, zone, phone, cloth_limit)
  select 'Suresh Patil', 'washer', 'Zone 4', '9876500003', null
  where not exists (select 1 from profiles where full_name = 'Suresh Patil');

  insert into profiles (full_name, role, zone, phone, cloth_limit)
  select 'Anita Desai', 'washer', 'Zone 4', '9876500004', 6
  where not exists (select 1 from profiles where full_name = 'Anita Desai');

  insert into profiles (full_name, role, zone, phone)
  select 'Vikram Singh', 'supervisor', 'Zone 7', '9876500005'
  where not exists (select 1 from profiles where full_name = 'Vikram Singh');

  insert into profiles (full_name, role, zone, phone, cloth_limit)
  select 'Meena Iyer', 'washer', 'Zone 7', '9876500006', 10
  where not exists (select 1 from profiles where full_name = 'Meena Iyer');

  insert into profiles (full_name, role, zone, phone)
  select 'Arjun Rao', 'washer', 'Zone 7', '9876500007'
  where not exists (select 1 from profiles where full_name = 'Arjun Rao');

  -- No zone at all: with a zone-scoped supervisor viewing, this washer
  -- should never appear in any roster/approval list; with a zone-less
  -- supervisor (neither Priya nor Vikram is one here — add your own
  -- test profile with zone unset if you want to check that side), they
  -- would appear in every list.
  insert into profiles (full_name, role, zone, phone)
  select 'Deepak Nair', 'washer', null, '9876500008'
  where not exists (select 1 from profiles where full_name = 'Deepak Nair');

  select id into ravi_id from profiles where full_name = 'Ravi Kumar';
  select id into priya_id from profiles where full_name = 'Priya Sharma';
  select id into suresh_id from profiles where full_name = 'Suresh Patil';
  select id into anita_id from profiles where full_name = 'Anita Desai';
  select id into vikram_id from profiles where full_name = 'Vikram Singh';
  select id into meena_id from profiles where full_name = 'Meena Iyer';
  select id into arjun_id from profiles where full_name = 'Arjun Rao';
  select id into deepak_id from profiles where full_name = 'Deepak Nair';

  -- ── Jobs: every status × vehicle_type × payment/urgent/cover combo ─
  insert into jobs (washer_id, sequence_number, scheduled_time, customer_name, customer_phone, vehicle_make, vehicle_reg, package_name, area, city, status, execution_stage, is_urgent, vehicle_type, payment_required, job_date)
  values (ravi_id, 1, '08:00 AM', 'Amit Verma', '9900011111', 'Maruti Swift', 'MH12AB1234', 'Premium Wash', 'Kothrud', 'Pune', 'pending', 'assigned', true, '4w', true, today)
  returning id into job1;

  insert into jobs (washer_id, sequence_number, scheduled_time, customer_name, vehicle_make, vehicle_reg, package_name, area, city, status, execution_stage, vehicle_type, payment_required, job_date)
  values (ravi_id, 2, '09:30 AM', 'Sneha Joshi', 'Honda Activa', 'MH12CD5678', 'Basic Wash', 'Kothrud', 'Pune', 'pending', 'assigned', '2w', false, today)
  returning id into job2;

  insert into jobs (washer_id, sequence_number, scheduled_time, customer_name, customer_phone, vehicle_make, vehicle_reg, package_name, area, city, status, execution_stage, vehicle_type, payment_required, job_date)
  values (ravi_id, 3, '11:00 AM', 'Rohit Shah', '9900033333', 'Hyundai i20', 'MH12EF9012', 'Interior Add-on', 'Kothrud', 'Pune', 'in_progress', 'washing', 'addon', false, today)
  returning id into job3;

  insert into jobs (washer_id, sequence_number, scheduled_time, customer_name, vehicle_make, vehicle_reg, package_name, area, city, status, execution_stage, vehicle_type, payment_required, payment_method, payment_amount, payment_reference, payment_collected_at, job_date)
  values (ravi_id, 4, '07:00 AM', 'Kavita Rao', 'Toyota Innova', 'MH12GH3456', 'Premium Wash', 'Kothrud', 'Pune', 'done', 'done', '4w', true, 'cash', 350, null, now() - interval '2 hours', today)
  returning id into job4;

  insert into jobs (washer_id, sequence_number, scheduled_time, customer_name, vehicle_make, vehicle_reg, package_name, area, city, status, execution_stage, vehicle_type, payment_required, payment_method, payment_amount, payment_reference, payment_collected_at, job_date)
  values (ravi_id, 5, '06:30 AM', 'Manoj Tiwari', 'Bajaj Pulsar', 'MH12IJ7890', 'Basic Wash', 'Kothrud', 'Pune', 'done', 'done', '2w', true, 'upi', 80, 'UPI-REF-8821', now() - interval '3 hours', today)
  returning id into job5;

  insert into jobs (washer_id, sequence_number, scheduled_time, customer_name, vehicle_make, vehicle_reg, package_name, area, city, status, execution_stage, vehicle_type, payment_required, failure_reason, auto_reschedule, job_date)
  values (ravi_id, 6, '01:00 PM', 'Deepa Nair', 'Ford EcoSport', 'MH12KL1122', 'Premium Wash', 'Kothrud', 'Pune', 'issue', 'assigned', '4w', true, 'customer_unavailable', true, today)
  returning id into job6;

  insert into jobs (washer_id, sequence_number, scheduled_time, customer_name, vehicle_make, vehicle_reg, package_name, area, city, status, execution_stage, vehicle_type, payment_required, failure_reason, auto_reschedule, job_date)
  values (ravi_id, 7, '02:00 PM', 'Sanjay Gupta', 'TVS Jupiter', 'MH12MN3344', 'Basic Wash', 'Kothrud', 'Pune', 'issue', 'assigned', '2w', false, 'vehicle_unavailable', false, today)
  returning id into job7;

  insert into jobs (washer_id, sequence_number, scheduled_time, customer_name, vehicle_make, vehicle_reg, package_name, area, city, status, execution_stage, is_cover, vehicle_type, payment_required, override_reason, job_date)
  values (suresh_id, 1, '10:00 AM', 'Neha Kulkarni', 'Kia Seltos', 'MH12OP5566', 'Premium Wash', 'Kothrud', 'Pune', 'done', 'done', true, '4w', false, 'Original washer (Anita) marked absent — reassigned via cover redistribution', today)
  returning id into job8;

  -- Unassigned jobs today, Zone 4 area — for Job Assignment Queue / Dashboard's unassigned list
  insert into jobs (washer_id, sequence_number, scheduled_time, customer_name, vehicle_make, vehicle_reg, package_name, area, city, status, execution_stage, vehicle_type, payment_required, job_date)
  values (null, 8, '03:00 PM', 'Vivek Menon', 'Skoda Rapid', 'MH12QR7788', 'Premium Wash', 'Kothrud', 'Pune', 'pending', 'assigned', '4w', true, today)
  returning id into job_unassigned1;

  insert into jobs (washer_id, sequence_number, scheduled_time, customer_name, vehicle_make, vehicle_reg, package_name, area, city, status, execution_stage, vehicle_type, payment_required, job_date)
  values (null, 9, '04:00 PM', 'Pooja Malhotra', 'Yamaha FZ', 'MH12ST9900', 'Basic Wash', 'Kothrud', 'Pune', 'pending', 'assigned', '2w', false, today)
  returning id into job_unassigned2;

  -- Past completed jobs for Ravi — weighted-units history (30-day Completed tab)
  insert into jobs (washer_id, sequence_number, scheduled_time, customer_name, vehicle_make, vehicle_reg, package_name, area, city, status, execution_stage, vehicle_type, payment_required, job_date)
  values
    (ravi_id, 1, '08:00 AM', 'Old Customer 1', 'Maruti Baleno', 'MH12AA0001', 'Premium Wash', 'Kothrud', 'Pune', 'done', 'done', '4w', false, yesterday),
    (ravi_id, 2, '09:00 AM', 'Old Customer 2', 'Honda Activa', 'MH12AA0002', 'Basic Wash', 'Kothrud', 'Pune', 'done', 'done', '2w', false, yesterday),
    (ravi_id, 1, '08:00 AM', 'Old Customer 3', 'Tata Nexon', 'MH12AA0003', 'Premium Wash', 'Kothrud', 'Pune', 'done', 'done', '4w', false, two_days_ago),
    (ravi_id, 1, '08:00 AM', 'Old Customer 4', 'Maruti Swift', 'MH12AA0004', 'Premium Wash', 'Kothrud', 'Pune', 'done', 'done', '4w', false, last_week),
    (ravi_id, 2, '09:00 AM', 'Old Customer 5', 'Bajaj Pulsar', 'MH12AA0005', 'Add-on', 'Kothrud', 'Pune', 'done', 'done', 'addon', false, two_weeks_ago);

  -- Zone 7 job — exists purely so you can confirm Priya (Zone 4) never sees it
  insert into jobs (washer_id, sequence_number, scheduled_time, customer_name, vehicle_make, vehicle_reg, package_name, area, city, status, execution_stage, vehicle_type, payment_required, job_date)
  values (meena_id, 1, '09:00 AM', 'Zone7 Customer', 'Maruti Alto', 'MH14ZZ0001', 'Basic Wash', 'Wakad', 'Pune', 'done', 'done', '4w', false, today)
  returning id into job_zone7;

  -- ── Job photos: 4 required "after" directions on one completed job ─
  photo_job := job4;
  insert into job_photos (job_id, phase, direction, photo_url)
  values
    (photo_job, 'after', 'front', placeholder),
    (photo_job, 'after', 'back', placeholder),
    (photo_job, 'after', 'left', placeholder),
    (photo_job, 'after', 'right', placeholder)
  on conflict (job_id, phase, direction) do nothing;

  -- ── Attendance: present / late / absent / week_off / GPS-locked ────
  -- Ravi: normal present, still checked in (no checkout) — exercises
  -- the Earning Window banner on Home.
  insert into attendance (washer_id, date, status, check_in_time, selfie_url, gps_lat, gps_lng)
  values (ravi_id, today, 'present', now() - interval '90 minutes', placeholder, 18.5089, 73.8258)
  on conflict (washer_id, date) do nothing;

  -- Suresh: GPS-locked mid-shift, not yet unlocked — exercises the
  -- lockout banner (washer side) and "Unlock Check-In" (supervisor side).
  insert into attendance (washer_id, date, status, check_in_time, selfie_url, gps_lat, gps_lng, gps_lost_at)
  values (suresh_id, today, 'present', now() - interval '3 hours', placeholder, 18.5079, 73.8248, now() - interval '20 minutes')
  on conflict (washer_id, date) do nothing;

  -- Anita: absent today, no check-in.
  insert into attendance (washer_id, date, status)
  values (anita_id, today, 'absent')
  on conflict (washer_id, date) do nothing;

  -- Deepak: present, with a supervisor note already on file (Attendance Detail item).
  insert into attendance (washer_id, date, status, check_in_time, check_out_time, selfie_url, supervisor_note)
  values (deepak_id, today, 'present', now() - interval '6 hours', now() - interval '1 hour', placeholder, 'Arrived 15 minutes late, informed in advance — no penalty.')
  on conflict (washer_id, date) do nothing;

  -- Zone 7: Meena present, Arjun on week_off — for zone-isolation checks on Dashboard/Team Status.
  insert into attendance (washer_id, date, status, check_in_time, selfie_url)
  values (meena_id, today, 'present', now() - interval '4 hours', placeholder)
  on conflict (washer_id, date) do nothing;

  insert into attendance (washer_id, date, status)
  values (arjun_id, today, 'week_off')
  on conflict (washer_id, date) do nothing;

  -- Ravi: a spread of past attendance across this month and last month, for the History toggle.
  insert into attendance (washer_id, date, status, check_in_time, check_out_time)
  values
    (ravi_id, yesterday, 'present', (yesterday::timestamptz + interval '8 hours'), (yesterday::timestamptz + interval '17 hours')),
    (ravi_id, two_days_ago, 'late', (two_days_ago::timestamptz + interval '9 hours 30 minutes'), (two_days_ago::timestamptz + interval '18 hours')),
    (ravi_id, last_week, 'present', (last_week::timestamptz + interval '8 hours'), (last_week::timestamptz + interval '17 hours')),
    (ravi_id, last_month_date, 'absent', null, null),
    (ravi_id, last_month_date - 1, 'week_off', null, null)
  on conflict (washer_id, date) do nothing;

  -- ── Stock items: normal / low / none ────────────────────────────
  insert into stock_items (washer_id, material_name, issued_qty, remaining_qty, unit, reorder_level)
  values
    (ravi_id, 'Microfiber Cloth', 40, 6, 'pcs', 10),   -- low
    (ravi_id, 'Chamois Cloth', 10, 8, 'pcs', 3),        -- ok
    (ravi_id, 'Shampoo Concentrate', 5, 4, 'ltr', 1),   -- ok
    (ravi_id, 'Car Wax', 3, 0, 'ltr', 1);                -- out entirely

  insert into stock_items (washer_id, material_name, issued_qty, remaining_qty, unit, reorder_level)
  values (suresh_id, 'Microfiber Cloth', 30, 25, 'pcs', 10);
  -- Anita deliberately has zero stock_items rows — tests the "No stock items assigned" empty state.

  insert into stock_items (washer_id, material_name, issued_qty, remaining_qty, unit, reorder_level)
  values (meena_id, 'Microfiber Cloth', 35, 30, 'pcs', 10);

  -- ── Payouts ──────────────────────────────────────────────────────
  insert into payouts (washer_id, label, amount, payout_date)
  values
    (ravi_id, 'Base Pay', 450, today),
    (ravi_id, 'Incentive Bonus', 120, today),
    (ravi_id, 'Base Pay', 420, yesterday),
    (ravi_id, 'Weekly Bonus', 300, last_week);

  insert into payouts (washer_id, label, amount, payout_date)
  values (meena_id, 'Base Pay', 400, today);

  -- ── Issues: every category × stock/routing variant × zone ──────────
  -- Plain free-text issue, no category — washer-filed.
  insert into issues (reported_by, title, status)
  values (ravi_id, 'Bucket handle broken, needs replacement', 'open');

  -- broken_part, resolved.
  insert into issues (reported_by, title, status, category, item_name, resolved_at)
  values (anita_id, 'Broken Part — Pressure washer nozzle', 'resolved', 'broken_part', 'Pressure washer nozzle', now() - interval '1 day');

  -- lost_damaged_bottle, filed by Priya ON BEHALF OF Suresh, with a real stock deduction.
  insert into issues (reported_by, title, status, category, item_name, qty_deducted)
  values (suresh_id, 'Lost/Damaged Bottle — Shampoo bottle', 'open', 'lost_damaged_bottle', 'Shampoo bottle', 1);

  -- repair_request routed to Central, spare already issued.
  insert into issues (reported_by, title, status, category, item_name, routing_status, spare_issued)
  values (priya_id, 'Repair Request — Vacuum motor', 'open', 'repair_request', 'Vacuum motor', 'pending_central', true);

  -- pre_damage tied to a specific job, with a photo — resolved.
  insert into issues (reported_by, title, status, category, item_name, job_id, photo_url, resolved_at)
  values (ravi_id, 'Pre-Existing Damage — MH12GH3456', 'resolved', 'pre_damage', 'Scratch on rear bumper, already present', job4, placeholder, now() - interval '2 hours');

  -- Supervisor's OWN filed issue (no washer picked) — confirms Priya can still see/resolve her own reports post zone-scoping fix.
  insert into issues (reported_by, title, status)
  values (priya_id, 'Zone 4 storeroom lock needs replacing', 'open');

  -- Zone 7 issue — confirms Priya does NOT see this in her Alert Center.
  insert into issues (reported_by, title, status, category, item_name)
  values (meena_id, 'Broken Part — Zone 7 buffer machine', 'open', 'broken_part', 'Buffer machine');

  -- ── Audits: pending / every grade / GPS exception / photo flag ─────
  insert into audits (washer_id, vehicle_make, vehicle_reg, audit_status, job_id)
  values (ravi_id, 'Toyota Innova', 'MH12GH3456', 'pending', job4);

  insert into audits (washer_id, vehicle_make, vehicle_reg, audit_status, completed_at, uniform_score, materials_score, process_score, photo_score, total_score, grade, notes, checklist)
  values (ravi_id, 'Hyundai i20', 'MH12EF9012', 'completed', now() - interval '3 days', 20, 28, 29, 20, 97, 'pass', 'Excellent turnout, textbook process.', '{"uniform":{"Clean uniform":true},"materials":{"Correct products used":true},"process":{"Followed checklist":true},"photos":["' || placeholder || '"]}'::jsonb);

  insert into audits (washer_id, vehicle_make, vehicle_reg, audit_status, completed_at, uniform_score, materials_score, process_score, photo_score, total_score, grade, notes, checklist, gps_exception_reason, photo_authenticity_flagged, photo_authenticity_note)
  values (suresh_id, 'Kia Seltos', 'MH12OP5566', 'completed', now() - interval '5 days', 12, 18, 16, 10, 56, 'major', 'Uniform not up to standard, missed several process steps.', '{"uniform":{"Clean uniform":false},"materials":{"Correct products used":true},"process":{"Followed checklist":false},"photos":["' || placeholder || '"]}'::jsonb, 'Audited from the street outside customer gate — GPS reading was ~150m off the job location.', true, 'After-photo timestamp is 40 minutes later than the audit visit time — flagging for review.');

  insert into audits (washer_id, vehicle_make, vehicle_reg, audit_status, completed_at, uniform_score, materials_score, process_score, photo_score, total_score, grade, notes, checklist)
  values (anita_id, 'Ford EcoSport', 'MH12KL1122', 'completed', now() - interval '10 days', 8, 10, 12, 5, 35, 'failed', 'Multiple critical failures — retrain required.', '{"uniform":{},"materials":{},"process":{},"photos":[]}'::jsonb);

  insert into audits (washer_id, vehicle_make, vehicle_reg, audit_status, completed_at, uniform_score, materials_score, process_score, photo_score, total_score, grade, notes, checklist)
  values (meena_id, 'Maruti Alto', 'MH14ZZ0001', 'completed', now() - interval '2 days', 16, 22, 24, 15, 77, 'minor', 'Good overall, minor process gaps.', '{"uniform":{},"materials":{},"process":{},"photos":[]}'::jsonb);

  -- ── Alerts (broadcast) — zone-scoped and one all-zone edge case ────
  insert into alerts (zone, message)
  values
    ('Zone 4', 'Reminder: submit today''s cash register before 8 PM.'),
    ('Zone 7', 'New pressure washers arriving at the Zone 7 store tomorrow.');

  -- No zone set — per how the app's zone filter works (SQL `eq` never
  -- matches null), this row currently won't show to ANY zone-scoped
  -- supervisor. Seeded deliberately so you can see/decide on that
  -- behavior rather than have it hidden by omission.
  insert into alerts (zone, message)
  values (null, 'Company-wide: annual uniform re-issue starts next week.');

  -- ── Cloth exchanges (historical hand-over log) ──────────────────────
  insert into cloth_exchanges (washer_id, used_returned, new_received, created_at)
  values
    (ravi_id, 8, 8, now() - interval '3 days'),
    (ravi_id, 4, 4, now() - interval '1 day');

  -- ── Cloth units: clean / dirty / locked / expired ───────────────────
  insert into cloth_units (barcode, washer_id, state, wash_count)
  values
    ('CLU-1001', ravi_id, 'clean', 3),
    ('CLU-1002', ravi_id, 'clean', 1),
    ('CLU-1003', null, 'dirty', 12),
    ('CLU-1004', ravi_id, 'locked', 20),
    ('CLU-1005', null, 'expired', 45)
  on conflict (barcode) do nothing;

  -- ── SOS alerts: active (needs zone isolation check) + resolved ──────
  insert into sos_alerts (washer_id, gps_lat, gps_lng, message, status)
  values (anita_id, 18.5093, 73.8267, 'Vehicle broke down, need help getting back', 'active');

  insert into sos_alerts (washer_id, gps_lat, gps_lng, message, status, resolved_at, resolved_by)
  values (ravi_id, 18.5100, 73.8200, 'Felt unwell, resolved after resting', 'resolved', now() - interval '1 day', priya_id);

  -- Zone 7 SOS — confirms Priya's Alert Center does NOT show this.
  insert into sos_alerts (washer_id, gps_lat, gps_lng, message, status)
  values (meena_id, 18.5980, 73.7610, 'Locked out of customer premises, waiting', 'active');

  -- ── Notifications: read + unread mix ────────────────────────────────
  insert into notifications (profile_id, title, body, read_at)
  values
    (ravi_id, 'New job assigned', 'Toyota Innova · MH12GH3456 at 07:00 AM', now() - interval '2 days'),
    (ravi_id, 'Advance request pending', 'Your advance request is awaiting approval.', null),
    (ravi_id, 'Check-in unlocked', 'Your supervisor has unlocked check-in.', null),
    (suresh_id, 'Cover request approved', 'Your cover request was approved.', now() - interval '5 hours');

  -- ── Advance requests: pending / approved / rejected / self-submitted ─
  insert into advance_requests (washer_id, amount, reason, status)
  values (ravi_id, 2000, 'Medical expense for family member', 'pending');

  insert into advance_requests (washer_id, amount, reason, status, resolved_at)
  values (suresh_id, 1500, 'Rent due', 'approved', now() - interval '3 days');

  insert into advance_requests (washer_id, amount, reason, status, resolved_at)
  values (anita_id, 3000, 'Personal', 'rejected', now() - interval '1 day');

  -- Priya's OWN advance request — after the audit fix, this should not
  -- appear in ANY supervisor's Alert Center (no self-approval path).
  insert into advance_requests (washer_id, amount, reason, status)
  values (priya_id, 5000, 'Vehicle repair for site visits', 'pending');

  -- Zone 7 request — confirms Priya does not see it.
  insert into advance_requests (washer_id, amount, reason, status)
  values (meena_id, 1000, 'Family emergency', 'pending');

  -- ── Cover requests ───────────────────────────────────────────────────
  insert into cover_requests (washer_id, cover_date, reason, status)
  values (ravi_id, today + 5, 'Attending a family wedding', 'pending');

  insert into cover_requests (washer_id, cover_date, reason, status, resolved_at)
  values (suresh_id, today + 2, 'Medical appointment', 'approved', now() - interval '1 day');

  -- ── Cash deposits (reconciling job4's cash payment) ─────────────────
  insert into cash_deposits (washer_id, amount, deposit_date, recorded_by)
  values (ravi_id, 350, today, priya_id);

  -- ── Leave balances — pre-seeded with partial usage (Ravi); Suresh is
  -- left unseeded so you can test the app's own auto-provisioning path.
  insert into leave_balances (washer_id, leave_type, total, used)
  values
    (ravi_id, 'CL', 7, 2),
    (ravi_id, 'PL', 10, 0),
    (ravi_id, 'SL', 7, 1),
    (ravi_id, 'UL', 0, 0)
  on conflict (washer_id, leave_type) do nothing;

  insert into leave_balances (washer_id, leave_type, total, used)
  values
    (anita_id, 'CL', 7, 5),
    (anita_id, 'PL', 10, 3),
    (anita_id, 'SL', 7, 0),
    (anita_id, 'UL', 0, 0)
  on conflict (washer_id, leave_type) do nothing;

  -- ── Leave requests: pending / approved / self-submitted ─────────────
  insert into leave_requests (washer_id, leave_type, start_date, end_date, reason, status)
  values (ravi_id, 'CL', today + 3, today + 4, 'Personal work', 'pending');

  insert into leave_requests (washer_id, leave_type, start_date, end_date, reason, status, resolved_at)
  values (anita_id, 'PL', last_week, last_week + 2, 'Family function', 'approved', now() - interval '6 days');

  -- Priya's own leave request — same self-approval test as advance_requests above.
  insert into leave_requests (washer_id, leave_type, start_date, end_date, reason, status)
  values (priya_id, 'SL', today + 1, today + 1, 'Not feeling well', 'pending');

  -- ── Regularization requests: insert-branch vs update-branch on approve ─
  -- target_date has NO existing attendance row → approving this inserts one.
  insert into regularization_requests (profile_id, target_date, requested_status, reason, status)
  values (suresh_id, today - 3, 'present', 'Forgot to check in, was on-site all day', 'pending');

  -- target_date already has a row (yesterday, seeded above as 'present')
  -- → approving this updates it instead.
  insert into regularization_requests (profile_id, target_date, requested_status, reason, status)
  values (ravi_id, yesterday, 'late', 'Traffic delay, checked in late but system logged present', 'pending');

  insert into regularization_requests (profile_id, target_date, requested_status, reason, status, resolved_at)
  values (anita_id, two_weeks_ago, 'present', 'System error on check-in', 'approved', now() - interval '10 days');

  -- ── Payslips (read-only display) ────────────────────────────────────
  insert into payslips (profile_id, month, gross, deductions, net, notes)
  values
    (ravi_id, this_month_start, 18500, 1200, 17300, 'Includes incentive bonus'),
    (ravi_id, (this_month_start - interval '1 month')::date, 17800, 1150, 16650, null),
    (priya_id, this_month_start, 32000, 2800, 29200, null)
  on conflict (profile_id, month) do nothing;

  -- ── Expense claims: travel / fuel / medical / self-submitted ────────
  insert into expense_claims (profile_id, category, amount, description, from_location, to_location, distance_km, receipt_url, status)
  values (ravi_id, 'travel', 180, 'Auto fare to a far customer site', 'Kothrud', 'Hinjewadi', 14.5, placeholder, 'pending');

  insert into expense_claims (profile_id, category, amount, description, status, resolved_at)
  values (suresh_id, 'fuel', 250, 'Bike fuel for the week', 'approved', now() - interval '2 days');

  insert into expense_claims (profile_id, category, amount, description, status, resolved_at)
  values (anita_id, 'medical', 600, 'First-aid for a minor cut on site', 'rejected', now() - interval '1 day');

  -- Priya's own claim — self-approval test again.
  insert into expense_claims (profile_id, category, amount, description, status)
  values (priya_id, 'other', 450, 'Printing attendance sheets for the zone', 'pending');

  -- ── Tax documents ────────────────────────────────────────────────────
  insert into tax_documents (profile_id, label, file_url)
  values
    (ravi_id, 'Form 16 (2025-26)', placeholder),
    (priya_id, 'PAN Card', placeholder);

  -- ── Stock requests: washer replenishment + supervisor buffer refill ──
  insert into stock_requests (profile_id, material_name, requested_qty, reason, status)
  values (ravi_id, 'Microfiber Cloth', 20, 'Running low, 3 jobs left today', 'pending');

  insert into stock_requests (profile_id, material_name, requested_qty, reason, status, resolved_at)
  values (suresh_id, 'Car Wax', 5, null, 'approved', now() - interval '2 days');

  insert into stock_requests (profile_id, material_name, requested_qty, reason, status)
  values (priya_id, 'Shampoo Concentrate', 10, 'Zone 4 buffer running low ahead of the weekend', 'pending');

  -- ── Demo requests: pending / accepted ───────────────────────────────
  insert into demo_requests (washer_id, customer_name, customer_phone, vehicle_info, area, scheduled_time, status)
  values (ravi_id, 'Rahul Bansal', '9900099999', 'Maruti Baleno', 'Kothrud', '05:00 PM', 'pending');

  insert into demo_requests (washer_id, customer_name, vehicle_info, area, scheduled_time, status, resolved_at)
  values (suresh_id, 'Priyanka Singh', 'Hyundai Creta', 'Kothrud', '06:00 PM', 'accepted', now() - interval '1 day');

  -- ── Stock receipts + supervisor buffer + issuance to a washer ───────
  insert into stock_receipts (supervisor_id, challan_number, material_name, received_qty, damaged_qty, shortfall_notes)
  values (priya_id, 'CH-2026-0417', 'Shampoo Concentrate', 20, 1, '1 bottle arrived cracked, noted with courier');

  insert into supervisor_stock (supervisor_id, material_name, buffer_qty, unit)
  values
    (priya_id, 'Shampoo Concentrate', 19, 'ltr'),
    (priya_id, 'Microfiber Cloth', 40, 'pcs')
  on conflict (supervisor_id, material_name) do nothing;

  insert into material_issuances (supervisor_id, washer_id, material_name, qty)
  values (priya_id, ravi_id, 'Microfiber Cloth', 5);

  -- ── Uniform issuances: entitlement + replacement (returned) ─────────
  insert into uniform_issuances (profile_id, issued_by, reason, notes, damaged_returned)
  values (ravi_id, priya_id, 'entitlement', 'Annual issue', false);

  insert into uniform_issuances (profile_id, issued_by, reason, notes, damaged_returned)
  values (suresh_id, priya_id, 'replacement', 'Shirt torn on the job, old one returned', true);

  -- ── Cash register: one for TODAY (to hit the "already submitted"
  -- duplicate error if you try to submit another) + one historical ────
  insert into cash_registers (supervisor_id, shift_date, cash_total, upi_total, link_total, deposit_reference)
  values (priya_id, today, 1250, 890, 300, 'BANKDEP-TODAY-001')
  on conflict (supervisor_id, shift_date) do nothing;

  insert into cash_registers (supervisor_id, shift_date, cash_total, upi_total, link_total, deposit_reference)
  values (priya_id, yesterday, 1100, 760, 200, 'BANKDEP-Y-001')
  on conflict (supervisor_id, shift_date) do nothing;

  -- ── Subscription cash deposit ────────────────────────────────────────
  insert into subscription_cash_deposits (supervisor_id, customer_name, customer_phone, amount, bank_reference, notes)
  values (priya_id, 'Rajesh Iyer', '9900012345', 4200, 'UTR-99881122', '3-month subscription renewal');

  -- ── Periodic schedules: due-soon / at-cap-this-month / stale-cap-from-
  -- last-month (tests the lazy monthly reset) / not-due-soon / zone 7 ──
  insert into periodic_schedules (customer_name, customer_phone, area, zone, service_name, frequency_days, next_due_date, monthly_cap, used_this_month)
  values ('Ashok Mehta', '9900054321', 'Kothrud', 'Zone 4', 'Monthly Premium Wash', 30, today + 3, 2, 0);

  -- At cap, but last touched THIS month — reschedule should correctly
  -- show "Monthly cap reached."
  insert into periodic_schedules (customer_name, area, zone, service_name, frequency_days, next_due_date, monthly_cap, used_this_month, updated_at)
  values ('Geeta Nambiar', 'Kothrud', 'Zone 4', 'Weekly Basic Wash', 7, today + 1, 1, 1, now() - interval '2 days');

  -- At cap, but last touched LAST month — first reschedule attempt this
  -- month should lazily reset used_this_month to 0 before checking the cap.
  insert into periodic_schedules (customer_name, area, zone, service_name, frequency_days, next_due_date, monthly_cap, used_this_month, updated_at)
  values ('Farhan Sheikh', 'Kothrud', 'Zone 4', 'Monthly Premium Wash', 30, today + 5, 1, 1, last_month_date);

  -- Not due for a while — should NOT appear in the "Due in Next 7 Days" list.
  insert into periodic_schedules (customer_name, area, zone, service_name, frequency_days, next_due_date, monthly_cap, used_this_month)
  values ('Ramesh Chandra', 'Kothrud', 'Zone 4', 'Monthly Premium Wash', 30, today + 20, 2, 0);

  insert into periodic_schedules (customer_name, area, zone, service_name, frequency_days, next_due_date, monthly_cap, used_this_month)
  values ('Zone7 Customer B', 'Wakad', 'Zone 7', 'Monthly Premium Wash', 30, today + 2, 2, 0);

  -- ── Daily flow progress: Priya partway through today, Vikram untouched ─
  insert into daily_flow_progress (supervisor_id, flow_date, completed_steps)
  values (priya_id, today, '["pre_day_briefing", "team_checkin_verified", "job_assignments_confirmed"]'::jsonb)
  on conflict (supervisor_id, flow_date) do nothing;
  -- Vikram deliberately has no row — exercises the auto-create-on-first-open path.

  -- ── Activity log: spread across every category ──────────────────────
  insert into activity_log (actor_id, category, action, details, gps_lat, gps_lng, gps_verified)
  values
    (priya_id, 'attendance', 'Manual attendance override', 'Marked Anita Desai absent', null, null, false),
    (priya_id, 'audit', 'Audit completed', 'Suresh Patil — Kia Seltos — Major', 18.5089, 73.8258, true),
    (priya_id, 'cloth', 'Stock receipt confirmed', 'Shampoo Concentrate · received 20, damaged 1 (challan CH-2026-0417)', null, null, false),
    (priya_id, 'escalation', 'Case raised: Quality Dispute', 'Customer complained about incomplete interior cleaning', null, null, false),
    (vikram_id, 'other', 'Subscription cash deposit recorded', 'Rajesh Iyer · ₹4200.00', null, null, false);

  -- ── Escalations: pending / resolved / no-washer-picked ───────────────
  insert into escalations (raised_by, washer_id, case_type, reason, details, status)
  values (priya_id, ravi_id, 'quality_dispute', 'Customer complained about incomplete interior cleaning', 'Customer requested partial refund credit for next visit.', 'pending');

  insert into escalations (raised_by, washer_id, case_type, reason, status, resolved_at)
  values (priya_id, suresh_id, 'missed_visit_credit', 'Washer never arrived, no prior notice', 'resolved', now() - interval '4 days');

  insert into escalations (raised_by, washer_id, case_type, reason, status)
  values (priya_id, null, 'other', 'Requesting extra float cash for the zone this week', 'pending');

  -- ── Schedule pauses: one ACTIVE (tests Dashboard exclusion), one resolved ─
  insert into schedule_pauses (washer_id, reason, paused_by)
  values (anita_id, 'Under performance review after the failed audit — holding new job assignments', priya_id);

  insert into schedule_pauses (washer_id, reason, paused_by, paused_at, resumed_at)
  values (suresh_id, 'Awaiting uniform replacement', priya_id, now() - interval '5 days', now() - interval '3 days');

  -- ── Batch invalidation (log-only, no cascade — see schema comment) ───
  insert into batch_invalidations (batch_id, reason, invalidated_by)
  values ('BATCH-2026-0410-A', 'Duplicate batch created by a scheduling error, invalidating', priya_id);

end $$;

select 'seed data applied' as result;
