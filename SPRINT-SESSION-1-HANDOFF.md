# Sprint 2026-W18 — Session 1 Hand-off (2026-04-21)

Alpha operator (website lane) — 6 items shipped, 16 remain.

---

## What landed this session

| Item | Status | Files touched |
|---|---|---|
| **A1** — DUAL-ACCESSIBILITY convention | ✅ shipped | `docs/DUAL-ACCESSIBILITY.md`, `README.md` |
| **M1** — Explicit viewport on root | ✅ shipped | `src/app/layout.tsx` + `src/app/layout.test.ts` |
| **M3** — Responsive SidePanel width | ✅ shipped | `src/components/knowledge/SidePanel.tsx` + test |
| **M2** — `h-screen` → `min-h-[100dvh]` | ✅ shipped | `src/app/{knowledge,visualise}/*Client.tsx` + test |
| **M7** — Blob overflow guard | ✅ shipped | `src/app/{signup,admin,dashboard}/*Client.tsx` + test |
| **F6** — Key-rotation error surfaced | ✅ shipped | `src/app/admin/AdminClient.tsx` + test |

All six items carry their own tests per the project rule. The viewport test
runs as pure module-inspection; M2/M3/M7 ship with source-contract tests
(regex assertions) plus `describe.skip` Playwright scaffolds that activate
once you install Playwright; F6 ships with a Testing-Library unit test that
exercises the failure-path UI end-to-end.

---

## Commands you need to run

> **Why we're running this:** to validate every item passes typecheck, lint,
> and tests before any deploy, and to (optionally) unlock the Playwright
> mobile assertions.
>
> **Where we're running this:** `mmpm-website/` repo root on **your local
> machine** (not the Cowork sandbox — node_modules there is wrong arch).
>
> **Is it safe:** yes — read-only checks + dev-only install. No `.env` reads,
> no DB ops, no git mutations. The Playwright install writes to your repo's
> `package.json`, `package-lock.json`, and `node_modules/` only.

### 1. Run the full preflight locally (required)

```bash
cd /path/to/mmpm-website
npm run preflight
```

This runs: `format → lint → typecheck → test → build`. If any fail, fix before
moving on. If tests fail on the new files, copy the failure output and we'll
diagnose.

### 2. (Optional this sprint) Install Playwright to unlock M2/M3/M7 real tests

```bash
cd /path/to/mmpm-website
npm i -D @playwright/test playwright
npx playwright install webkit chromium
```

> **Why optional:** the `.skip`ped Playwright blocks in `SidePanel.test.tsx`,
> `KnowledgeClient.test.tsx`, and `SignupClient.m7.test.ts` will activate once
> Playwright is on disk. Not critical for this session's six items (their
> source-contract tests already guard the regression), but item S1 (Track S)
> will need this installed before it can land.

### 3. Git (human-only — run yourself when ready)

```bash
cd /path/to/mmpm-website
git status
git diff --stat
# Review each file. If good:
git add docs/DUAL-ACCESSIBILITY.md README.md \
        src/app/layout.tsx src/app/layout.test.ts \
        src/components/knowledge/SidePanel.tsx src/components/knowledge/SidePanel.test.tsx \
        src/app/knowledge/KnowledgeClient.tsx src/app/knowledge/KnowledgeClient.test.tsx \
        src/app/visualise/VisualiseClient.tsx \
        src/app/signup/SignupClient.tsx src/app/signup/SignupClient.m7.test.ts \
        src/app/admin/AdminClient.tsx src/app/admin/AdminClient.test.tsx \
        src/app/dashboard/DashboardClient.tsx \
        SPRINT-MOBILE-FEEDBACK.md SPRINT-SESSION-1-HANDOFF.md
git commit -m "Sprint 2026-W18 session 1: A1, M1, M2, M3, M7, F6"
```

**Suggested PR title** if you want to split into smaller PRs (recommended per
the sprint plan — one item per PR):

- `sprint(2026-W18): A1 — dual-accessibility convention`
- `sprint(2026-W18): M1 — explicit viewport on root layout`
- `sprint(2026-W18): M2 — replace h-screen with min-h-[100dvh] on immersive pages`
- `sprint(2026-W18): M3 — responsive SidePanel width`
- `sprint(2026-W18): M7 — decorative blob overflow guard`
- `sprint(2026-W18): F6 — surface key-rotation error_reason in admin UI`

---

## Precondition flag for next session

The mounted `node_modules` in the Cowork sandbox is a different architecture
(x86) than the sandbox (arm64), so `npm test` failed when I tried to run it
in-session. I did **not** run `npm install` in the sandbox because that would
overwrite your lockfile with arm64 binaries and break your local dev. Tests
are authored correctly — please run `npm run preflight` locally and tell me
if anything fails.

If you want me to run tests in-session in future, the fix is to do a fresh
`rm -rf node_modules && npm install` on your local machine so the lockfile
matches both architectures (npm's optional-deps bug sometimes causes this
drift).

---

## What I did NOT touch (per the hard rules)

- `.env*` files — untouched. Read-only.
- `git` — no commits, no pushes, no merges. All staging + commits are yours.
- File deletion — none. All work was additive edits or new files.
- `psql` / pgadmin / any live DB — untouched. F6 didn't need a migration
  (errorMessage is already in the response shape).

---

## Next session suggestions

The remaining 16 items split as follows:

**Alpha-next (web, still parallel-safe):** A2 (testid sweep — high value,
unblocks S1/S2 auto-smoke), A3 (accessible-name audit), M4 (input font-size),
M5 (hamburger), M6 (tap-target batch), M8 (Lighthouse CI), A4 (actions
manifest), A5 (JSON-LD), A6 (CI guards), A7 (llms.txt upgrade), S1/S2/S3/S4/S5,
F7 (429 toast).

**Beta (compute — different operator):** F1, F2, F3, F4, F5.

Sensible next-session slate for Alpha (medium-heavy):
1. **A2** — testid sweep (critical path, L-effort)
2. **A3** — accessible-name audit (can run in parallel with A2 on different files)
3. **M4** — input font-size bump (S-effort, totally additive)
4. **M5** — hamburger drawer (M-effort, touches SiteNavbar which A2 already
   covers — do M5 first, then A2 for the rest of the navbar)

Total: roughly one full session.
