# CleanCar Field App

Standalone mobile web app for car washers and supervisors, built with
Vite + React + TypeScript + Tailwind CSS, backed by Supabase (Postgres),
deployed on Vercel.

**There is no login screen.** The app opens directly into the last-picked
role's view (a "Car Washer" / "Supervisor" toggle in the top bar switches
between them, stored locally in your browser — it's a view switch, not an
account switch). See **Access model** below for what this means and how
to set it up.

## Setup

1. **Supabase**
   - Create a project at [supabase.com](https://supabase.com/dashboard).
   - Open the SQL Editor → New Query, paste the entire contents of
     `supabase_schema.sql`, and run it.
   - Also run `supabase_no_auth_policies.sql` (SQL Editor → New Query,
     paste, run) — required, since the app makes every request
     unauthenticated. Read the comment at the top of that file first; it
     explains exactly what it opens up.
   - Under **Authentication → Users → Add User**, create at least one
     user (any email/password — nobody signs in with it). It
     automatically gets a row in `profiles` with `role = 'washer'`. To
     get a supervisor view too, either create a second user and promote
     it, or promote the same one:
     ```sql
     update profiles set role = 'supervisor' where id = '<user-uuid>';
     ```
     (find the UUID in Authentication → Users). The app shows whichever
     profile row has the matching role — if you only ever create one
     user, only that one role will have real data to show.
   - Grab your **Project URL** and **anon/public key** from
     Settings → API.

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
data as everyone else — there's no concept of "your" jobs vs. someone
else's beyond which Supabase profile row the app currently happens to be
showing. This is a deliberate simplification for a small internal
single-team tool, traded off against the setup/friction of real login.

If that stops being the right tradeoff (multiple real teams, sensitive
per-employee data, needing to know *which* washer actually did what),
the fix is: drop the 8 `anon_all_*` policies added by
`supabase_no_auth_policies.sql`, and reintroduce a real sign-in screen
(Supabase Auth's `signInWithPassword`, already used correctly by the
`is_supervisor()` / per-`washer_id` policies still sitting in
`supabase_schema.sql`, untouched and ready for that).

## Data model

See `supabase_schema.sql` for the full schema. In short: `profiles` (one
row per user, `role` is `washer` or `supervisor`), `jobs`, `attendance`,
`stock_items`, `payouts`, `issues`, `audits`, `alerts`.

There's no demo/seed data — every screen reads real rows from these
tables, so a fresh project will show empty states until you add jobs,
stock, etc. (either by hand in the Supabase Table Editor, or by building
out an admin flow later).
