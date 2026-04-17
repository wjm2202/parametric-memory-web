/**
 * TierChangeProgressBanner — sticky progress banner for an in-flight
 * tier change, driven by the output of `useTierChangePoll`.
 *
 * State → visual mapping (see PLAN-ADMIN-UPGRADE-FLOW.md §4.5):
 *
 *   state === "none"                   → renders nothing
 *   shared_to_shared (fast path)       → indigo banner, single active label
 *                                        (FAST_PATH_STEPS bucket for current state)
 *   shared_to_dedicated (slow path)    → indigo banner, SLOW_PATH_UNIQUE_LABELS list
 *                                        with active phase marked, completed phases
 *                                        checked. Retry counter shown when
 *                                        transferAttempts > 0.
 *   state === "completed"              → emerald banner, success headline.
 *                                        Fast-path auto-dismisses after 5 s; slow-path
 *                                        stays until unmount (user takes the win).
 *   state === "failed" | "rolled_back" → amber banner, failure headline +
 *                                        failureBody(currentTierName) + support line.
 *
 * Copy comes exclusively from ./tier-change-copy — no inline strings, so QA
 * can audit wording in one file.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FAST_PATH_STEPS,
  FAILURE_HEADLINE,
  FAILURE_SUPPORT_LINE,
  SLOW_PATH_PHASES,
  failureBody,
  fastPathSuccessHeadline,
  retryCounter,
  slowPathSuccessHeadline,
} from "./tier-change-copy";
import { getTierLabel } from "@/config/tiers";
import type { TierChangePollResult } from "@/hooks/useTierChangePoll";

/**
 * Backend retry budget for the transfer phase. Mirrors the worker config — if
 * the backend ever raises this, update here too and QA the UI copy.
 */
const TRANSFER_MAX_ATTEMPTS = 5;

/** Auto-dismiss fast-path success banners after this many ms. */
const SUCCESS_AUTO_DISMISS_MS = 5_000;

/**
 * SLOW_PATH_PHASES maps 9 phase keys onto 6 unique user-visible labels.
 * The banner renders the unique labels (not the raw phases) so the customer
 * sees a clean step list, not internal state-machine names.
 */
const SLOW_PATH_UNIQUE_LABELS: string[] = (() => {
  const seen: string[] = [];
  for (const { label } of SLOW_PATH_PHASES) {
    if (!seen.includes(label)) seen.push(label);
  }
  return seen;
})();

/**
 * Given a backend phase, return the index of its bucket in
 * SLOW_PATH_UNIQUE_LABELS. Returns -1 if the phase is null or unknown.
 */
function phaseBucketIndex(phase: string | null): number {
  if (!phase) return -1;
  const entry = SLOW_PATH_PHASES.find((p) => p.phase === phase);
  if (!entry) return -1;
  return SLOW_PATH_UNIQUE_LABELS.indexOf(entry.label);
}

interface Props {
  result: TierChangePollResult;
  /**
   * Display name of the tier the user is currently on, used only in the
   * failure body (e.g. "You're still on Indie, and no charge will land…").
   * AdminClient passes `getTierLabel(substrate.tier)`.
   */
  currentTierName: string;
}

export function TierChangeProgressBanner({ result, currentTierName }: Props) {
  const [dismissed, setDismissed] = useState(false);

  // Reset the auto-dismiss flag whenever a fresh change kicks off (state
  // returns to a non-terminal value). Without this, a second upgrade after
  // a dismissed success would stay hidden.
  useEffect(() => {
    if (
      result.state !== "completed" &&
      result.state !== "failed" &&
      result.state !== "rolled_back"
    ) {
      setDismissed(false);
    }
  }, [result.state]);

  const isSlowPath =
    result.transitionKind === "shared_to_dedicated" ||
    result.transitionKind === "dedicated_to_dedicated";

  // Auto-dismiss fast-path success after SUCCESS_AUTO_DISMISS_MS.
  // Slow-path completion stays on screen — the user just waited ~10 minutes
  // for the migration, they deserve a persistent "done".
  useEffect(() => {
    if (result.state === "completed" && !isSlowPath) {
      const id = setTimeout(() => setDismissed(true), SUCCESS_AUTO_DISMISS_MS);
      return () => clearTimeout(id);
    }
  }, [result.state, isSlowPath]);

  // The active bucket is useful for both slow-path rendering and unit tests
  // (indirectly, via the "active" className). Memoised because SLOW_PATH_PHASES
  // is linear-scanned.
  const activeBucket = useMemo(() => phaseBucketIndex(result.phase), [result.phase]);

  if (result.state === "none" || dismissed) return null;

  const targetTierName = result.targetTier ? getTierLabel(result.targetTier) : "your new plan";
  const isFailure = result.state === "failed" || result.state === "rolled_back";
  const isCompleted = result.state === "completed";

  const tone = isFailure
    ? {
        border: "border-amber-500/40",
        bg: "bg-amber-500/5",
        accent: "text-amber-300",
        icon: "text-amber-400",
      }
    : isCompleted
      ? {
          border: "border-emerald-500/40",
          bg: "bg-emerald-500/5",
          accent: "text-emerald-300",
          icon: "text-emerald-400",
        }
      : {
          border: "border-indigo-500/40",
          bg: "bg-indigo-500/5",
          accent: "text-indigo-300",
          icon: "text-indigo-400",
        };

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="tier-change-banner"
      data-state={result.state}
      data-transition-kind={result.transitionKind ?? ""}
      className={`sticky top-0 z-30 rounded-xl border ${tone.border} ${tone.bg} px-6 py-5 backdrop-blur`}
    >
      {isFailure ? (
        <FailureContent currentTierName={currentTierName} accent={tone.accent} />
      ) : isCompleted ? (
        <SuccessContent
          targetTierName={targetTierName}
          isSlowPath={isSlowPath}
          accent={tone.accent}
        />
      ) : isSlowPath ? (
        <SlowPathContent
          activeBucket={activeBucket}
          transferAttempts={result.transferAttempts}
          accent={tone.accent}
          iconColor={tone.icon}
        />
      ) : (
        <FastPathContent
          state={result.state}
          targetTierName={targetTierName}
          accent={tone.accent}
        />
      )}
    </div>
  );
}

