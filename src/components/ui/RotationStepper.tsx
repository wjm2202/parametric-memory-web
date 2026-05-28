"use client";

import { useState, useSyncExternalStore } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RotationStatus =
  | "pending"
  | "generating"
  | "updating_env"
  | "rendering_nginx"
  | "restarting"
  | "verifying"
  | "committing"
  | "complete"
  | "failed"
  | "none";

interface Step {
  status: RotationStatus;
  label: string;
  activeSubLabel: string;
}

const STEPS: Step[] = [
  {
    status: "generating",
    label: "Generating new key",
    activeSubLabel: "Creating cryptographic key…",
  },
  {
    status: "updating_env",
    label: "Updating container config",
    activeSubLabel: "Writing new key to host…",
  },
  {
    status: "rendering_nginx",
    label: "Rebuilding auth config",
    activeSubLabel: "Rendering nginx configuration…",
  },
  {
    status: "restarting",
    label: "Restarting containers",
    activeSubLabel: "Containers restarting — this takes ~15 seconds…",
  },
  {
    status: "verifying",
    label: "Verifying health",
    activeSubLabel: "Waiting for containers to respond…",
  },
  {
    status: "committing",
    label: "Saving new key",
    activeSubLabel: "Committing to database…",
  },
  {
    status: "complete",
    label: "Done",
    activeSubLabel: "Your new key is ready to claim",
  },
];

// Map job status to the step index that should be shown as active
const STATUS_TO_STEP_INDEX: Record<RotationStatus, number> = {
  none: -1,
  pending: 0,
  generating: 0,
  updating_env: 1,
  rendering_nginx: 2,
  restarting: 3,
  verifying: 4,
  committing: 5,
  complete: 6,
  failed: -1,
};

// Steps where we show an elapsed time counter (they take the longest)
const ELAPSED_STEPS = new Set<RotationStatus>(["restarting", "verifying"]);

// ── External clock subscription (module-level cache) ────────────────────────
//
// `useSyncExternalStore` requires a stable snapshot — calling `Date.now()`
// inside `getSnapshot` would change every call and trip React's infinite-
// render guard. The clock value is cached at module scope; `subscribe`
// schedules a 1Hz update that bumps the cache and notifies listeners. This
// is the canonical "subscribe to an external system" pattern that the
// React Compiler readiness rules approve of.
let cachedNow = Date.now();
const clockListeners = new Set<() => void>();
let clockInterval: ReturnType<typeof setInterval> | null = null;

function subscribeToClock(notify: () => void): () => void {
  clockListeners.add(notify);
  if (clockInterval === null) {
    clockInterval = setInterval(() => {
      cachedNow = Date.now();
      clockListeners.forEach((listener) => listener());
    }, 1000);
  }
  return () => {
    clockListeners.delete(notify);
    if (clockListeners.size === 0 && clockInterval !== null) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
  };
}

function getClockSnapshot(): number {
  return cachedNow;
}

function getClockServerSnapshot(): number {
  // SSR baseline. The "elapsed counter" reads 0 server-side because the
  // client's first paint also reads 0 (status === ELAPSED hasn't started
  // ticking yet). Any non-zero would cause hydration mismatch.
  return 0;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function SpinnerIcon() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      className="h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface RotationStepperProps {
  status: RotationStatus;
  errorMessage?: string | null;
  onRetry?: () => void;
  /** Disable retry button even when failed (e.g. rate-limited) */
  retryDisabled?: boolean;
  retryDisabledMessage?: string;
}

