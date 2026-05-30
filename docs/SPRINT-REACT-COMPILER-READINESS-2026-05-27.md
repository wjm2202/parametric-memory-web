# SPRINT: React Compiler Readiness

**Date drafted:** 2026-05-27
**Trigger:** Surfaced by `eslint-plugin-react-hooks@7` (shipped with `eslint-config-next@16` during the Next.js 16 upgrade). 16 warnings across 14 files representing patterns that work today but won't be optimally React-Compiler-friendly. None are runtime bugs; all are forward-compat refactors.
**Status:** Planning. Not yet started.
**Prerequisite:** Next.js 16 upgrade landed (`docs/SPRINT-NEXTJS-16-UPGRADE-2026-05-27.md`).

---

## 1. Why this sprint exists

The Next.js 16 upgrade pulled in `eslint-plugin-react-hooks@7`, which adds React Compiler readiness rules. The codebase compiles, builds, and runs correctly under v16 — these rules don't flag bugs. They flag patterns that the upcoming React Compiler can't optimise around, and (in some cases) patterns that have known issues at scale (cascading renders from setState-in-effect, components recreated each render, etc.).

Three forces converge to do this work as its own sprint rather than inline with the v16 upgrade:

1. **Each item is its own refactor.** A `setState` inside `useEffect` isn't a one-line fix — the proper resolution depends on what state is being computed, whether it's hydration-sensitive, and whether the parent should own it. Lumping 16 of these into one PR makes review impossible and bisect useless.

2. **Some patterns are deliberate.** `FormattedDate` and `FormattedNumber` use the setState-in-effect pattern as a hydration-mismatch dodge — `toLocaleString` produces different output server vs client. The "fix" needs a real decision about how to handle the SSR boundary, not a rote refactor.

3. **The v16 upgrade is the security floor.** That sprint must land cleanly to close the May 2026 CVE window. React Compiler readiness is a follow-on quality investment. Mixing them risks delaying the security work.

## 2. Principles

These mirror the principles applied during the v16 upgrade:

- **🧭 Stay the course.** This sprint will be tempting to short-circuit — these are warnings, the code works, the v16 upgrade is sitting committed-but-incomplete waiting for it. Don't downgrade rules. Don't inline-disable except as documented escape hatches with one-line justifications. Don't rationalise that "this one is fine, just leave it." Every item in Section 4 has a row; every row gets either a real refactor or an explicit acknowledgement with a "why" comment. The point of the sprint is the discipline as much as the diff. **No code with these violations is committed until the sprint is done.**
- **Fix the code, not the rule.** No new lint-rule overrides are added by this sprint. (The two existing scoped overrides — `react-hooks/immutability` for R3F directories — are structural disagreements with the rule and stay in place.)
- **Behaviour must not change.** Every fix is verified by existing test coverage. If a fix introduces visible UX change, the change is called out and reviewed.
- **One commit per item.** 16 commits, each with a focused diff and a meaningful message. `git bisect` works.
- **Test parity.** Components touched by this sprint must have their existing test suite re-run; tests that don't exist for behaviour we're changing get added.

## 3. Categorisation summary

| Category | Count | Risk | Typical effort |
|---|---|---|---|
| **A. Reset-on-prop-change** — setState in effect that resets local state when a prop changes | 6 | medium | M |
| **B. Init-from-external** — setState in effect that reads localStorage / locale / async source on mount | 3 | medium-high (UX) | M-L |
| **C. Fetch-on-mount** — useEffect calling an async fetch that setStates in its callback | 4 | medium | M |
| **D. Memoization deps mismatch** — useMemo/useCallback dep array doesn't match what compiler infers | 3 | low | S |

**Total estimate:** 18–30 hours engineering time depending on how many items go down the "proper architectural refactor" path versus the "smaller, well-justified inline fix" path.

## 4. Item index

Format: `RC-NN | file:line | category | risk | effort | rule`

