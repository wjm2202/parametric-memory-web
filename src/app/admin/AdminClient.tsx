"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { getTierLabel } from "@/config/tiers";
import { RotationStepper, type RotationStatus } from "@/components/ui/RotationStepper";
import {
  REAUTH_REQUIRED_BODY,
  REAUTH_REQUIRED_CTA,
  REAUTH_REQUIRED_TITLE,
  buildReauthUrl,
  readReauthFlag,
} from "@/lib/reauth";
import { UpdateInstructions } from "@/components/ui/UpdateInstructions";
import { FormattedDate } from "@/components/FormattedDate";
import { FormattedNumber } from "@/components/FormattedNumber";
import SiteNavbar from "@/components/ui/SiteNavbar";
import { useTierChangePoll } from "@/hooks/useTierChangePoll";
import { useSubstrateEvents } from "@/hooks/useSubstrateEvents";
import { TierChangeProgressBanner } from "./TierChangeProgressBanner";
import { ChangePlanButton } from "./ChangePlanButton";
import type { CurrentTierLimits } from "./ChangePlanSheet";
import {
  TOAST_PENDING_TITLE,
  TOAST_PENDING_BODY,
  TOAST_CANCELLED_TITLE,
  TOAST_CANCELLED_BODY,
} from "./tier-change-copy";

import { mailto } from "@/config/site";
interface AccountInfo {
  id: string;
  email: string;
  name: string | null;
  tier: string | null;
  status: string;
  balanceCents: number;
  createdAt: string;
}

interface ProvisioningProgress {
  queueStatus: string;
  phase: string | null;
  dropletId: number | null;
  dropletIp: string | null;
  startedAt: string | null;
}

interface HealthInfo {
  droplet?: { status: string; ip: string | null; sshReady: boolean };
  substrate: { status: string; mcpEndpoint: string | null; reachable: boolean | null };
  https: { configured: boolean; endpoint: string | null };
}

interface SubstrateInfo {
  id: string | null;
  slug: string | null;
  tier: string;
  status: string;
  mcpEndpoint: string | null;
  hostingModel: string;
  personaName: string | null;
  provisioning: ProvisioningProgress | null;
  health: HealthInfo | null;
  maxAtoms: number;
  maxBootstrapsMonth: number;
  maxStorageMB: number;
  atomCount: number;
  bootstrapCountMonth: number;
  storageUsedMB: number;
  provisionedAt: string | null;
  gracePeriodEndsAt: string | null;
  cancelAt: string | null;
  keyUnclaimed: boolean;
}

interface AdminBillingStatus {
  tier: string;
  status: string;
  renewalDate: string | null;
}

/**
 * SWR fetcher for /api/billing/status. Silent-fail behaviour preserved
 * from the pre-SWR implementation: any non-2xx or network failure
 * resolves to `null` so the UI falls back to `substrate.tier`. The hook
 * never surfaces an error to the user — billing status is auxiliary
 * (the substrate tier is the canonical source until it loads).
 */
async function fetchAdminBillingStatus(url: string): Promise<AdminBillingStatus | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as AdminBillingStatus;
  } catch {
    return null;
  }
}