export function RotationStepper({
  status,
  errorMessage,
  onRetry,
  retryDisabled,
  retryDisabledMessage,
}: RotationStepperProps) {
  const activeIndex = STATUS_TO_STEP_INDEX[status] ?? -1;
  const isFailed = status === "failed";
  const isComplete = status === "complete";

  // RC-13 (react-compiler-readiness, 2026-05-27): derive `elapsedSeconds`
  // from an external clock subscription plus React's documented
  // "adjust-state-during-render-when-a-prop-changes" pattern.
  //
  // Previous shape was useState(0) + reset-in-effect on status change,
  // which is the textbook set-state-in-effect pattern flagged by the
  // React Compiler readiness rules. The first refactor attempt used a
  // ref with lazy initialisation during render, which trips the
  // react-hooks/refs rule (refs cannot be read or written during render).
  //
  // New shape:
  //   - `now` comes from useSyncExternalStore against a module-level
  //     clock that ticks once per second. This is the canonical
  //     "subscribe to an external system" pattern; the snapshot is
  //     cached so React doesn't infinite-loop.
  //   - `startedAt` is plain state. We adjust it during render by
  //     comparing `prevStatus` to `status` (React docs:
  //     https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  //     The setState during render isn't flagged by set-state-in-effect
  //     because there's no effect involved.
  //   - `elapsedSeconds` is plain derived state from `now - startedAt`.
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getClockServerSnapshot);
  const [prevStatus, setPrevStatus] = useState<RotationStatus>(status);
  const [startedAt, setStartedAt] = useState<{ status: RotationStatus; ms: number } | null>(
    ELAPSED_STEPS.has(status) ? { status, ms: now } : null,
  );

  // Adjust state during render when the status prop changes — React's
  // canonical pattern for "derived state that resets on a prop change."
  if (status !== prevStatus) {
    setPrevStatus(status);
    setStartedAt(ELAPSED_STEPS.has(status) ? { status, ms: now } : null);
  }

  const elapsedSeconds =
    startedAt && startedAt.status === status ? Math.floor((now - startedAt.ms) / 1000) : 0;

  return (
    <div className="space-y-1">
      {STEPS.map((step, i) => {
        const isActive = i === activeIndex && !isFailed;
        const isCompleted = i < activeIndex || isComplete;
        const isFailedStep = isFailed && i === activeIndex && activeIndex >= 0;

        let iconBg = "bg-zinc-800 border border-zinc-700";
        let iconColor = "text-zinc-600";
        let labelColor = "text-zinc-500";

        if (isCompleted) {
          iconBg = "bg-emerald-900/40 border border-emerald-700/50";
          iconColor = "text-emerald-400";
          labelColor = "text-zinc-300";
        } else if (isActive) {
          iconBg = "bg-amber-900/30 border border-amber-600/50";
          iconColor = "text-amber-400";
          labelColor = "text-white";
        } else if (isFailedStep) {
          iconBg = "bg-red-900/30 border border-red-700/50";
          iconColor = "text-red-400";
          labelColor = "text-red-300";
        }

        const showElapsed = isActive && ELAPSED_STEPS.has(step.status);

        return (
          <div key={step.status} className="flex items-start gap-3 py-1">
            {/* Step icon */}
            <div
              className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${iconBg} ${iconColor}`}
            >
              {isCompleted ? (
                <CheckIcon />
              ) : isActive ? (
                <SpinnerIcon />
              ) : isFailedStep ? (
                <XIcon />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              )}
            </div>

            {/* Step text */}
            <div>
              <p className={`text-sm font-medium ${labelColor}`}>{step.label}</p>
              {isActive && (
                <p className="mt-0.5 text-xs text-zinc-500">
                  {showElapsed
                    ? `${step.activeSubLabel.replace("…", "")} — ${elapsedSeconds}s elapsed`
                    : step.activeSubLabel}
                </p>
              )}
              {isComplete && i === STEPS.length - 1 && (
                <p className="mt-0.5 text-xs text-emerald-500">{step.activeSubLabel}</p>
              )}
            </div>
          </div>
        );
      })}

      {/* Error block */}
      {isFailed && (
        <div className="mt-3 space-y-2 rounded-md border border-red-800/40 bg-red-950/30 px-3 py-2.5 text-sm text-red-300">
          <p>{errorMessage ?? "Rotation failed. Please try again."}</p>
          <p className="text-xs text-red-400/70">Your previous key is still active.</p>
          {onRetry && (
            <div className="pt-1">
              {retryDisabled ? (
                <p className="text-xs text-zinc-500">
                  {retryDisabledMessage ?? "Retry not available."}
                </p>
              ) : (
                <button
                  onClick={onRetry}
                  className="rounded-md border border-amber-700/50 bg-amber-900/20 px-3 py-1 text-xs text-amber-400 transition hover:border-amber-600 hover:bg-amber-900/40"
                >
                  Try Again
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