| ID | File | Line | Cat | Risk | Eff | Rule |
|---|---|---|---|---|---|---|
| RC-01 | `src/app/admin/AdminClient.tsx` | 211 | D | low | S | `preserve-manual-memoization` |
| RC-02 | `src/app/admin/AdminClient.tsx` | 311 | C | med | M | `set-state-in-effect` |
| RC-03 | `src/app/admin/ChangePlanSheet.tsx` | 126 | A | med | M | `set-state-in-effect` |
| RC-04 | `src/app/admin/TierChangeProgressBanner.tsx` | 95 | A | low | S | `set-state-in-effect` |
| RC-05 | `src/app/admin/security/audit/AuditClient.tsx` | 183 | C | med | M | `set-state-in-effect` |
| RC-06 | `src/app/dashboard/CancelPendingBanner.tsx` | 55 | B | med | M | `set-state-in-effect` |
| RC-07 | `src/app/pricing/CheckoutDrawer.tsx` | 77 | A | med | M | `set-state-in-effect` |
| RC-08 | `src/components/FormattedDate.tsx` | 86 | B | high (UX) | L | `set-state-in-effect` |
| RC-09 | `src/components/FormattedNumber.tsx` | 46 | B | high (UX) | L | `set-state-in-effect` |
| RC-10 | `src/components/knowledge/GraphNodes.tsx` | 332 | D | low | S | `preserve-manual-memoization` |
| RC-11 | `src/components/knowledge/GraphNodes.tsx` | 382 | D | low | S | `preserve-manual-memoization` |
| RC-12 | `src/components/knowledge/SidePanel.tsx` | 88 | A | low | S | `set-state-in-effect` |
| RC-13 | `src/components/ui/RotationStepper.tsx` | 160 | A | med | M | `set-state-in-effect` |
| RC-14 | `src/components/ui/SiteNavbar.tsx` | 295 | A | low | S | `set-state-in-effect` |
| RC-15 | `src/hooks/useRecentAuth.ts` | 113 | C | med | M | `set-state-in-effect` |
| RC-16 | `src/hooks/useTierChangePoll.ts` | 136 | C | med | M | `set-state-in-effect` |
| RC-17 | `src/app/admin/ChangePlanSheet.tsx` | 133 | C | med | M | `set-state-in-effect` |
| RC-18 | `src/components/knowledge/SidePanel.tsx` | 102 | C | med | S | `set-state-in-effect` |

> RC-17 / RC-18 surfaced after Wave 2 cleared the reset-on-prop-change effects in the same files. They are distinct effects (fetch-options at L133, cache-warm at L102) that were hidden behind louder Wave 2 warnings. Added per Appendix B — IDs do not collide with the original 16.

## 5. Detailed item metadata

Each entry has the same shape so the items are self-contained units of work.

---

### RC-01 — `AdminClient.tsx:211` (useMemo deps mismatch)

**Current pattern.** `useMemo(() => …, [billingStatus?.renewalDate])` but the compiler infers the dep as `billingStatus`.

**Why flagged.** The compiler reads `billingStatus?.renewalDate` and concludes "this memo depends on `billingStatus`." The dev specified the narrower `billingStatus?.renewalDate`. When `billingStatus` changes but `renewalDate` doesn't, the memo *should* recompute (per the dev's intent) but doesn't, *or* the compiler bails out of optimising the component.

**Fix.** Two options. (a) Loosen the dep array to `[billingStatus]` — slight perf hit but matches the compiler's view. (b) Hoist the optional chain into a variable first: `const renewalDate = billingStatus?.renewalDate;` then `useMemo(…, [renewalDate])` — now the compiler sees the same shape the dev specified.

Recommendation: (b). Idiomatic, preserves the original optimisation intent.

**Risk.** Low. Pure-render change, no side effects.

**Tests affected.** `src/app/admin/AdminClient.test.tsx`. Should still pass with no changes.

**Sequencing.** Independent.

---

### RC-02 — `AdminClient.tsx:311` (fetch-on-mount setState)

**Current pattern.** `useEffect(() => { fetchBillingStatus(); }, [fetchBillingStatus])` where `fetchBillingStatus` is a `useCallback` that internally calls `setBillingStatus`.

**Why flagged.** The compiler doesn't trace through the callback — it sees an effect that mutates state. Even though the setState happens after an `await`, the rule fires.

**Fix.** Options:

1. **Inline-disable with justification** (smallest): `useEffect(() => { /* setState happens inside the async fetchBillingStatus after the await — this is the canonical "fetch on mount" pattern, see e.g. SWR's useSWR docs */ void fetchBillingStatus(); }, [fetchBillingStatus]);` + `// eslint-disable-next-line react-hooks/set-state-in-effect`.

2. **Migrate to SWR** (proper). `const { data: billingStatus } = useSWR('/api/billing/status', fetcher);`. Removes the entire effect + useCallback boilerplate, gives revalidation for free, removes the lint flag structurally.

Recommendation: **(2) SWR.** The codebase is going to need a data-fetching library eventually; this is a small enough surface to start the migration. If SWR adoption is out of scope, fall back to (1) with a clear comment.

