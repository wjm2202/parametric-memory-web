# Launch Checklist — Stripe Re-activation (v1.0.0)

Items removed during Public Beta to pass CI lint checks.
Restore these when Stripe checkout goes live at v1.0.0.

---

## 1. `src/app/pricing/PricingCTA.tsx` — restore unused props to destructuring

`tierName` and `label` were only needed when the Stripe checkout flow was active.
The interface and all callers still pass them — only the function destructuring was
trimmed to silence the ESLint `no-unused-vars` warning during beta.

**Restore:**
```tsx
// Before (beta):
export function PricingCTA({ tierId }: PricingCTAProps) {

// After (v1.0.0 with Stripe):
export function PricingCTA({ tierId, tierName, label }: PricingCTAProps) {
```

---

## 2. `src/app/admin/AdminClient.tsx` — restore `accountId` destructuring if needed

`accountId: _accountId` was removed from `InstanceCard`'s destructuring because
it was not used in the component body. The prop remains in the TypeScript interface
so callers are unbroken. Restore the destructuring if `accountId` is needed again
(e.g. for Stripe customer lookup or instance billing display).

**Restore (if needed):**
```tsx
// Before (beta):
function InstanceCard({ instance }: { instance: InstanceInfo; accountId: string }) {

// After (if accountId is used again):
function InstanceCard({
  instance,
  accountId,
}: { instance: InstanceInfo; accountId: string }) {
```

---

## 3. `src/app/pricing/page.tsx` — restore `Link` import if used

`import Link from "next/link"` was removed because it became unused when the
early-access section switched to a plain `<a>` tag. Restore if any pricing page
navigation element needs Next.js client-side routing.

```tsx
import Link from "next/link";
```

---

## 4. `src/components/landing/HeroScene.tsx` — restore `chaosT` if chaos phase needs it

`chaosT` was declared and assigned (`chaosT = t / PHASE.CHAOS`) but never read,
so both the declaration and assignment were removed. The `if (t < PHASE.CHAOS)`
block was kept (with a comment) because it is structurally required — removing it
causes `attractT` to be set to a negative value during the chaos phase.

**Restore if chaos phase interpolation is needed:**
```tsx
// Add back to declarations:
let chaosT = 0; // 0–1 within chaos phase

// Add back inside if (t < PHASE.CHAOS):
chaosT = t / PHASE.CHAOS;
// ... use chaosT for particle behaviour
```

---

## Summary

| File | What was removed | Why | Safe to restore? |
|---|---|---|---|
| `PricingCTA.tsx` | `tierName`, `label` destructuring | ESLint — unused during beta Coming Soon state | Yes — interface unchanged |
| `AdminClient.tsx` | `accountId` destructuring | ESLint — not read in component body | Yes — if component uses it |
| `pricing/page.tsx` | `Link` import | ESLint — unused after `<a>` tag swap | Yes — if Link needed |
| `HeroScene.tsx` | `chaosT` variable + assignment | ESLint — assigned but never read | Yes — if chaos phase uses it |