interface AdminClientProps {
  account: AccountInfo;
  slug: string;
  initialSubstrate: SubstrateInfo | null;
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    running: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    provisioning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    read_only: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    suspended: "bg-red-500/20 text-red-400 border-red-500/30",
    deprovisioned: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    destroyed: "bg-red-600/20 text-red-500 border-red-600/30",
    provision_failed: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colours[status] ?? "border-white/20 bg-white/10 text-white/50"}`}
    >
      {status}
    </span>
  );
}

/**
 * R10 slice 6 — inline "name your substrate" editor. Shows the current display
 * name (falling back to the slug) with a Rename control; saving PATCHes
 * /api/substrates/:slug/persona and calls onSaved so the parent re-fetches.
 * Compute is the source of truth for validation (trim, <=80, control chars).
 */
const PERSONA_NAME_MAX = 80;

export function PersonaNameEditor({
  slug,
  personaName,
  onSaved,
}: {
  slug: string;
  personaName: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(personaName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const display = personaName && personaName.length > 0 ? personaName : slug;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/substrates/${slug}/persona`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.trim() === "" ? null : draft.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          body.error === "persona_name_too_long"
            ? `Name must be ${PERSONA_NAME_MAX} characters or fewer.`
            : body.error === "persona_name_invalid_chars"
              ? "Name can't contain line breaks or control characters."
              : "Couldn't save the name. Please try again.",
        );
        return;
      }
      setEditing(false);
      onSaved();
    } catch {
      setError("Couldn't save the name. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3" data-testid="persona-display">
        <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold">{display}</h1>
        <button
          type="button"
          data-testid="persona-edit-button"
          onClick={() => {
            setDraft(personaName ?? "");
            setError(null);
            setEditing(true);
          }}
          className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/50 transition-colors hover:border-white/20 hover:text-white/80"
        >
          Rename
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="persona-editor">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={draft}
          maxLength={PERSONA_NAME_MAX}
          autoFocus
          data-testid="persona-input"
          onChange={(e) => setDraft(e.target.value)}
          placeholder={slug}
          className="w-64 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-lg font-semibold text-white outline-none focus:border-indigo-500/50"
        />
        <button
          type="button"
          data-testid="persona-save"
          disabled={saving}
          onClick={save}
          className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200 transition-colors hover:border-indigo-500/60 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          data-testid="persona-cancel"
          disabled={saving}
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white/80"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-white/40">
        A friendly name for this substrate. Leave blank to use the slug ({slug}).
      </p>
      {error && (
        <p data-testid="persona-error" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

function UsageBar({
  label,
  current,
  max,
  unit,
}: {
  label: string;
  current: number | null | undefined;
  max: number | null | undefined;
  unit: string;
}) {
  const safeCurrentVal = current ?? 0;
  const safeMaxVal = max ?? 0;
  const percentage =
    safeMaxVal === -1 ? 0 : safeMaxVal === 0 ? 0 : (safeCurrentVal / safeMaxVal) * 100;
  const isOverage = safeMaxVal !== -1 && safeMaxVal > 0 && safeCurrentVal > safeMaxVal;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-white/50">{label}</p>
        <p className="text-xs text-white/70">
          <FormattedNumber value={safeCurrentVal} /> /{" "}
          {safeMaxVal === -1 ? "∞" : <FormattedNumber value={safeMaxVal} />} {unit}
        </p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full transition-all ${isOverage ? "bg-red-500/60" : "bg-indigo-500/60"}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      {isOverage && <p className="mt-1 text-xs text-red-400">Overage detected</p>}
    </div>
  );
}

function CopyButton({
  text,
  label = "Copy",
  testId,
}: {
  text: string;
  label?: string;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      data-testid={testId}
      className="min-h-[40px] rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

/**
 * Cancel-mode option button (period_end | refund_now). Module-level (not nested
 * in the modal) so it isn't re-created every render — react-hooks/static-components.
 * State it needs (current mode, disabled, selection handler) is passed in.
 */
function CancelOptionButton({
  mode,
  value,
  title,
  body,
  disabled,
  onSelect,
}: {
  mode: CancelMode;
  value: CancelMode;
  title: string;
  body: string;
  disabled: boolean;
  onSelect: (value: CancelMode) => void;
}) {
  const selected = mode === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      disabled={disabled}
      data-testid={`cancel-mode-${value}`}
      aria-pressed={selected}
      className={`w-full rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${
        selected
          ? "border-red-500/50 bg-red-500/10"
          : "border-white/10 bg-white/[0.02] hover:border-white/20"
      }`}
    >
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-0.5 text-xs text-white/50">{body}</p>
    </button>
  );
}

export default function AdminClient({ account, slug, initialSubstrate }: AdminClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loggingOut, setLoggingOut] = useState(false);
  const [substrate, setSubstrate] = useState<SubstrateInfo | null>(initialSubstrate);
  // RC-02 (react-compiler-readiness, 2026-05-27): SWR replaces the
  // previous useState + useCallback + useEffect triad. The on-mount
  // fetch lives inside SWR's internal subscription, so the call site
  // has no `setState` in any effect of ours. `data ?? null` keeps the
  // downstream `billingStatus` shape (`AdminBillingStatus | null`)
  // unchanged for the dozens of read sites below.
  const { data: billingStatusData } = useSWR<AdminBillingStatus | null>(
    `/api/billing/status?slug=${slug}`,
    fetchAdminBillingStatus,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      shouldRetryOnError: false,
    },
  );
  const billingStatus: AdminBillingStatus | null = billingStatusData ?? null;
  const [rotationStatus, setRotationStatus] = useState<RotationStatus>("none");
  // F6: capture errorMessage from /api/substrates/[slug]/key-rotation/status
  // so the user sees *why* a rotation failed + can restart it.
  const [rotationError, setRotationError] = useState<string | null>(null);
  /**
   * True when the last rotate-key attempt failed with a 401 +
   * `code: "reauth_required"` from compute's recent-auth middleware.
   * Drives a dedicated failure panel (separate from the generic
   * `rotationError` text) that shows the reauth copy + a "Sign in again"
   * CTA. Cleared on the next rotate-key attempt.
   */
  const [rotationNeedsReauth, setRotationNeedsReauth] = useState(false);
  const [keyRotating, setKeyRotating] = useState(false);
  const [showKeyReveal, setShowKeyReveal] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [deprovisionModalOpen, setDeprovisionModalOpen] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const beforeUnloadRef = useRef<((e: BeforeUnloadEvent) => void) | null>(null);

  // One poll instance, shared between the progress banner and the change-plan
  // button, so only a single 3 s interval runs regardless of which consumers
  // observe it. `startTierChangePolling` re-arms the loop when an upgrade
  // kicks off — the loop stops while idle, so without the re-arm the banner
  // would only ever appear after a page reload (2026-06-10 fix).
  const { result: tierChangeResult, startPolling: startTierChangePolling } =
    useTierChangePoll(slug);

  // Translate the substrate's raw caps into the shape ChangePlanSheet wants.
  // Note the casing flip: SubstrateInfo uses `maxStorageMB`, the sheet uses
  // `maxStorageMb` (a tiny naming inconsistency we absorb at the boundary
  // rather than touching every caller).
  const currentLimits: CurrentTierLimits | null = useMemo(() => {
    if (!substrate) return null;
    return {
      maxAtoms: substrate.maxAtoms,
      maxBootstrapsMonth: substrate.maxBootstrapsMonth,
      maxStorageMb: substrate.maxStorageMB,
    };
  }, [substrate]);

  // Next billing date is driven off billingStatus.renewalDate when it's set.
  // The dialog uses it for "…then $29/mo on May 17"; if we don't have it yet,
  // the dialog renders a generic "on your next billing date" fallback.
  //
  // RC-01 (react-compiler-readiness, 2026-05-27): hoist the optional chain
  // into a const so the compiler's inferred dep (`renewalDate`) matches the
  // dev-specified dep array. Previously the dep was `billingStatus?.renewalDate`
  // while the compiler inferred `billingStatus`, which bailed out of the memo
  // optimisation. The semantics are identical (only the date matters), but
  // now the compiler can preserve the manual memoization.
  const renewalDate = billingStatus?.renewalDate;
  const nextBillingDate: Date | null = useMemo(() => {
    if (!renewalDate) return null;
    const d = new Date(renewalDate);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [renewalDate]);

  // Fetch substrate details
  const fetchSubstrate = useCallback(async () => {
    try {
      const res = await fetch(`/api/substrates/${slug}`);
      if (res.ok) {
        const data = await res.json();
        // Handler returns the substrate object directly (no { substrate: ... } wrapper).
        // Fall back to data.substrate for any cached/proxy response that still wraps.
        setSubstrate(data.substrate ?? data);
      }
    } catch {
      // Silent fail, keep using cached data
    }
  }, [slug]);

  // RC-02 (react-compiler-readiness, 2026-05-27): the bespoke
  // `fetchBillingStatus` useCallback + its on-mount useEffect (formerly
  // L318-320) are gone — SWR owns the lifecycle now (see the useSWR
  // call above). If a caller ever needs to force a billing refresh
  // (e.g. immediately after a tier-change completion), use SWR's
  // global `mutate('/api/billing/status?slug=<slug>')` — no caller
  // does today, so we don't expose a wrapper.

  // Poll substrate during provisioning
  useEffect(() => {
    if (substrate?.status === "provisioning") {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(fetchSubstrate, 5000);
      return () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      };
    }
  }, [substrate?.status, fetchSubstrate]);

  // R12 — live SSE updates layered on top of the 3s poll: a billing / tier-change
  // / refund event refreshes the substrate immediately (≈1s) instead of waiting
  // for the next poll tick. Degrades silently to the poll when the stream is
  // unavailable (no event bus on compute, EventSource missing, transient drop).
  useSubstrateEvents(slug, {
    onEvent: () => {
      void fetchSubstrate();
    },
  });

  // Poll rotation status
  useEffect(() => {
    if (keyRotating && rotationStatus !== "complete" && rotationStatus !== "failed") {
      const timer = setInterval(async () => {
        try {
          const res = await fetch(`/api/substrates/${slug}/key-rotation/status`);
          if (res.ok) {
            const data = await res.json();
            setRotationStatus(data.status);
            // F6: capture errorMessage from the compute response. The field
            // comes from substrate_key_rotations.error_reason and is already
            // returned by the existing endpoint (compute-side).
            if (data.status === "failed") {
              setRotationError(
                typeof data.errorMessage === "string" && data.errorMessage.length > 0
                  ? data.errorMessage
                  : "Key rotation failed. You can safely retry.",
              );
            } else if (data.status === "complete") {
              setRotationError(null);
            }
            if (data.status === "complete" || data.status === "failed") {
              setKeyRotating(false);
              if (data.status === "complete") {
                // Refresh substrate so keyUnclaimed flips to true and the
                // "Claim your key" banner appears in the MCP CONNECTION section.
                await fetchSubstrate();
              }
            }
          }
        } catch {
          // Silent fail
        }
      }, 2000);
      return () => clearInterval(timer);
    }
  }, [keyRotating, rotationStatus, slug, fetchSubstrate]);

  // beforeunload guard
  useEffect(() => {
    if (keyRotating || showKeyReveal) {
      beforeUnloadRef.current = (e) => {
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", beforeUnloadRef.current);
      return () => {
        if (beforeUnloadRef.current) {
          window.removeEventListener("beforeunload", beforeUnloadRef.current);
        }
      };
    }
  }, [keyRotating, showKeyReveal]);

  // (RC-02) the previous `useEffect(() => { fetchBillingStatus(); }, [fetchBillingStatus])`
  // was removed in the same sprint — SWR's on-mount fetch above replaces it.

  // Handle ?upgrade=pending | ?upgrade=cancelled, the two query params Stripe
  // Checkout bounces the customer back with. We fire one toast then strip the
  // param from the URL via history.replaceState so a reload doesn't re-fire it.
  // Using replaceState (not router.replace) is intentional — router.replace
  // would force Next to re-run loaders; we just want to clean the URL.
  useEffect(() => {
    const upgradeParam = searchParams?.get("upgrade");
    if (!upgradeParam) return;

    if (upgradeParam === "pending") {
      toast.info(TOAST_PENDING_TITLE, { description: TOAST_PENDING_BODY });
    } else if (upgradeParam === "cancelled") {
      toast(TOAST_CANCELLED_TITLE, { description: TOAST_CANCELLED_BODY });
    } else {
      // Unknown value — ignore. Still strip so it doesn't linger.
    }

    // Strip the param from the URL without touching history depth.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("upgrade");
      window.history.replaceState({}, "", url.toString());
    }
    // Only react to the string value of ?upgrade — searchParams identity can
    // change without the value changing, and we don't want to refire.
  }, [searchParams]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  /**
   * Human-readable wait from the API's `retryAfterSeconds`. The rotation
   * rate limits are per-account (2 attempts/hour including failed, 3
   * completed/24h — KR-S-04 on compute), so the unlock time is the one
   * thing a rate-limited user actually needs to know.
   */
  function formatRotationWait(seconds: number): string {
    if (seconds < 90) return "about a minute";
    if (seconds < 3600) return `about ${Math.ceil(seconds / 60)} minutes`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.ceil((seconds % 3600) / 60);
    const hourPart = hours === 1 ? "1 hour" : `${hours} hours`;
    return minutes > 0 ? `about ${hourPart} ${minutes} min` : `about ${hourPart}`;
  }

  async function handleRotateKey() {
    // F6: clear any stale error from a prior failed attempt before starting.
    setRotationError(null);
    setRotationNeedsReauth(false);
    setKeyRotating(true);
    setRotationStatus("pending");
    try {
      const res = await fetch(`/api/substrates/${slug}/rotate-key`, {
        method: "POST",
      });
      if (!res.ok) {
        // Rate-limited is a self-service condition, not a support case:
        // surface the limit that tripped and when it reopens.
        if (res.status === 429) {
          let detail =
            "Rotation limit reached — at most 2 attempts per hour and 3 rotations per day.";
          try {
            const body = await res.json();
            const wait =
              typeof body.retryAfterSeconds === "number"
                ? ` You can rotate again in ${formatRotationWait(body.retryAfterSeconds)}.`
                : "";
            detail = `${body.message ?? detail}${wait}`;
          } catch {
            /* body unreadable — keep the generic limits text */
          }
          setRotationStatus("failed");
          setRotationError(detail);
          setKeyRotating(false);
          return;
        }
        // Compute's recent-auth middleware returns 401 + a structured
        // `code: "reauth_required"` body when the recent-auth window (10 min single-factor, 30 min TOTP — migration 083) has
        // expired (see src/lib/reauth.ts for the contract). Detecting it
        // here lets us swap to a dedicated "sign in again" surface
        // instead of leaving the user staring at a bare HTTP 401.
        if (await readReauthFlag(res)) {
          setRotationStatus("failed");
          setRotationNeedsReauth(true);
          setRotationError(null);
          setKeyRotating(false);
          return;
        }
        setRotationStatus("failed");
        setRotationError(
          `Could not start rotation (HTTP ${res.status}). Please try again or contact support.`,
        );
        setKeyRotating(false);
      }
    } catch {
      setRotationStatus("failed");
      setRotationError(
        "Could not reach the rotation service. Check your connection and try again.",
      );
      setKeyRotating(false);
    }
  }

  async function handleClaimKey() {
    try {
      const res = await fetch(`/api/substrates/${slug}/claim-key`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.claimed && data.apiKey) {
          setRevealedKey(data.apiKey);
          setShowKeyReveal(true);
          // Refresh substrate so keyUnclaimed flips to false (prevents amber banner reappearing)
          await fetchSubstrate();
        }
      }
    } catch {
      // Error handling
    }
  }

  async function handleCancel(mode: "period_end" | "refund_now") {
    try {
      const res = await fetch(`/api/substrates/${slug}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (res.ok) {
        await fetchSubstrate();
        setCancelModalOpen(false);
      }
    } catch {
      // Error handling
    }
  }

  async function handleReactivate() {
    try {
      const res = await fetch(`/api/substrates/${slug}/reactivate`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchSubstrate();
      }
    } catch {
      // Error handling
    }
  }

  async function handleDeprovision() {
    try {
      // The DeprovisionModal's type-"destroy" step IS the explicit
      // confirmation, so we send cancelActiveSubscription: true — for a paid
      // substrate this forfeits the remaining period and cancels the sub
      // immediately (compute's SM-7 guard requires this flag to proceed).
      const res = await fetch(`/api/substrates/${slug}/deprovision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelActiveSubscription: true }),
      });
      if (res.ok) {
        await fetchSubstrate();
        setDeprovisionModalOpen(false);
      }
    } catch {
      // Error handling
    }
  }

  return (
    // M7: overflow-x-hidden as a defence-in-depth guard against the
    // decorative blob (or any other content) forcing horizontal scroll on
    // 320-412px phones. The blob wrapper uses `fixed inset-0 overflow-hidden`
    // which should already self-clip, but the outer guard catches edge cases
    // (long tokens in error messages, etc.) without visual side effects.
    <div className="min-h-screen overflow-x-hidden bg-[#030712] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 right-1/4 h-[500px] w-[800px] rounded-full bg-indigo-600/5 blur-[160px]" />
      </div>

      {/* Shared SiteNavbar — gives the admin page mobile parity with the
          rest of the site (hamburger + drawer for primary nav and account
          actions). The "Back to Dashboard" breadcrumb stays in-page so
          context is preserved when navigating back. */}
      <SiteNavbar isLoggedIn={true} variant="standard" />

      <header className="relative border-b border-white/5 px-4 pt-20 pb-4 sm:px-6 sm:pt-24">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link
            href="/dashboard"
            data-testid="admin-back-to-dashboard"
            className="text-sm text-indigo-400 transition-colors hover:text-indigo-300"
          >
            ← Back to Dashboard
          </Link>
          <div className="hidden items-center gap-4 md:flex">
            <span className="text-sm text-white/40">{account.email}</span>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="text-sm text-white/50 transition-colors hover:text-white/80 disabled:opacity-40"
            >
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-6 py-10">
        {/* Substrate header */}
        <div className="mb-8">
          {substrate?.slug ? (
            <PersonaNameEditor
              slug={substrate.slug}
              personaName={substrate.personaName}
              onSaved={() => void fetchSubstrate()}
            />
          ) : (
            <h1 className="mb-1 font-[family-name:var(--font-syne)] text-2xl font-bold">{slug}</h1>
          )}
          <p className="mt-1 text-sm text-white/40">
            {substrate?.personaName ? `${substrate.slug} · ` : ""}Substrate administration and
            management
          </p>
        </div>

        {/* Status section */}
        {substrate && (
          <div className="mb-8 space-y-5">
            {/* Tier-change progress banner — self-hides when state === "none".
                Receives the single shared poll result + the current tier's
                display name (used only in failure-mode copy). */}
            <TierChangeProgressBanner
              result={tierChangeResult}
              currentTierName={getTierLabel(billingStatus?.tier ?? substrate.tier)}
            />
            {/* Billing card — tier you're paying for + how the substrate is doing. */}
            {/* Merged from what used to be a separate Billing card and a separate Status card. */}
            {/* The thing you're paying for and the thing you're running are one product; one card. */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              {/* Row 1 — header: BILLING label + tier name on the left, subscription badge + actions on the right.
                  flex-wrap so the right-side actions slide below the title on narrow phones rather
                  than compressing the badge / Change-plan button against the title. */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p
                    data-testid="admin-billing-label"
                    className="text-xs tracking-wider text-white/40 uppercase"
                  >
                    Billing
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {getTierLabel(billingStatus?.tier ?? substrate.tier)}
                  </p>
                  {billingStatus?.renewalDate && (
                    <p className="mt-1 text-xs text-white/40">
                      Renews <FormattedDate iso={billingStatus.renewalDate} />
                    </p>
                  )}
                </div>
                {/* flex-wrap + justify-end: on narrow phones the badge + button slide to the next
                    line and stay right-aligned rather than compress to unreadable widths. */}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {billingStatus && (
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        billingStatus.status === "active"
                          ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-400"
                          : billingStatus.status === "trialing"
                            ? "border-indigo-500/30 bg-indigo-500/20 text-indigo-400"
                            : billingStatus.status === "past_due"
                              ? "border-amber-500/30 bg-amber-500/20 text-amber-400"
                              : "border-red-500/30 bg-red-500/20 text-red-400"
                      }`}
                    >
                      {billingStatus.status}
                    </span>
                  )}
                  {/* Change plan — replaces the old "Upgrade" button that
                      pushed to /pricing. Opens the tier-comparison sheet inline
                      so the substrate slug / current tier / current caps stay
                      in context. Visible whenever the substrate is running —
                      changing plan is only meaningful on a live substrate. */}
                  {substrate.status === "running" && (
                    <ChangePlanButton
                      substrateSlug={substrate.slug ?? slug}
                      currentTier={billingStatus?.tier ?? substrate.tier}
                      currentLimits={currentLimits}
                      nextBillingDate={nextBillingDate}
                      pollResult={tierChangeResult}
                      onUpgradeStarted={startTierChangePolling}
                    />
                  )}
                  {substrate.cancelAt && (
                    <button
                      onClick={handleReactivate}
                      className="rounded-lg border border-indigo-500/30 px-4 py-2 text-sm text-indigo-400 transition-colors hover:border-indigo-500/50"
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2 — single horizontal line of every status pill (runtime + SSL/MCP/SSH/IP).
                  Previously two rows split by 12 px of vertical air; the eye scans them as one
                  status fact, so the divider was wasted height. Cancel-scheduled note slots in
                  inline so it stays visually adjacent to the runtime pill it qualifies. */}
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/5 pt-4">
                <StatusBadge status={substrate.status} />
                {substrate.cancelAt && (
                  <span className="text-sm text-amber-400">
                    Cancel scheduled for <FormattedDate iso={substrate.cancelAt} />
                  </span>
                )}
                {substrate.health && (
                  <>
                    {/* SSL */}
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        substrate.health.https.configured
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border-zinc-600/50 bg-zinc-800/40 text-zinc-500"
                      }`}
                    >
                      <span>{substrate.health.https.configured ? "●" : "○"}</span>
                      SSL
                    </span>

                    {/* MCP reachable */}
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        substrate.health.substrate.reachable === true
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : substrate.health.substrate.reachable === false
                            ? "border-red-500/30 bg-red-500/10 text-red-400"
                            : "border-zinc-600/50 bg-zinc-800/40 text-zinc-500"
                      }`}
                    >
                      <span>{substrate.health.substrate.reachable === true ? "●" : "○"}</span>
                      MCP
                    </span>

                    {/* SSH */}
                    {substrate.health.droplet && (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          substrate.health.droplet.sshReady
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-zinc-600/50 bg-zinc-800/40 text-zinc-500"
                        }`}
                      >
                        <span>{substrate.health.droplet.sshReady ? "●" : "○"}</span>
                        SSH
                      </span>
                    )}

                    {/* Droplet IP — shown as a dim pill when available.
                        max-w-full + truncate guard against IPv6 (39 chars) or long hostnames
                        overflowing the viewport on narrow phones. */}
                    {substrate.health.droplet?.ip && (
                      <span className="inline-flex max-w-full items-center truncate rounded-full border border-zinc-700/50 bg-zinc-800/30 px-2.5 py-0.5 font-mono text-xs text-zinc-500">
                        {substrate.health.droplet.ip}
                      </span>
                    )}
                  </>
                )}
              </div>

              {/* Row 3 — resource usage. Lives inside the billing card because tier limits and
                  current consumption are the same product fact ("what you're paying for and how
                  much of it you've used"). Three-column grid on sm+ keeps it scannable; stacks
                  on mobile so each bar still has full width. */}
              <div className="mt-4 grid grid-cols-1 gap-4 border-t border-white/5 pt-4 sm:grid-cols-2 lg:grid-cols-3">
                <UsageBar
                  label="Atoms"
                  current={substrate.atomCount}
                  max={substrate.maxAtoms}
                  unit="atoms"
                />
                <UsageBar
                  label="Bootstraps (this month)"
                  current={substrate.bootstrapCountMonth}
                  max={substrate.maxBootstrapsMonth}
                  unit="requests"
                />
                <UsageBar
                  label="Storage"
                  current={substrate.storageUsedMB}
                  max={substrate.maxStorageMB}
                  unit="MB"
                />
              </div>
            </div>

            {/* Provision failed callout */}
            {substrate.status === "provision_failed" && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/15">
                    <svg
                      className="h-4 w-4 text-red-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-300">Provisioning failed</p>
                    <p className="mt-1 text-sm text-white/50">
                      Something went wrong while setting up your substrate. Your billing has not
                      been affected. You can deprovision this substrate below and start fresh, or
                      contact support if you need help.
                    </p>
                    <div className="mt-4 flex gap-3">
                      <button
                        onClick={() => setDeprovisionModalOpen(true)}
                        className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 transition-colors hover:border-red-500/50 hover:bg-red-500/10"
                      >
                        Deprovision &amp; start fresh
                      </button>
                      <a
                        href={`mailto:support@parametric-memory.dev?subject=Provision%20failed%3A%20${encodeURIComponent(substrate.slug ?? slug)}`}
                        className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white/80"
                      >
                        Contact support
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Connection section */}
            {substrate.status === "running" && substrate.mcpEndpoint && (
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/[0.06] p-6">
                <p className="mb-5 text-xs font-semibold tracking-wider text-indigo-300/80 uppercase">
                  MCP Connection
                </p>

                {/* Endpoint URL */}
                <div className="mb-4">
                  <p className="mb-1.5 text-xs text-white/50">Endpoint URL</p>
                  <div className="flex items-center gap-2">
                    <code
                      data-testid="mcp-endpoint"
                      className="flex-1 truncate rounded-lg border border-indigo-500/25 bg-black/30 px-3 py-2 font-mono text-sm text-indigo-200"
                    >
                      {substrate.mcpEndpoint}
                    </code>
                    <CopyButton text={substrate.mcpEndpoint} testId="mcp-endpoint-copy" />
                  </div>
                </div>

                {/* Claim key banner — high visibility, only when unclaimed and not yet revealed */}
                {substrate.keyUnclaimed && !showKeyReveal && (
                  <div className="mb-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-amber-300">⚠ Claim your API key</p>
                        <p className="mt-0.5 text-xs text-amber-400/70">
                          Shown only once — store it somewhere safe before continuing.
                        </p>
                      </div>
                      <button
                        onClick={handleClaimKey}
                        className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
                      >
                        Claim Key →
                      </button>
                    </div>
                  </div>
                )}

                {/* Key revealed — prominent display with one-time warning */}
                {showKeyReveal && revealedKey && (
                  <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] p-4">
                    <p className="mb-2 text-xs font-semibold tracking-wider text-emerald-400 uppercase">
                      🔑 Your API key — copy it now. It will never be shown again.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate rounded border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-emerald-300">
                        {revealedKey}
                      </code>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(revealedKey);
                        }}
                        className="shrink-0 rounded bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                {/* mcp-remote config block */}
                <div className="mb-5">
                  <p className="mb-2 text-xs text-white/50">
                    Add to Claude Desktop{" "}
                    <code className="text-white/30">claude_desktop_config.json</code>:
                  </p>
                  {(() => {
                    // Build the config object once and serialize it for BOTH the
                    // rendered <pre> and the clipboard write. Using JSON.stringify
                    // guarantees straight ASCII quotes regardless of any ancestor
                    // CSS (typography plugins) or browser extension that might
                    // otherwise rewrite smart quotes on a template literal.
                    const authDisplay =
                      showKeyReveal && revealedKey ? `Bearer ${revealedKey}` : "Bearer ••••••••";
                    const authCopy =
                      showKeyReveal && revealedKey
                        ? `Bearer ${revealedKey}`
                        : "Bearer YOUR_API_KEY_HERE";
                    const buildConfig = (auth: string) => ({
                      mcpServers: {
                        "Memory-mcp": {
                          command: "npx",
                          args: [
                            "-y",
                            "mcp-remote",
                            substrate.mcpEndpoint,
                            "--header",
                            "Authorization:${AUTH_HEADER}",
                          ],
                          env: { AUTH_HEADER: auth },
                        },
                      },
                    });
                    const displayJson = JSON.stringify(buildConfig(authDisplay), null, 2);
                    const copyJson = JSON.stringify(buildConfig(authCopy), null, 2);
                    return (
                      <div className="relative">
                        <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-xs leading-relaxed text-white/60">
                          {displayJson}
                        </pre>
                        <button
                          onClick={async () => {
                            await navigator.clipboard.writeText(copyJson);
                          }}
                          className="absolute top-2 right-2 rounded bg-white/10 px-2 py-1 text-xs text-white/50 transition-colors hover:bg-white/20 hover:text-white/80"
                        >
                          Copy
                        </button>
                      </div>
                    );
                  })()}
                  {!showKeyReveal && (
                    <p className="mt-2 text-xs text-white/30">
                      {substrate.keyUnclaimed
                        ? "Claim your key above to populate AUTH_HEADER."
                        : "Rotate your key below to generate a new claimable key."}
                    </p>
                  )}
                </div>

                <UpdateInstructions />
              </div>
            )}

            {/* Provisioning progress */}
            {substrate.status === "provisioning" && substrate.provisioning && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
                <p className="mb-4 text-xs font-semibold tracking-wider text-amber-300/80 uppercase">
                  Provisioning Progress
                </p>
                <div className="space-y-2 text-sm text-white/70">
                  <p>Phase: {substrate.provisioning.phase || "pending"}</p>
                  {substrate.provisioning.dropletIp && (
                    <p>
                      Droplet IP:{" "}
                      <code className="text-white/50">{substrate.provisioning.dropletIp}</code>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* API Key section — hidden for provision_failed (no substrate was ever running) */}
            {substrate.status !== "provision_failed" && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <p className="mb-4 text-xs font-semibold tracking-wider text-white/60 uppercase">
                  API Key Management
                </p>

                {keyRotating ? (
                  <div className="space-y-4" data-testid="keyrot-status">
                    <RotationStepper status={rotationStatus} />
                    {rotationStatus === "complete" && (
                      <p className="text-xs text-white/50">
                        Scroll up to the MCP Connection section to claim your new key.
                      </p>
                    )}
                  </div>
                ) : rotationStatus === "failed" && rotationNeedsReauth ? (
                  /* Reauth-required panel — shown when compute's recent-auth
                     middleware (factor-aware window: 10 min single-factor, 30 min TOTP — migration 083) refused the request. Gives
                     the user a clear reason and a one-click path to /login
                     with a redirect back to this admin page. */
                  <div className="space-y-3" data-testid="keyrot-status">
                    <div
                      role="alert"
                      data-testid="keyrot-status-reauth"
                      className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4"
                    >
                      <p className="mb-1 text-xs font-semibold tracking-wider text-amber-300 uppercase">
                        {REAUTH_REQUIRED_TITLE}
                      </p>
                      <p className="text-sm text-amber-200/90">{REAUTH_REQUIRED_BODY}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={buildReauthUrl()}
                        data-testid="keyrot-reauth-cta"
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition-colors hover:bg-indigo-500"
                      >
                        {REAUTH_REQUIRED_CTA}
                      </a>
                    </div>
                  </div>
                ) : rotationStatus === "failed" ? (
                  /* F6: failed-state panel — shows error_reason + restart CTA.
                     Uses the pre-registered testids from docs/DUAL-ACCESSIBILITY.md. */
                  <div className="space-y-3" data-testid="keyrot-status">
                    <div
                      role="alert"
                      data-testid="keyrot-status-error"
                      className="rounded-lg border border-red-500/30 bg-red-500/10 p-4"
                    >
                      <p className="mb-1 text-xs font-semibold tracking-wider text-red-300 uppercase">
                        Key rotation failed
                      </p>
                      <p className="text-sm text-red-200/90">
                        {rotationError ?? "Key rotation failed. You can safely retry."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleRotateKey}
                        data-testid="keyrot-restart"
                        aria-label="Retry key rotation"
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition-colors hover:bg-indigo-500"
                      >
                        Retry rotation
                      </button>
                      <a
                        href={mailto("Key rotation failed")}
                        className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 transition-colors hover:text-white"
                      >
                        Contact support
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-white/50">
                      Rotating invalidates your current key and generates a new claimable one.
                    </p>
                    <p className="text-xs text-white/30" data-testid="keyrot-limits">
                      Limits: 2 rotation attempts per hour (including failed attempts), 3 rotations
                      per day.
                    </p>
                    <button
                      onClick={handleRotateKey}
                      data-testid="admin-rotate-key"
                      aria-label="Rotate API key"
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition-colors hover:bg-indigo-500"
                    >
                      Rotate Key
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Danger zone — hidden for provision_failed (callout above owns that action) */}
            {substrate.status !== "provision_failed" && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
                <p className="mb-4 text-xs font-semibold tracking-wider text-red-300/80 uppercase">
                  Danger Zone
                </p>
                <div className="flex gap-2">
                  {substrate.tier !== "free" &&
                    !substrate.cancelAt &&
                    substrate.status !== "provision_failed" && (
                      <button
                        onClick={() => setCancelModalOpen(true)}
                        className="rounded-lg border border-red-500/20 px-4 py-2 text-sm text-red-400/70 transition-colors hover:border-red-500/40 hover:text-red-400"
                      >
                        Cancel Subscription
                      </button>
                    )}
                  {/* SM-DEP: self-serve "Deprovision now" for ANY non-terminal
                      substrate (paid included). The modal warns about
                      irreversibility and offers the gentle Cancel path; for a
                      paid substrate the confirmed action forfeits the remaining
                      period and cancels the subscription immediately.
                      provision_failed uses the callout above instead. */}
                  {substrate.status !== "deprovisioned" && substrate.status !== "destroyed" && (
                    <button
                      onClick={() => setDeprovisionModalOpen(true)}
                      className="rounded-lg border border-red-500/20 px-4 py-2 text-sm text-red-400/70 transition-colors hover:border-red-500/40 hover:text-red-400"
                    >
                      Deprovision Now
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {!substrate && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-indigo-400" />
              <span className="text-sm text-white/50">Loading substrate details…</span>
            </div>
          </div>
        )}
      </main>

      {/* Cancel modal */}
      {cancelModalOpen && (
        <CancelModal
          slug={slug}
          onClose={() => setCancelModalOpen(false)}
          onConfirm={handleCancel}
        />
      )}

      {/* Deprovision modal */}
      {deprovisionModalOpen && (
        <DeprovisionModal
          isPaid={!!substrate && substrate.tier !== "free"}
          canCancelInstead={
            !!substrate &&
            substrate.tier !== "free" &&
            !substrate.cancelAt &&
            substrate.status !== "provision_failed"
          }
          onSwitchToCancel={() => {
            setDeprovisionModalOpen(false);
            setCancelModalOpen(true);
          }}
          onClose={() => setDeprovisionModalOpen(false)}
          onConfirm={handleDeprovision}
        />
      )}
    </div>
  );
}

/**
 * R10 — cancellation choice (D2 + D7). The customer picks:
 *   • period_end  — run out the paid period, no refund, reactivation allowed.
 *   • refund_now  — stop immediately + pro-rata refund of the unused,
 *                   non-provisioning time. Shows the EXACT refund (fetched from
 *                   the read-only preview), warns that data loss is immediate
 *                   and irreversible, states the provisioning fee is excluded,
 *                   and gates the action behind a type-to-confirm.
 */
type CancelMode = "period_end" | "refund_now";

interface RefundPreview {
  refundCents: number;
  withheldFeeCents: number;
}

function CancelModal({
  slug,
  onClose,
  onConfirm,
}: {
  slug: string;
  onClose: () => void;
  onConfirm: (mode: CancelMode) => Promise<void> | void;
}) {
  const [mode, setMode] = useState<CancelMode>("period_end");
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [preview, setPreview] = useState<RefundPreview | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "loaded" | "error">(
    "idle",
  );

  const fmtUsd = (cents: number) => `$${(Math.max(0, cents) / 100).toFixed(2)}`;
  const CONFIRM_PHRASE = "CANCEL";

  // Fetch the refund preview the first time the customer picks refund_now.
  useEffect(() => {
    if (mode !== "refund_now" || previewStatus !== "idle") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewStatus("loading");
    void (async () => {
      try {
        const res = await fetch(`/api/substrates/${slug}/cancel/refund-preview`);
        if (!res.ok) {
          setPreviewStatus("error");
          return;
        }
        const data = (await res.json()) as Partial<RefundPreview>;
        setPreview({
          refundCents: data.refundCents ?? 0,
          withheldFeeCents: data.withheldFeeCents ?? 0,
        });
        setPreviewStatus("loaded");
      } catch {
        setPreviewStatus("error");
      }
    })();
  }, [mode, previewStatus, slug]);

  // refund_now requires the preview to have loaded AND a matching type-to-confirm.
  const refundNowConfirmed =
    previewStatus === "loaded" && confirmText.trim().toUpperCase() === CONFIRM_PHRASE;
  const canConfirm = mode === "period_end" || refundNowConfirmed;

  async function handleConfirm() {
    if (loading || !canConfirm) return;
    setLoading(true);
    await onConfirm(mode);
    setLoading(false);
    onClose();
  }

  return (
    <div className="fixed top-[var(--site-nav-h)] right-0 bottom-0 left-0 z-40 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-red-500/30 bg-[#0d0d14] p-6 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/15">
            <svg
              className="h-5 w-5 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-syne)] text-base font-semibold text-white">
              Cancel subscription
            </h2>
            <p className="mt-1 text-sm text-white/50">Choose how you&apos;d like to cancel.</p>
          </div>
        </div>

        <div className="mb-4 space-y-2">
          <CancelOptionButton
            mode={mode}
            value="period_end"
            title="Cancel at period end"
            body="Keep full access until your billing period ends, then your substrate is deprovisioned. No refund. You can reactivate any time before it ends."
            disabled={loading}
            onSelect={setMode}
          />
          <CancelOptionButton
            mode={mode}
            value="refund_now"
            title="Cancel now and get a refund"
            body="Stop immediately and refund the unused, non-provisioning portion of this period to your card."
            disabled={loading}
            onSelect={setMode}
          />
        </div>

        {/* refund_now detail: exact refund + irreversible warning + fee-excluded + type-to-confirm */}
        {mode === "refund_now" && (
          <div
            className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4"
            data-testid="refund-now-detail"
          >
            {previewStatus === "loading" && (
              <div
                className="h-4 w-40 animate-pulse rounded bg-white/10"
                data-testid="refund-preview-loading"
              />
            )}
            {previewStatus === "error" && (
              <p className="text-sm text-white/60" data-testid="refund-preview-error">
                We couldn&apos;t calculate your refund right now. Please try again, or choose
                &ldquo;Cancel at period end&rdquo;.
              </p>
            )}
            {previewStatus === "loaded" && preview && (
              <>
                <p className="text-xs tracking-wider text-white/40 uppercase">
                  Refund to your card
                </p>
                <p className="mt-1 text-lg font-semibold text-white" data-testid="refund-amount">
                  {fmtUsd(preview.refundCents)}
                </p>
                {preview.withheldFeeCents > 0 && (
                  <p className="mt-1 text-xs text-white/50" data-testid="refund-fee-excluded">
                    Excludes the non-refundable provisioning fee ({fmtUsd(preview.withheldFeeCents)}
                    ), already used for setup.
                  </p>
                )}
                <p
                  className="mt-3 text-xs font-medium text-red-300"
                  data-testid="refund-irreversible-warning"
                >
                  Your substrate and its data are deleted immediately and cannot be recovered. This
                  cannot be undone.
                </p>
                <label className="mt-3 block text-xs text-white/60">
                  Type{" "}
                  <span className="font-mono font-semibold text-white/80">{CONFIRM_PHRASE}</span> to
                  confirm
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    disabled={loading}
                    data-testid="refund-confirm-input"
                    autoComplete="off"
                    className="mt-1 w-full rounded-md border border-white/15 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-red-500/60"
                  />
                </label>
              </>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            data-testid="cancel-modal-keep"
            className="flex-1 rounded-lg border border-white/10 py-2 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white/80 disabled:opacity-40"
          >
            Keep subscription
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !canConfirm}
            data-testid="cancel-modal-confirm"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Cancelling…"
              : mode === "refund_now"
                ? "Cancel now & refund"
                : "Cancel at period end"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeprovisionModal({
  onClose,
  onConfirm,
  isPaid,
  canCancelInstead,
  onSwitchToCancel,
}: {
  onClose: () => void;
  onConfirm: () => void;
  isPaid: boolean;
  canCancelInstead: boolean;
  onSwitchToCancel: () => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const confirmed = input === "destroy";

  async function handleConfirm() {
    setLoading(true);
    await onConfirm();
    setLoading(false);
    onClose();
  }

  return (
    <div className="fixed top-[var(--site-nav-h)] right-0 bottom-0 left-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-red-500/30 bg-[#0d0d14] p-6 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/15">
            <svg
              className="h-5 w-5 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-syne)] text-base font-semibold text-white">
              Deprovision now
            </h2>
            <p className="mt-1 text-sm text-white/60">
              This immediately tears down the substrate — you lose access right away and it{" "}
              <span className="font-semibold text-red-300">can&apos;t be undone</span> from your
              dashboard. Your data is kept for 30 days for support-assisted recovery only, then{" "}
              <span className="font-semibold text-red-300">permanently deleted</span>.
            </p>
          </div>
        </div>

        {isPaid && (
          <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200/80">
            This also cancels your subscription immediately. The remaining paid period is{" "}
            <span className="font-semibold">forfeited — no refund</span>.
          </p>
        )}

        {canCancelInstead && (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3">
            <p className="text-xs text-white/60">
              Prefer to keep your data?{" "}
              <span className="text-white/80">Cancel your subscription instead</span> — your
              substrate stays read-only until your billing period ends, then it&apos;s deprovisioned
              for you automatically.
            </p>
            <button
              onClick={onSwitchToCancel}
              disabled={loading}
              className="mt-2 text-xs font-medium text-indigo-300 underline-offset-2 transition-colors hover:text-indigo-200 hover:underline disabled:opacity-40"
            >
              Cancel subscription instead →
            </button>
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1.5 block text-xs text-white/50">
            Type <span className="font-mono text-red-400">destroy</span> to confirm
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmed && handleConfirm()}
            placeholder="destroy"
            autoFocus
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-sm text-white placeholder-white/20 transition-colors focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 focus:outline-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-white/10 py-2 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white/80 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!confirmed || loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {loading ? "Deprovisioning…" : "Deprovision"}
          </button>
        </div>
      </div>
    </div>
  );
}