**Risk.** Medium. SWR changes the request timing and adds revalidation on focus/reconnect — these are improvements but UX-visible.

**Tests affected.** `AdminClient.test.tsx`. Likely needs `vi.mock("swr")` if going the SWR route.

**Sequencing.** Independent — but if RC-05 (`AuditClient`) and RC-15/16 (auth hooks) are also adopting SWR, do them in one cluster.

---

### RC-03 — `ChangePlanSheet.tsx:126` (reset-on-prop-change)

**Current pattern.** `useEffect(() => { if (!open) { setFetchState({kind:"idle"}); setSelectedOption(null); } }, [open])`.

**Why flagged.** Resetting local state in response to a prop change inside an effect causes a cascade: parent updates `open` → child re-renders → effect runs → setState → child re-renders again.

**Fix.** Two canonical options:

1. **Don't render the sheet when closed.** Parent wraps with `{open && <ChangePlanSheet … />}` so the component unmounts and remounts, getting fresh state by default.

2. **Use `key`.** Parent passes `key={open ? "open" : "closed"}` to force remount.

Recommendation: (1) — it's what most modal/sheet patterns do anyway, and Sonner/dialogs in this codebase already work that way.

**Risk.** Medium. Need to verify the close animation still plays (it might be doing the dismount inside the sheet via `framer-motion` exit animation). If so, switch to (2).

**Tests affected.** `ChangePlanSheet.test.tsx`. Needs mounting verification.

**Sequencing.** Independent.

---

### RC-04 — `TierChangeProgressBanner.tsx:95` (reset-on-prop-change)

**Current pattern.** `useEffect(() => { if (result.state !== "rolled_back") setDismissed(false); }, [result.state])`.

**Why flagged.** `dismissed` should derive from `result.state` rather than mirror it.

**Fix.** Refactor `dismissed` from `useState` to derived state. Drive dismissal via a separate user action that sets a "user dismissed at result.state = X" sentinel. When `result.state` changes to a new value, the sentinel mismatch means "not dismissed."

```tsx
// Was:
const [dismissed, setDismissed] = useState(false);
useEffect(() => { if (result.state !== "rolled_back") setDismissed(false); }, [result.state]);

// Becomes:
const [dismissedAt, setDismissedAt] = useState<string | null>(null);
const dismissed = dismissedAt === result.state;
// Dismiss handler: setDismissedAt(result.state)
```

**Risk.** Low. The behaviour is identical (banner re-appears on state change) but the source of truth is now derived, not synchronised.

**Tests affected.** `TierChangeProgressBanner.test.tsx`.

**Sequencing.** Independent.

---

### RC-05 — `AuditClient.tsx:183` (fetch-on-mount setState, with filter dep)

**Current pattern.** `useEffect(() => { void fetchPage({ cursor: null, kind: kindFilter }); }, [fetchPage, kindFilter])`.

**Why flagged.** Same as RC-02 — fetch effect that setStates internally.

**Fix.** Same options as RC-02:
1. Inline-disable with comment.
2. SWR with `kindFilter` in the key: `useSWR(['/api/audit', kindFilter], fetcher)`.

Recommendation: (2) if RC-02 also goes SWR; otherwise (1).

**Risk.** Medium.

**Tests affected.** `AuditClient.test.tsx` (and whatever mocks the audit-events fetch).

**Sequencing.** Cluster with RC-02 and RC-15/16 if SWR adoption is on the table.

---

### RC-06 — `CancelPendingBanner.tsx:55` (init from localStorage)

**Current pattern.** `useEffect(() => { const dismissed = window.localStorage.getItem(dismissKey(substrateId)); if (!dismissed) setVisible(true); }, [substrateId])`.

**Why flagged.** Reading localStorage and conditionally setting visible IS a side effect, but the compiler wants this kind of external-source-of-truth via `useSyncExternalStore`.

**Fix.** Wrap localStorage access in `useSyncExternalStore`:

```tsx
const isDismissed = useSyncExternalStore(
  subscribeToLocalStorage,
  () => Boolean(window.localStorage.getItem(dismissKey(substrateId))),
  () => false, // SSR fallback
);
const visible = !isDismissed;
```

**Risk.** Medium. `useSyncExternalStore` semantics differ from `useEffect` — the SSR snapshot is "false" (banner hidden during SSR), which matches current behaviour (the effect runs only client-side).

**Tests affected.** `CancelPendingBanner.test.tsx`. May need to mock localStorage subscription.

