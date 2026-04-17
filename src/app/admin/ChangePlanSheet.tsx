/**
 * ChangePlanSheet — right-side slide-in sheet that lists the tiers the
 * customer can upgrade to from their current plan.
 *
 * Responsibilities:
 *   - On open, fetch GET /api/billing/upgrade-options?substrateSlug=X.
 *   - Render one row per option strictly above the current tier. Each row
 *     shows: tier name + price + hosting badge + limits delta +
 *     dedicated-migration warning (if applicable) + Select button.
 *   - Clicking Select opens <ConfirmUpgradeDialog> inside the same tree.
 *   - Handle loading / empty / error states with copy from tier-change-copy.
 *   - Backdrop click, Esc key, and the × button all call onClose (never fires
 *     while the ConfirmUpgradeDialog is open — that dialog owns its own
 *     lifecycle, and closing the sheet under a confirmation would strand the
 *     user mid-submit).
 *
 * All copy lives in ./tier-change-copy — no inline strings.
 *
 * @see PLAN-ADMIN-UPGRADE-FLOW.md §4.2
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEDICATED_MIGRATION_WARNING_BODY,
  DEDICATED_MIGRATION_WARNING_TITLE,
  SHEET_SUBTITLE_EMPTY,
  SHEET_SUBTITLE_ERROR,
  SHEET_SUBTITLE_LOADING,
  SHEET_TITLE,
  formatAtomsDelta,
  formatBootstrapsDelta,
  formatStorageDelta,
  formatUsdCents,
} from "./tier-change-copy";
import { ConfirmUpgradeDialog, type UpgradeOption } from "./ConfirmUpgradeDialog";

/**
 * Shape returned by GET /api/billing/upgrade-options. We pin the fields the
 * sheet reads; anything else the backend adds is forwarded untouched to
 * ConfirmUpgradeDialog via the UpgradeOption shape.
 */
interface UpgradeOptionsResponse {
  currentTier: string;
  currentHostingModel?: "shared" | "dedicated";
  options: UpgradeOption[];
}

/**
 * Current-tier caps used to compute the per-row delta strings. Optional
 * because AdminClient only has them once billingStatus resolves — the sheet
 * gracefully skips the delta line when caps aren't provided rather than
 * rendering "NaN atoms".
 */
export interface CurrentTierLimits {
  maxAtoms: number;
  maxBootstrapsMonth: number;
  maxStorageMb: number;
}

interface Props {
  /** Controls visibility. When false the sheet renders nothing. */
  open: boolean;
  /**
   * Fires on backdrop click, Esc, or × button. Does NOT fire when
   * ConfirmUpgradeDialog closes — the dialog owns its own open/close.
   */
  onClose: () => void;
  /** Forwarded to the upgrade-options fetch + ConfirmUpgradeDialog. */
  substrateSlug: string;
  /** Current tier ID. Forwarded to ConfirmUpgradeDialog for the from/to line. */
  currentTier: string;
  /**
   * Current tier's resource caps. Used for the per-row deltas. Pass null when
   * billingStatus hasn't loaded yet — the row just skips the delta list.
   */
  currentLimits: CurrentTierLimits | null;
  /**
   * Next billing date, forwarded to ConfirmUpgradeDialog so the proration line
   * reads "…then $X/mo on May 17". null if unknown.
   */
  nextBillingDate: Date | null;
}

/**
 * Fetch state discriminated union — makes the render-switch exhaustive.
 * - "idle": sheet closed, nothing in flight
 * - "loading": fetch in flight
 * - "ready": options array resolved (may be empty — "you're on the top tier")
 * - "error": fetch failed OR response non-ok OR body missing options array
 */
type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; options: UpgradeOption[] }
  | { kind: "error" };