// ─── Fast path (shared_to_shared) ────────────────────────────────────────────

function FastPathContent({
  state,
  targetTierName,
  accent,
}: {
  state: TierChangePollResult["state"];
  targetTierName: string;
  accent: string;
}) {
  // FAST_PATH_STEPS maps state → label. payment_pending and queued both show
  // "Confirming your payment", processing shows "Applying your new limits".
  const step = FAST_PATH_STEPS.find((s) => s.state === state);
  const label = step?.label ?? "Processing your upgrade…";

  return (
    <div className="flex items-center gap-4">
      <Spinner className={accent} />
      <div>
        <p className={`text-sm font-semibold ${accent}`}>Upgrading to {targetTierName}</p>
        <p className="mt-0.5 text-sm text-white/70">{label}</p>
      </div>
    </div>
  );
}

// ─── Slow path (shared_to_dedicated) ─────────────────────────────────────────

function SlowPathContent({
  activeBucket,
  transferAttempts,
  accent,
  iconColor,
}: {
  activeBucket: number;
  transferAttempts: number;
  accent: string;
  iconColor: string;
}) {
  const isRetrying = transferAttempts > 0;

  return (
    <div className="flex gap-4">
      <Spinner className={`${accent} shrink-0`} />
      <div className="flex-1">
        <div className="flex items-baseline justify-between gap-4">
          <p className={`text-sm font-semibold ${accent}`}>Migration in progress</p>
          {isRetrying ? (
            <p className="text-xs text-amber-300" data-testid="tier-change-retry-counter">
              {retryCounter(transferAttempts, TRANSFER_MAX_ATTEMPTS)}
            </p>
          ) : null}
        </div>
        <ol className="mt-3 space-y-1.5" data-testid="tier-change-phase-list">
          {SLOW_PATH_UNIQUE_LABELS.map((label, idx) => {
            const isDone = activeBucket > idx;
            const isActive = activeBucket === idx;
            return (
              <li
                key={label}
                data-phase-state={isDone ? "done" : isActive ? "active" : "pending"}
                className={`flex items-center gap-2 text-sm ${
                  isDone ? "text-white/50" : isActive ? "font-medium text-white" : "text-white/30"
                }`}
              >
                <span className={`inline-flex h-4 w-4 items-center justify-center ${iconColor}`}>
                  {isDone ? <CheckIcon /> : isActive ? <DotPulse /> : <DotPending />}
                </span>
                <span>{label}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// ─── Success ─────────────────────────────────────────────────────────────────

function SuccessContent({
  targetTierName,
  isSlowPath,
  accent,
}: {
  targetTierName: string;
  isSlowPath: boolean;
  accent: string;
}) {
  const headline = isSlowPath
    ? slowPathSuccessHeadline(targetTierName)
    : fastPathSuccessHeadline(targetTierName);

  return (
    <div className="flex items-center gap-4">
      <CheckCircleIcon className={accent} />
      <p className={`text-sm font-semibold ${accent}`}>{headline}</p>
    </div>
  );
}

// ─── Failure ─────────────────────────────────────────────────────────────────

function FailureContent({ currentTierName, accent }: { currentTierName: string; accent: string }) {
  return (
    <div className="flex gap-4">
      <WarningIcon className={accent} />
      <div>
        <p className={`text-sm font-semibold ${accent}`}>{FAILURE_HEADLINE}</p>
        <p className="mt-1 text-sm text-white/70">{failureBody(currentTierName)}</p>
        <p className="mt-1 text-xs text-white/50">{FAILURE_SUPPORT_LINE}</p>
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
// Inline SVGs are tiny and keep the banner dependency-free.

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-5 w-5 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12l5 5 9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DotPulse() {
  return <span className="h-2 w-2 animate-pulse rounded-full bg-current" />;
}

function DotPending() {
  return <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />;
}

function CheckCircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-5 w-5 shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 12.5l2.5 2.5L16 9.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WarningIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-5 w-5 shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M12 9v4m0 3.5h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