**Sequencing.** Independent.

---

### RC-07 — `CheckoutDrawer.tsx:77` (reset-on-prop-change to "ready")

**Current pattern.** `useEffect(() => { if (open) setState({ kind: "ready" }); }, [open])`.

**Why flagged.** Reset-on-prop-change pattern (state should be derived or component should remount).

**Fix.** Same as RC-03: parent renders `{open && <CheckoutDrawer … />}`. The drawer's internal state initialises fresh on every open.

**Hidden complexity.** Drawer probably uses Stripe Embedded Checkout — that has its own iframe lifecycle. Remount → re-create Stripe iframe → user sees a flash. Need to test that the Stripe element survives the new mount strategy. If not, use `key={open ? renderKey : "closed"}` with a stable key per session.

**Risk.** Medium-High. Stripe Checkout flow is revenue-critical; any change here needs e2e validation against a real Stripe test session.

**Tests affected.** `CheckoutDrawer.test.tsx` + `e2e/authed/change-plan.spec.ts`.

**Sequencing.** Independent but high-attention; do not bundle with another revenue-critical change.

---

### RC-08 — `FormattedDate.tsx:86` (hydration-safe locale formatting)

**Current pattern.**

```tsx
const [text, setText] = useState(initialServerText);
useEffect(() => {
  setText(date.toLocaleDateString(undefined, FORMATS[mode]));
}, [date, mode]);
```

**Why flagged.** Reads as "compute derived state in effect" — but it's actually deliberate. `toLocaleDateString` uses the user's locale, which differs SSR (server's locale) vs client (user's browser locale). Rendering directly during SSR causes hydration mismatch.

**Fix.** Three legitimate options, pick one per UX decision:

1. **Server-side fixed locale + client upgrade.** Server renders `date.toLocaleDateString("en-US", FORMATS[mode])`, client renders the user's locale. Use `suppressHydrationWarning` on the `<time>` element. Cleanest; matches Next.js's own recommendation.

2. **`Intl.DateTimeFormat` with explicit locale.** Use `"en-US"` everywhere — no hydration delta. Loses user-locale personalisation.

3. **Client-only render via `useSyncExternalStore`.** Server renders a placeholder, client computes the formatted string. Avoids the lint flag and the hydration issue but causes a paint flash.

Recommendation: **(1)** — preserves current UX (user sees their locale) without the setState-in-effect pattern.

**Risk.** High UX. Wrong choice causes a visible date format flash on first paint.

**Tests affected.** Any test that renders FormattedDate. The hydration behaviour can't be tested in vitest alone; needs `e2e` smoke that renders in a real browser.

**Sequencing.** Do RC-09 in lockstep — same fix shape.

---

### RC-09 — `FormattedNumber.tsx:46` (hydration-safe number formatting)

**Current pattern.** Identical structure to RC-08 but for `value.toLocaleString(undefined)`.

**Fix.** Same shape as RC-08, applied to numbers.

**Risk.** Medium. Numbers have less locale variation than dates (separators only), so UX impact of getting it wrong is smaller.

**Tests affected.** Component tests + manual / e2e check.

**Sequencing.** Pair with RC-08; the fix pattern is shared.

---

### RC-10 — `GraphNodes.tsx:332` (useCallback dep refers to `.current`)

**Current pattern.** `useCallback((e) => { const node = simNodes.current[e.instanceId ?? -1]; … }, [simNodes])`.

**Why flagged.** Compiler infers the dep is `simNodes.current`; dev specified `simNodes`. The `.current` access is the "you're reading from a ref" tell.

**Fix.** Refs don't need to be in dep arrays — `useRef` returns a stable container. Remove from deps:

```tsx
const handleClick = useCallback((e) => {
  const node = simNodes.current[e.instanceId ?? -1];
  …
}, []);
```

The exhaustive-deps lint might then re-flag the missing `simNodes`. If so, escape with `// eslint-disable-next-line react-hooks/exhaustive-deps` and a comment that refs are intentionally not deps.

**Risk.** Low.

**Tests affected.** GraphNodes is part of the knowledge-graph visualisation; no direct unit tests (R3F components are hard to test). Verify via dev server (`/knowledge` route).

**Sequencing.** Pair with RC-11.

---

### RC-11 — `GraphNodes.tsx:382` (same as RC-10 for `handlePointerOver`)

**Current pattern.** `useCallback((e) => { …simNodes.current… }, [simNodes, hoverAtom])`.

