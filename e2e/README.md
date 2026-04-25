# End-to-end tests (`e2e/`)

Read-only Playwright suite that runs against **production** parametric-memory.dev
using a captured authenticated session. The suite is built around the testid
registry in `docs/DUAL-ACCESSIBILITY.md` — every selector resolves to a
pre-registered `data-testid`, which keeps the tests stable across visual
refactors and exercises the same surface AI agents (Claude in Chrome,
Operator) hit.

## Files

```
e2e/
├── auth.setup.ts         # one-time login capture (run npm run e2e:auth)
├── tsconfig.json         # extends root tsconfig
├── .gitignore            # blocks .auth/ and reports
├── smoke/                # public, unauth tests
│   ├── public-pages.spec.ts
│   ├── nav.spec.ts
│   ├── pricing.spec.ts
│   ├── auth-pages.spec.ts
│   ├── docs.spec.ts
│   └── no-client-errors.spec.ts
└── authed/               # logged-in tests (depend on .auth/user.json)
    ├── dashboard.spec.ts
    ├── change-plan.spec.ts
    ├── admin.spec.ts
    └── visualise.spec.ts
```

## Quick start

```bash
# 1. Install Playwright (first time only)
npm install -D @playwright/test
npx playwright install chromium

# 2. Capture your authenticated session (first time, and whenever it expires)
npm run e2e:auth

# 3. Run the suite (headed by default — you'll see the browser)
npm run e2e

# 4. View the HTML report after a run
npm run e2e:report
```

## Available scripts

| Script | What it does |
| --- | --- |
| `npm run e2e` | Full suite, headed locally, headless in CI |
| `npm run e2e:smoke` | Public/unauth smoke only — never needs `.auth/user.json` |
| `npm run e2e:authed` | Authenticated suite only — requires fresh `.auth/user.json` |
| `npm run e2e:auth` | Re-capture the authenticated storage state |
| `npm run e2e:headless` | Force headless |
| `npm run e2e:debug` | Open Playwright Inspector for step-through |
| `npm run e2e:ui` | Open Playwright UI mode |
| `npm run e2e:report` | Open the most recent HTML report |
| `npm run e2e:local` | Run against local dev (sets `E2E_BASE_URL=http://localhost:3000`) |

## Safety guarantees

The suite is designed to run against **production** without affecting your
account or other customers:

- **No form submissions.** Login and signup forms are filled but never
  submitted — submitting on prod would create accounts or send magic links.
- **No tier changes.** The change-plan sheet is opened and closed; the
  confirm button (`confirm-upgrade-confirm`) is never clicked.
- **No Stripe checkout.** Pricing CTAs are asserted present but never clicked.
- **No API key rotation.** The `admin-rotate-key` button is never clicked.
- **No state-changing API calls.** Tests only navigate to GET routes.

If you add a test that mutates state, prefix it with `mutating_` and exclude
it from the default `npm run e2e` run.

## Auth model — `storageState`

`auth.setup.ts` runs once per session refresh. It opens a headed Chromium,
waits up to 10 minutes for you to complete the magic-link sign-in, then
writes `e2e/.auth/user.json` with your cookies, localStorage, and IndexedDB.

The file is gitignored. Treat it like a password — it's a live session token
for your real account. If it leaks, log out everywhere and re-run
`npm run e2e:auth`.

The `authed` Playwright project loads this file via `storageState` so each
authed test starts pre-logged-in in its own isolated browser context.

### Auth flow (OAuth or magic-link)

`npm run e2e:auth` opens a headed Chromium window with a small **Auth
helper** toolbar pinned to the top of every page. There is **no per-test
timeout** — take as long as you need.

**OAuth path (easiest if enabled on prod):**

1. Click **Sign in with Google** or **Sign in with GitHub** in the
   Playwright window.
2. Complete the consent flow.
3. The redirect lands you back in the Playwright window. Capture
   completes automatically.

**Magic-link path:**

1. Type your email in the Playwright window's login form, click **Send
   sign-in link**.
2. Open your inbox (any browser is fine).
3. Right-click the magic link in the email → **Copy Link Address**.
4. Paste the URL into the **Auth helper** toolbar at the top of the
   Playwright window.
5. Click **Go** (or hit Enter). The window navigates, the session cookie
   lands in the right browser, and capture completes.

   This is more reliable than clicking the email link directly — clicking
   normally opens your default browser, which leaves the session in the
   wrong place. The paste-box in the toolbar guarantees the cookie lands
   in the Playwright window.

The window closes itself once the post-login page renders. Session is
saved to `e2e/.auth/user.json` (gitignored).

### Re-running auth capture

You'll need to re-run `npm run e2e:auth` when:

- Tests start failing with redirects to `/login`.
- You log out anywhere (signing out invalidates the captured session).
- You change your password or 2FA settings.
- Storage TTL expires (default ~30 days, varies by provider).

## Hitting local dev instead of prod

```bash
# In one terminal
npm run dev

# In another
npm run e2e:local
```

`E2E_BASE_URL` overrides the prod base URL for that run.

## CI

The config detects `CI=1` and switches to:

- Headless
- 2 retries
- 1 worker (avoids resource contention on small runners)
- JUnit + HTML reporters

Add `playwright-report/` and `test-results/` to your CI artefact upload step.
