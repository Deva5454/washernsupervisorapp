# CleanCar Field App

Standalone mobile web app for car washers and supervisors, built with
Vite + React + TypeScript + Tailwind CSS, backed by Supabase (Postgres),
deployed on Vercel.

**There is no login screen and no account to create.** The app opens
directly into a "Car Washer" / "Supervisor" toggle in the top bar
(switches views locally, stored in your browser — not an account
switch). Two people are seeded by the schema itself — Ravi Kumar
(washer) and Priya Sharma (supervisor), same names as the reference
prototype — so the app has something real to show the moment the schema
is created. See **Access model** below for what "no login" actually
means and trades away.

## Setup

1. **Supabase**
   - Create a project at [supabase.com](https://supabase.com/dashboard).
   - Open the SQL Editor → New Query, paste the entire contents of
     `supabase_schema.sql`, and run it. That's the only Supabase step —
     it creates the tables, opens them up for the app's anon key, and
     seeds the two profiles above.
   - Grab your **Project URL** and **anon/public key** from
     Settings → API.
   - Already have a project running an earlier version of this schema?
     Run the matching migration instead of the full file:
     - Had the old auth-tied `profiles` → `supabase_no_login_migration.sql`
     - Had no-login but no Active Wash tables/columns yet →
       `supabase_active_wash_migration.sql`
     - Had Active Wash but no urgent flag / cloth limit / cloth exchange
       log yet → `supabase_urgent_cloth_migration.sql`
     `supabase_schema.sql`'s `create table if not exists` /
     `add column if not exists` won't retroactively fix an
     already-created table in every case.

2. **Local development**
   ```bash
   npm install
   cp .env.example .env.local
   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local
   npm run dev
   ```

3. **Deploy to Vercel**
   - Import this repo in Vercel (framework auto-detected as Vite).
   - Add the same two environment variables
     (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in
     Project Settings → Environment Variables.
   - Deploy.

## Access model

This app runs with **no authentication and no per-user data
separation**. Anyone with the deployed URL sees and can edit the same
data as everyone else. This is a deliberate simplification for a small
internal single-team tool, traded off against the setup/friction of
real login.

If that stops being the right tradeoff (multiple real teams, sensitive
per-employee data, needing to know *which* washer actually did what),
the fix is a real sign-in screen backed by Supabase Auth, with
`profiles.id` tied back to `auth.users` and RLS scoped by `auth.uid()`
instead of the current flat "allow anon everything" policies — that's
exactly what this schema looked like before this rewrite, so it's a
known, reversible path if you ever need it.

## Data model

See `supabase_schema.sql` for the full schema. In short: `profiles` (one
row per person, `role` is `washer` or `supervisor`), `jobs`,
`attendance`, `stock_items`, `payouts`, `issues`, `audits`, `alerts`,
`job_photos`, `cloth_exchanges`.

`profiles.cloth_limit` is a per-washer cap on cloths receivable in one
hand-over. It's owned and set by the **City Manager** role, which lives
in a separate (ERP) web app this one connects to — nothing in this app
writes that column, it's read-only here.

Beyond the two seeded profiles, there's no other seed/demo data — every
screen reads real rows from these tables, so a fresh project will show
empty jobs/stock/earnings lists until you add some (either by hand in
the Supabase Table Editor, or by building out an admin flow later).

## Active Wash flow

Starting a job (Jobs tab → Start) opens a real in-progress flow, not
just a status badge:

- A 5-stage stepper (Assigned → En Route → Arrived → Washing → Done) the
  washer advances through.
- **En Route**: a "Navigate" button opens Google Maps directions to the
  job's address; "Call" opens a direct `tel:` link to `jobs.customer_phone`
  when set. There is **no number masking** — the app shows/dials the real
  number as-is. If you want washer↔customer calls to go through a masked
  number instead (neither side sees the other's real number), that's a
  telephony-provider integration (Exotel/Knowlarity-style) that has to be
  wired in separately; the `tel:` link in `ActiveWash.tsx` is the single
  place to swap for that provider's call-initiation API once you have one.
- **Washing**: 4 required proof-of-work photos (front/back/left/right,
  captured via the phone's camera), plus an optional 4 more before-photos
  in the same 4 directions. "Mark Job Complete" is disabled until the 4
  required photos exist.

Check-in (Home tab) requires a real selfie and a real GPS fix — both are
stored on the `attendance` row (`selfie_url`, `gps_lat`, `gps_lng`). If a
checked-in washer's location access gets turned off, the app detects
that automatically, records `attendance.gps_lost_at`, logs them out, and
shows a visible in-app notice explaining why — never a silent logout.
Checking in again later the same day updates that same attendance row
(one per washer per day) and clears `gps_lost_at`.

Camera and location capture use the browser's native `<input capture>`
and Geolocation APIs — no extra SDK, but both require the browser to
have camera/location permission, and only work over HTTPS (Vercel's
deployment is HTTPS by default; `localhost` also works for local dev).

## Supervisor check-in

Supervisors punch in/out with the same real selfie + GPS verification as
washers (`CheckInPanel`, shared by both Home and Dashboard), including
the same GPS-loss auto-logout behavior — `attendance.washer_id` is a
generic profile FK despite the name, so both roles share one table.

## Urgent jobs, packages, and stock

- `jobs.is_urgent` highlights a job card in red with an "Urgent" badge
  across Active/Upcoming/Completed. There's no UI here to *set* it yet —
  it's meant to be set by whatever system assigns jobs (e.g. the
  connected ERP app); this app only displays it. Package name, date, and
  time are always shown on every job card.
- Every "Mark Job Complete" automatically deducts 4 cloths from the
  washer's cloth stock item (matched by `material_name` containing
  "cloth", case-insensitive). If no such stock item exists yet, nothing
  is deducted — it's not an error.
- **My Stock → Cloth Hand-Over** lets a washer log how many used cloths
  they returned and new ones they received from their supervisor
  (`cloth_exchanges`), crediting the received count back into stock.
  `new_received` is capped by `profiles.cloth_limit` when it's set.

## Attendance History

The washer's **More → Attendance History** shows real calendar months,
not a rolling window: **This Month** (the 1st through today) and **Last
Month** (the 1st through the last day of the previous month).

## Completed jobs & daily target

The washer's **Jobs → Completed** tab shows the last 30 days of
completed jobs grouped by day. Any day where completed jobs reach the
`DAILY_UNIT_TARGET` (25, hardcoded in `Jobs.tsx` to match the base daily
quota used elsewhere in the wider CleanCar system) gets a "Target hit"
badge.