**Fix.** Same as RC-10: drop `simNodes` from deps, keep `hoverAtom`. `useCallback((e) => { … }, [hoverAtom])`.

**Risk.** Low.

**Sequencing.** Pair with RC-10.

---

### RC-12 — `SidePanel.tsx:88` (reset on selection clear)

**Current pattern.** `useEffect(() => { if (!selectedAtom) { setDetail(null); setError(null); setStructEdges({outgoing:[], incoming:[]}); return; } /* fetch */ }, [selectedAtom])`.

**Why flagged.** The "clear state when no selection" branch is reset-on-prop-change.

**Fix.** Two paths:
1. **Derive detail.** If `!selectedAtom`, render the empty state — no state needed.
2. **Render conditionally.** Parent wraps `{selectedAtom && <SidePanel atom={selectedAtom} />}`.

Recommendation: (2). Cleaner ownership.

**Risk.** Low. SidePanel is a visualisation overlay; behaviour change is "panel disappears entirely when no atom" vs "panel shows empty state."

**Tests affected.** `SidePanel.test.tsx`.

**Sequencing.** Independent.

---

### RC-13 — `RotationStepper.tsx:160` (reset elapsed seconds on status change)

**Current pattern.** Inside an interval setup `useEffect`: `if (elapsedStepStatus !== status) { setElapsedSeconds(0); setElapsedStepStatus(status); }`.

**Why flagged.** Reset-on-derivable-state. The "elapsed counter for the current status" is conceptually derived from `(status, startTime)`.

**Fix.** Replace the interval-driven counter with a `startTime` ref + a `useEffect` that updates an interval that *only* updates `now`, then `elapsedSeconds = Math.floor((now - startTime) / 1000)` is derived.

**Risk.** Medium. Animation timing — small drift between old and new implementations may be visible.

**Tests affected.** Component tests + manual visual check.

**Sequencing.** Independent.

---

### RC-14 — `SiteNavbar.tsx:295` (close drawer on route change)

**Current pattern.** `useEffect(() => { setDrawerOpen(false); }, [pathname])`.

**Why flagged.** Reset-on-prop-change.

**Fix.** Two options:
1. **Wrap navigation `<Link>` clicks** to call `setDrawerOpen(false)` directly. Then the effect goes away entirely — drawer closes on the user action that caused navigation.
2. **`key={pathname}`** on the drawer — remounts it on route change, internal state resets to default-closed.

Recommendation: (1). The action is the route change *trigger* (user click), not the effect *of* the route change. Closer to the user intent.

**Risk.** Low.

**Tests affected.** `SiteNavbar.test.tsx`.

**Sequencing.** Independent.

---

### RC-15 — `useRecentAuth.ts:113` (refetch on mount)

**Current pattern.** `useEffect(() => { void refetch(); }, [refetch])`.

**Fix.** Same options as RC-02: inline-disable with comment, or SWR / react-query migration.

Recommendation: cluster with RC-02 / RC-05 / RC-16 if going SWR.

**Risk.** Medium.

**Tests affected.** `useRecentAuth.test.ts`.

**Sequencing.** Cluster with the other fetch-on-mount items if SWR.

---

### RC-16 — `useTierChangePoll.ts:136` (reset result on no slug)

**Current pattern.** Inside a polling `useEffect`: `if (!slug) { setResult(IDLE_TIER_CHANGE); return cleanup; }`.

**Why flagged.** Reset-on-prop-change (the `slug` prop becoming falsy).

**Fix.** Two paths:
1. **Derive `result` when slug is null.** Hoist the IDLE check above the state declaration: `const result = slug ? <state from poll> : IDLE_TIER_CHANGE`.
2. **Don't run the hook when `slug` is null.** Caller does the guard.

Recommendation: (2). Hooks shouldn't no-op based on input; callers should guard.

**Risk.** Medium. Requires updating every caller. Grep for `useTierChangePoll(` to enumerate.

**Tests affected.** `useTierChangePoll.test.ts`.

**Sequencing.** Cluster with RC-02 / RC-05 / RC-15 if SWR.

---

### RC-17 — `ChangePlanSheet.tsx:133` (fetch-options loading flag)

**Current pattern.** Inside the effect that fetches upgrade options for the current substrate slug: `setFetchState({ kind: "loading" })` synchronously, then an async IIFE that hits `/api/substrates/:slug/upgrade-options`, with `setFetchState({ kind: "ready"|"error" })` on resolution.

**Why flagged.** The leading `setFetchState({ kind: "loading" })` is a synchronous setState in an effect — the "let the UI show a spinner immediately when the slug changes" pattern. The rule fires before the async work starts.