export function ChangePlanSheet({
  open,
  onClose,
  substrateSlug,
  currentTier,
  currentLimits,
  nextBillingDate,
}: Props) {
  const [fetchState, setFetchState] = useState<FetchState>({ kind: "idle" });
  const [selectedOption, setSelectedOption] = useState<UpgradeOption | null>(null);

  // ── Fetch on open ────────────────────────────────────────────────────────
  //
  // Race guard: if the user closes the sheet before the fetch resolves (or
  // reopens it quickly), the in-flight promise must not clobber the next
  // state. The useEffect cleanup flag flips when open transitions true→false
  // or when the effect re-runs for any other reason.
  useEffect(() => {
    if (!open) {
      // Reset to idle on close so the next open shows a fresh loading state.
      setFetchState({ kind: "idle" });
      setSelectedOption(null);
      return;
    }

    let cancelled = false;
    setFetchState({ kind: "loading" });

    (async () => {
      try {
        const res = await fetch(
          `/api/billing/upgrade-options?substrateSlug=${encodeURIComponent(substrateSlug)}`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (!res.ok) {
          setFetchState({ kind: "error" });
          return;
        }
        const body = (await res.json()) as Partial<UpgradeOptionsResponse>;
        if (cancelled) return;
        if (!body || !Array.isArray(body.options)) {
          setFetchState({ kind: "error" });
          return;
        }
        setFetchState({ kind: "ready", options: body.options });
      } catch {
        if (cancelled) return;
        setFetchState({ kind: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, substrateSlug]);

  // ── Esc closes (unless ConfirmUpgradeDialog is open — it owns its own Esc) ──
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !selectedOption) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, selectedOption]);

  // Stable onClose for the dialog child.
  const handleDialogClose = useCallback(() => setSelectedOption(null), []);

  if (!open) return null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-plan-sheet-title"
        data-testid="change-plan-sheet"
        className="fixed inset-0 z-40 flex justify-end"
      >
        {/* Backdrop — click closes, disabled while ConfirmUpgradeDialog is up. */}
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          data-testid="change-plan-sheet-backdrop"
          onClick={() => {
            if (!selectedOption) onClose();
          }}
        />

        <aside className="relative flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-white/10 bg-[#0d0d14] shadow-2xl">
          {/* Header */}
          <header className="flex items-start justify-between gap-4 border-b border-white/5 px-6 py-5">
            <div>
              <h2
                id="change-plan-sheet-title"
                className="font-[family-name:var(--font-syne)] text-lg font-semibold text-white"
              >
                {SHEET_TITLE}
              </h2>
              <p className="mt-1 text-sm text-white/50" data-testid="change-plan-sheet-subtitle">
                {subtitleFor(fetchState)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close change-plan sheet"
              data-testid="change-plan-sheet-close"
              className="rounded-md p-1 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
            >
              <CloseIcon />
            </button>
          </header>

          {/* Body — switches on fetch state */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {fetchState.kind === "loading" ? (
              <LoadingBody />
            ) : fetchState.kind === "error" ? (
              <ErrorBody />
            ) : fetchState.kind === "ready" && fetchState.options.length === 0 ? (
              <EmptyBody />
            ) : fetchState.kind === "ready" ? (
              <ul className="space-y-4" data-testid="change-plan-sheet-options">
                {fetchState.options.map((option) => (
                  <OptionRow
                    key={option.tier}
                    option={option}
                    currentLimits={currentLimits}
                    onSelect={() => setSelectedOption(option)}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        </aside>
      </div>

      {selectedOption && (
        <ConfirmUpgradeDialog
          substrateSlug={substrateSlug}
          currentTier={currentTier}
          option={selectedOption}
          nextBillingDate={nextBillingDate}
          onClose={handleDialogClose}
        />
      )}
    </>
  );
}

// ─── Subtitle copy ───────────────────────────────────────────────────────────

function subtitleFor(state: FetchState): string {
  switch (state.kind) {
    case "loading":
    case "idle":
      return SHEET_SUBTITLE_LOADING;
    case "error":
      return SHEET_SUBTITLE_ERROR;
    case "ready":
      return state.options.length === 0 ? SHEET_SUBTITLE_EMPTY : "Choose a plan to upgrade to.";
  }
}

// ─── One tier row ────────────────────────────────────────────────────────────

function OptionRow({
  option,
  currentLimits,
  onSelect,
}: {
  option: UpgradeOption;
  currentLimits: CurrentTierLimits | null;
  onSelect: () => void;
}) {
  const isDedicated = option.hostingModel === "dedicated";
  const isMigration = option.transitionKind === "shared_to_dedicated";

  // Build the delta strings. Each helper returns null when the delta is ≤ 0
  // so we simply filter out nulls.
  const deltas: string[] = currentLimits
    ? [
        formatAtomsDelta(currentLimits.maxAtoms, option.limits.maxAtoms),
        formatBootstrapsDelta(currentLimits.maxBootstrapsMonth, option.limits.maxBootstrapsMonth),
        formatStorageDelta(currentLimits.maxStorageMb, option.limits.maxStorageMb),
      ].filter((d): d is string => d !== null)
    : [];

  return (
    <li
      data-testid={`change-plan-option-${option.tier}`}
      className="rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-indigo-500/40"
    >
      {/* Header row: name + price + hosting badge */}
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-syne)] text-base font-semibold text-white">
            {option.name}
          </p>
          <p
            className="mt-1 text-sm text-white/60"
            data-testid={`change-plan-option-${option.tier}-price`}
          >
            {formatUsdCents(option.amountCents)}/mo
          </p>
        </div>
        <span
          data-testid={`change-plan-option-${option.tier}-hosting`}
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            isDedicated
              ? "border-indigo-400/40 bg-indigo-500/10 text-indigo-300"
              : "border-white/15 bg-white/5 text-white/60"
          }`}
        >
          {isDedicated ? "Dedicated" : "Shared"}
        </span>
      </div>

      {/* Limits delta list */}
      {deltas.length > 0 && (
        <ul
          data-testid={`change-plan-option-${option.tier}-deltas`}
          className="mt-3 space-y-1 text-xs text-white/60"
        >
          {deltas.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}

      {/* Dedicated-migration warning */}
      {isMigration && (
        <div
          data-testid={`change-plan-option-${option.tier}-warning`}
          className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
        >
          <p className="text-xs font-semibold text-amber-300">
            {DEDICATED_MIGRATION_WARNING_TITLE}
          </p>
          <p className="mt-1 text-xs text-white/60">{DEDICATED_MIGRATION_WARNING_BODY}</p>
        </div>
      )}

      {/* Select button */}
      <button
        type="button"
        onClick={onSelect}
        data-testid={`change-plan-option-${option.tier}-select`}
        className="mt-4 w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
      >
        Select
      </button>
    </li>
  );
}

// ─── State bodies ────────────────────────────────────────────────────────────

function LoadingBody() {
  return (
    <div className="flex items-center justify-center py-12" data-testid="change-plan-sheet-loading">
      <Spinner />
    </div>
  );
}

function ErrorBody() {
  return (
    <div
      className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200"
      data-testid="change-plan-sheet-error"
    >
      {SHEET_SUBTITLE_ERROR}
    </div>
  );
}

function EmptyBody() {
  return (
    <div
      className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/60"
      data-testid="change-plan-sheet-empty"
    >
      {SHEET_SUBTITLE_EMPTY}
    </div>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="h-6 w-6 animate-spin text-indigo-400"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
