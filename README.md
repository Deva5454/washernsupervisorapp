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
   - Already ran the *old* version of this schema (the one that tied
     profiles to a Supabase Auth account) against this project? Run
     `supabase_no_login_migration.sql` instead — `supabase_schema.sql`'s
     `create table if not exists` won't retroactively fix an
     already-created table.

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
`attendance`, `stock_items`, `payouts`, `issues`, `audits`, `alerts`.

Beyond the two seeded profiles, there's no other seed/demo data — every
screen reads real rows from these tables, so a fresh project will show
empty jobs/stock/earnings lists until you add some (either by hand in
the Supabase Table Editor, or by building out an admin flow later).