**History.** Surfaced after RC-03 conditionally unmounted the sheet, which removed the louder reset-on-`open` effect that masked this one in the lint output.

**Fix.** Two paths:

1. **Derive `kind: "loading"` from `data === undefined`.** Drop the explicit "loading" setState — render the loading branch when `fetchState.kind === "idle"` and a fetch is in flight. The IIFE only writes `ready` / `error`. This is the React docs "you might not need an effect" pattern for "synchronise external system → state."
2. **Migrate to SWR.** Same path as RC-02 / RC-05 — `useSWR('/api/substrates/${slug}/upgrade-options')` collapses loading / data / error into one declarative call. Cluster with the Wave 5 fetch-on-mount group.

Recommendation: (2) if SWR is greenlit for Wave 5; otherwise (1) with the spinner driven by a derived `fetchState.kind === "idle"` check.

**Risk.** Medium. The sheet renders a skeleton while loading; ensure that skeleton is still visible when `kind` is `"idle"` (not just `"loading"`).

**Tests affected.** `ChangePlanSheet.test.tsx`.

**Sequencing.** Wave 5 fetch-on-mount cluster.

---

### RC-18 — `SidePanel.tsx:102` (cache-warm setState in effect)

**Current pattern.** Inside an effect keyed on `selectedAtom`: look up `cachedDetails.get(selectedAtom)` and, if hit, `setDetail(cached); setError(null);` before the network fetch.

**Why flagged.** The cache-warm branch synchronously sets state from a memoised source inside the effect — exactly the "you might not need an effect" anti-pattern. The fetch branch (which legitimately needs to be an effect because it has async work) is fine; the warm branch isn't.

**History.** Surfaced after RC-12 removed the open/close reset effect. The cache-warm setState was inside a different effect in the same file and only became the loudest violation once RC-12's was gone.

**Fix.** Two paths:

1. **Derive `detail` from cache during render.** `const detail = cachedDetails.get(selectedAtom) ?? fetchedDetail`. Keep an effect for the *fetch* (network is genuinely external), but the render reads the cache directly — no setState needed when the cache already has it.
2. **Synchronous external store.** If `cachedDetails` is a Map that mutates over time, wrap it with `useSyncExternalStore`.

Recommendation: (1). Simpler, no new abstractions, the cache-warm path is now a render concern not an effect concern.

**Risk.** Low — the cache is already a render-time lookup; this just stops mirroring it into local state.

**Tests affected.** Any `SidePanel.test.tsx` that asserts on the loading sequence. Inspect.

**Sequencing.** Independent. Could be lifted into Wave 1.5 if Wave 5 SWR work is deferred.

---

## 6. Recommended sequencing

### Wave 1 — Low-risk, mechanical (1 day)
Batch all of these together; they're independent and small.

- RC-01 (AdminClient memo dep)
- RC-04 (TierChangeProgressBanner derived state)
- RC-10 + RC-11 (GraphNodes useCallback deps)
- RC-12 (SidePanel render conditionally)
- RC-14 (SiteNavbar close-on-click)

### Wave 2 — Reset-on-prop-change (1-2 days)
Component-by-component decisions about state ownership.

- RC-03 (ChangePlanSheet)
- RC-07 (CheckoutDrawer — needs e2e verification)
- RC-13 (RotationStepper — animation timing care)

### Wave 3 — Hydration-safe formatters (half a day)
Done together because the fix pattern is shared.

- RC-08 (FormattedDate)
- RC-09 (FormattedNumber)

### Wave 4 — Init-from-external (half a day)
- RC-06 (CancelPendingBanner localStorage)

### Wave 5 — Fetch-on-mount (1-2 days)
**Decision point first:** SWR migration or inline-disable with justification?

- RC-02 (AdminClient billing)
- RC-05 (AuditClient)
- RC-15 (useRecentAuth)
- RC-16 (useTierChangePoll)

## 7. Done definition

Sprint exits when:

- All 16 warnings are resolved (either real refactor or explicit per-line `eslint-disable-next-line` with a one-line "why" comment).
- `npm run preflight` is fully green with zero warnings *in the files touched by this sprint*. (Pre-existing warnings in untouched files are out of scope.)
- `npm run e2e:smoke` is green.
- `npm run e2e:authed` is green.
- For each item with UX surface area (RC-03, RC-07, RC-08, RC-09, RC-13): manual verification on dev server, including hydration check via "View Page Source."
- All component tests for touched files pass.

