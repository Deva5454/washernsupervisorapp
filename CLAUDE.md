# Working conventions for this repo

## Delivering changes: patch via PowerShell (confirmed no push access)

This environment's GitHub credentials do not have push access to
`Deva5454/washernsupervisorapp` — confirmed repeatedly (`git push` and
`create_repository` both return `403 Resource not accessible by
integration`, on this repo and others, regardless of who owns the repo).

**Rule: always try a direct push first if anything changes about the
environment's access; fall back to a patch immediately on any 403 rather
than retrying.** Until that changes, every change is delivered as a
`git format-patch` file via SendUserFile, with the exact apply commands
in the same message — never make the user ask for them.

### Before generating any patch: sync with the true remote state first

```bash
git fetch origin
git reset --hard FETCH_HEAD   # only if the local clone has no unpushed work worth keeping
```

The user can and does edit files directly on GitHub's website (e.g. to
trigger a Vercel deploy without touching PowerShell) — those edits never
reach a local clone through git alone. A patch generated against a stale
base fails with `patch does not apply` even though the diff looks
correct in isolation. Always fetch and confirm the local branch matches
`origin/main` before running `git format-patch`.

### Standard apply sequence (give this exact block, adjusted per patch)

```powershell
cd E:\washernsupervisorapp\washernsupervisorapp
git pull origin main
$downloads = (New-Object -ComObject Shell.Application).Namespace('shell:Downloads').Self.Path
git am "$downloads\<patch-filename>.patch"
git push origin main
```

Notes learned from real sessions with this user:

- Their actual local clone lives at
  `E:\washernsupervisorapp\washernsupervisorapp`.
- `$env:USERPROFILE\Downloads` does not reliably resolve to where the
  browser saves files on this machine — always use the
  `Shell.Application` COM lookup above, not the plain env var path.
- **The user must actually click the file card in the chat to download
  it** — SendUserFile only posts the card, it doesn't save to disk.
  If `git am` reports the file doesn't exist, that's almost always why;
  confirm with
  `Get-ChildItem $downloads -Filter "*.zip"` (or `*.patch`)
  `| Sort-Object LastWriteTime -Descending | Select-Object -First 5`
  before assuming anything else is wrong.
- Downloaded patch filenames get **dashes stripped** by the browser/OS
  (e.g. `0001-add-thing.patch` → `0001addthing.patch`). Never guess the
  apply filename — have the user run a `Get-ChildItem -Filter` check and
  use the exact name it prints. A re-download of the same file lands as
  `name (1).patch` — use the newest one shown.
- If `git am` fails with "patch does not apply," don't retry the same
  patch — run `git am --abort`, sync the local sandbox clone with
  `git fetch origin && git reset --hard FETCH_HEAD` (recovering any
  not-yet-pushed local work first via `git reflog` /
  `git show <sha>:<path>` if needed), regenerate the patch against that
  true base, and send the corrected one with a note explaining why the
  first one failed.
- If `git push` fails with a permission error naming an unexpected
  GitHub username (not `Deva5454`), that's the user's own machine having
  a different account cached in Windows Credential Manager — not
  anything on this end. Direct them to Credential Manager → Windows
  Credentials → remove the `git:https://github.com` entry → retry push
  → sign in as the correct account when prompted.
- For a brand-new empty repo (no shared history yet), delivering a zip
  of the whole tree is simpler than a patch — there's nothing to patch
  against yet.

## No login / access model

This app intentionally has no login screen (see README.md's "Access
model" section) — every request runs as the Supabase anon key. Don't
reintroduce authentication without the user explicitly asking for it
back; the tradeoff (no per-user data separation) was a deliberate,
discussed decision, not an oversight.
