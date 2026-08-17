# CleanCar Field App

Standalone mobile web app for car washers and supervisors, built with
Vite + React + TypeScript + Tailwind CSS, backed by Supabase (Postgres +
Auth), deployed on Vercel.


## Setup

1. **Supabase**
   - Create a project at [supabase.com](https://supabase.com/dashboard).
   - Open the SQL Editor → New Query, paste the entire contents of
     `supabase_schema.sql`, and run it.
   - In **Authentication → Providers**, make sure Email is enabled.
   - Create your first users under **Authentication → Users → Add User**
     (email + password). Each new user automatically gets a row in
     `profiles` with `role = 'washer'`. To make someone a supervisor, run
     in the SQL Editor:
     ```sql
     update profiles set role = 'supervisor' where id = '<their-user-uuid>';
     ```
     (find the UUID in Authentication → Users).
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

## Demo mode (skip the login screen)

By default every visitor has to sign in — that's what lets the app tell
washers/supervisors apart and keep their data separate. If you just want
to show the app off from one shared account with no login step, set two
more environment variables (locally in `.env.local`, or in Vercel under
Project Settings → Environment Variables):

```
VITE_DEMO_EMAIL=demo@cleancar.app
VITE_DEMO_PASSWORD=<a password you choose>
```

Then create a Supabase user with that exact email/password
(Authentication → Users → Add User) — the app signs in as that account
automatically on load. Leave both variables unset (the default) for real
multi-user staff use, since a demo account gives every visitor the same
identity and the same data.

## Data model

See `supabase_schema.sql` for the full schema. In short: `profiles` (one
row per user, `role` is `washer` or `supervisor`), `jobs`, `attendance`,
`stock_items`, `payouts`, `issues`, `audits`, `alerts`. Row Level Security
is on for every table — a washer only sees their own rows; a supervisor
(via the `is_supervisor()` policy helper) sees everyone's.

There's no demo/seed data — every screen reads real rows from these
tables, so a fresh project will show empty states until you add jobs,
stock, etc. (either by hand in the Supabase Table Editor, or by building
out an admin flow later).