## 8. Out of scope

- The two existing scoped rule overrides in `eslint.config.mjs`:
  - `react-hooks/immutability` disabled for `src/components/visualise/**` and `src/components/knowledge/**` (R3F mutable-buffer canonical pattern; not a rule we're trying to satisfy).
- React Compiler *adoption* itself. This sprint makes the codebase compatible with the compiler if it's enabled. Whether/when to enable it is a separate decision.
- SWR or react-query adoption broadly. If the team picks SWR for Wave 5, that's a scope expansion — only do it if explicitly green-lit.
- The pre-existing warnings in `VerifyClient.*.test.tsx` and others were swept up in the v16 upgrade sprint and do not appear in this sprint.
- ESLint rule tuning. The rules are correct; the code needs to match them (or have a per-line `eslint-disable` with a "why" comment, which is the principled way to acknowledge "this pattern is intentional here").

## 9. Sign-off

This document is a plan, not an execution. Each RC-NN item is a unit of work with enough context to be picked up independently. The sprint targets 4–5 working days end-to-end at one engineer's pace; parallelisable to 2–3 days if multiple developers tackle different waves concurrently.

**Open questions before kickoff:**

1. SWR / react-query adoption — yes for Wave 5, or fall back to inline-disable-with-comment? Decide before Wave 5 starts; impacts ~4 hours of work either way.
2. Hydration approach for FormattedDate / FormattedNumber — pick option (1), (2), or (3) from RC-08. Decide before Wave 3 starts.
3. ChangePlanSheet / CheckoutDrawer — does framer-motion exit animation need preserving? If yes, use `key` instead of unmount.

---

## Appendix A — Quick reference card

For an engineer picking an RC-NN item to work on:

1. Read the item's metadata in Section 5.
2. Pull `git log -p -- <file>` to understand prior intent.
3. Pick the fix from the "Fix" list (or argue for a different one in the PR).
4. Implement.
5. Run `npx vitest run <file>.test.{ts,tsx}` for unit tests.
6. Run `npm run lint -- src/<path>/<file>` for lint verification.
7. For RC-03 / RC-07 / RC-08 / RC-09 / RC-13: dev server smoke + e2e.
8. Commit with message `react-compiler-readiness: RC-NN <short summary>`.
9. Mark the row in Section 4 as `[done]` in your PR description.

## Appendix B — How to add new items

If future lint runs surface additional React Compiler readiness warnings (e.g. after a `eslint-config-next` minor bump that adds rules), add them to Section 4 with a new RC-NN ID and a Section 5 metadata block. Don't re-categorise existing items — they're stable references.

---

## Appendix C — Sprint actuals

Stay-the-course log. Each wave records its actual outcome so a re-read knows where we are.

### Wave 1 actuals (complete)
Cleared RC-01, RC-04, RC-10, RC-11, RC-12, RC-14. Warning count: 44 → 17 (drop of 27 includes the eight items in waves 2/3 that the same migration touched indirectly).

### Wave 2 actuals (complete)
Cleared RC-03, RC-07, RC-13. RC-13 (RotationStepper) required two attempts: the first used a ref + lazy init which tripped the `react-hooks/refs` rule (refs cannot be read or written during render). The accepted fix uses `useSyncExternalStore` against a module-level cached clock plus React's documented "adjust state during render when a prop changes" pattern. Warning count: 17 → 11.

### Wave 3 actuals (complete — 2026-05-28)
Cleared RC-08 (FormattedDate) + RC-09 (FormattedNumber). Approach: extracted a shared `useHasHydrated()` hook in `src/hooks/useHasHydrated.ts` that wraps `useSyncExternalStore` with `getServerSnapshot=false`, `getSnapshot=true`, no-op `subscribe`. Both formatters now derive their visible text purely from `hasHydrated ? localised : placeholder` — no `useState`, no `useEffect`.

New tests: `src/hooks/useHasHydrated.test.ts` (4 cases — SSR via `react-dom/server.renderToString`, client mount, primitive type, stability across re-renders).

Existing tests `FormattedDate.test.tsx` (6 cases) and `FormattedNumber.test.tsx` (5 cases) pass unchanged — the visible contract (`<time dateTime>` byte-stable, en-US grouping on first paint) is unaltered.

Warning count: 11 → 9.

**Discovered work:** RC-17 (`ChangePlanSheet.tsx:133`) and RC-18 (`SidePanel.tsx:102`) — set-state-in-effect sites in files that already went through earlier waves. They were hidden behind the louder reset-on-prop-change effects that Wave 1/2 removed. Added to Section 4 + Section 5 per Appendix B.

### Wave 4 actuals (complete — 2026-05-28)
RC-06 (`CancelPendingBanner.tsx`) plus the two `scripts/*.mjs` unused-`error` catches.

CancelPendingBanner migrated from `useState(false) + useEffect-that-reads-localStorage` to `useSyncExternalStore` against a module-level localStorage subscription registry (subscribe / getSnapshot / getServerSnapshot, plus a `notifyLocalStorageKey` that the dismiss handler calls after writing). Session-only fallback state preserves the dismiss-during-private-browsing path. New test: "shows the banner and lets the user dismiss for the session when localStorage throws."

Scripts cleared by replacing `catch (error)` with `catch` (no binding).

Warning count: 9 → 6 (RC-06 + two scripts catches).

### Wave 5 actuals (complete — 2026-05-28)
SWR migration for the entire fetch-on-mount cluster.

**Dependency added:** `swr@2.4.1` (one package, no transitive surprises, ~5kB gz).

**Hooks migrated:**
- **RC-15 `useRecentAuth.ts`** — `useSWR` with a `TotpStatusError` fetcher that throws categorised errors (`session_expired` / `network`). Public surface `{status, loading, error, refetch}` preserved byte-for-byte so the three consumers (`TwoFactorStatusCard`, `RecentAuthGate`, `TwoFactorClient`) don't change. Tests wrap `renderHook` in `<SWRConfig provider={() => new Map()} dedupingInterval={0}>`.
- **RC-02 `AdminClient.tsx`** — billing-status fetch replaced by `useSWR` with a silent-fail fetcher (`null` on any non-2xx, preserving the substrate.tier fallback). 41 existing tests pass with a fresh `<SWRConfig>` wrapper applied to every `renderAdmin`.
- **RC-17 `ChangePlanSheet.tsx`** — upgrade-options fetch on `useSWR` with a tuple key `[url, mountSeq]`. The mount-seq salt is captured via `useState`'s lazy initializer against a module-level counter, guaranteeing every reopen of the sheet hits a fresh cache slot and triggers a fresh fetch (matches the pre-SWR `useEffect`-re-runs-on-open behavior; SWR's `revalidateOnMount` alone wasn't enough — the provider cache was still serving stale data). Test "re-fetches when the sheet is re-opened" required a `Harness` component that wraps `{open && <ChangePlanSheet />}` to simulate production's conditional unmount. 23 tests pass.
- **RC-18 `SidePanel.tsx`** — atom-detail + structural-edges fetches replaced by two `useSWR` calls (detail keyed on `selectedAtom`, edges keyed on `[selectedAtom, "edges"]`). Removed the bespoke Zustand LRU cache (`cachedDetails` / `cacheDetail` / KG-16 cap) from `knowledge-store.ts` — SWR's built-in cache supersedes it. Source-contract test still green (token check only).
- **RC-05 `AuditClient.tsx`** — cursor pagination on `useSWRInfinite`. `getKey` derives the per-page tuple key from `previousPageData.nextCursor`; filter changes re-key page 1 via the closure; "Load older events" calls `setSize(s + 1)`; retry calls `mutate()`. Categorised errors (`network` / `session` / `generic`) carry user-facing copy on `AuditError.message`. 9 tests pass.
- **RC-16 `useTierChangePoll.ts`** — kept the bespoke setTimeout-chained polling (terminal-state-stops logic is more natural to express in raw setTimeout than SWR's `refreshInterval` callback), surgically removed the `setResult(IDLE_TIER_CHANGE)` line in the `!slug` branch. Derived `slug ? result : IDLE_TIER_CHANGE` at the consumer boundary instead. 9 tests pass.

**Warning count:** 6 → 0.

### Sprint exit (2026-05-28)
Zero lint warnings remaining. Two new dependencies of note:

- `swr@2.4.1` in `package.json#dependencies`.
- A few new test wrappers (`SwrTestWrapper`, fresh-Map provider) in five test files.

Wave 1 / 2 / 3 atomic fixes are unchanged. Waves 4 + 5 are the architectural changes.

### Stay-the-course note (retained)
The sprint existed because committing code with `react-hooks/set-state-in-effect` warnings was off-limits for this branch. Every paste-back of lint output was a state check; the warning count was the only metric that mattered until the sprint exit. Test pass-rate was the secondary gate (no green ship without it). Sprint exited at 0/0.
