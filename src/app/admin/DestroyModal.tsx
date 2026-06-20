/**
 * DestroyModal — the single Destroy & Unsubscribe modal (D2).
 *
 * Replaces the old two-button design (CancelModal + DeprovisionModal). One
 * entry point, one confirm, keeping Stripe and the substrate in agreement.
 * The customer picks a TIMING:
 *   • period_end — stop renewal, keep full access until the paid period ends,
 *                  then it's destroyed + unsubscribed automatically. Reversible
 *                  via reactivate. No refund.
 *   • now        — stop immediately: the unused, non-provisioning portion is
 *                  refunded, the substrate is deleted, and the subscription is
 *                  cancelled. Shows the exact refund, warns it's immediate and
 *                  can't be self-served back, and gates on a type-"destroy".
 *
 * NO SILENT BLOCK: every non-OK response is surfaced. A 409
 * `refund_requires_manual_review` (dispute / unresolved charge) tells the user
 * nothing was charged and their substrate is untouched; a 500 tells them
 * nothing changed. The success toast only fires on a 2xx.
 */

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { readReauthFlag, redirectToReauth } from "@/lib/reauth";

export type DestroyTiming = "period_end" | "now";

interface RefundPreview {
  refundCents: number;
  withheldFeeCents: number;
}

const CONFIRM_PHRASE = "destroy";
const fmtUsd = (cents: number) => `$${(Math.max(0, cents) / 100).toFixed(2)}`;

export function DestroyModal({
  slug,
  endsOn,
  canSchedulePeriodEnd = true,
  refundable = true,
  onClose,
  onDestroyed,
}: {
  /** Slug of the substrate being destroyed. */
  slug: string;
  /** Human-readable end-of-paid-period date (for the period_end option). */
  endsOn?: string;
  /**
   * Whether "at period end" is offered. False for substrates with nothing to
   * schedule (free tier, no active sub, already-cancelling, or provision_failed)
   * — those only support immediate destroy (deprovision, no refund).
   */
  canSchedulePeriodEnd?: boolean;
  /**
   * Whether a destroy-now refund is possible. False when no charge was taken
   * (e.g. provision_failed) — the modal then skips the refund preview and shows
   * a "nothing to refund" note instead.
   */
  refundable?: boolean;
  /** Fires on backdrop click, Esc, or Keep. */
  onClose: () => void;
  /** Fires after a successful destroy/schedule; parent should re-fetch. */
  onDestroyed: () => void;
}) {
  const [timing, setTiming] = useState<DestroyTiming>(canSchedulePeriodEnd ? "period_end" : "now");
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RefundPreview | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "loaded" | "error">(
    "idle",
  );

  // Esc closes (not mid-submit).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, loading]);

  // Fetch the refund preview the first time the customer picks "now" (only when
  // a refund is possible — provision_failed etc. took no charge).
  useEffect(() => {
    if (timing !== "now" || !refundable || previewStatus !== "idle") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewStatus("loading");
    void (async () => {
      try {
        const res = await fetch(
          `/api/substrates/${encodeURIComponent(slug)}/cancel/refund-preview`,
        );
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
  }, [timing, previewStatus, slug, refundable]);

  const nowConfirmed =
    (!refundable || previewStatus === "loaded") &&
    confirmText.trim().toLowerCase() === CONFIRM_PHRASE;
  const canConfirm = !loading && (timing === "period_end" || nowConfirmed);

  async function handleConfirm() {
    if (!canConfirm) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/substrates/${encodeURIComponent(slug)}/destroy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timing }),
      });

      if (await readReauthFlag(res)) {
        redirectToReauth();
        return;
      }

      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { refund?: { refunded?: boolean } };
        if (timing === "now") {
          const refunded = body.refund?.refunded === true;
          toast.success("Substrate destroyed", {
            description: refunded
              ? "We refunded the unused portion to your card, cancelled your subscription, and deleted the substrate. Access has ended."
              : "We cancelled your subscription and deleted the substrate. Access has ended.",
          });
        } else {
          toast.success("Cancellation scheduled", {
            description:
              "You keep full access until your billing period ends, then it's destroyed and unsubscribed automatically. Reactivate any time before then.",
          });
        }
        onDestroyed();
        onClose();
        return;
      }

      // NO SILENT BLOCK — surface every non-OK outcome.
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      if (body?.error === "refund_requires_manual_review") {
        setError(
          "We've paused this for a manual review — you have not been charged or refunded, and your substrate is untouched. Support will follow up shortly.",
        );
      } else if (body?.error === "substrate_not_destroyable") {
        setError("This substrate is already being torn down.");
      } else if (res.status >= 500) {
        setError("Something went wrong and nothing was changed. Please try again.");
      } else {
        setError(body?.message ?? body?.error ?? `Destroy failed (HTTP ${res.status}).`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="destroy-modal-title"
      data-testid="destroy-modal-backdrop"
      className="fixed top-[var(--site-nav-h)] right-0 bottom-0 left-0 z-40 flex items-center justify-center px-4 py-6"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
      />
      <div
        className="relative flex max-h-[calc(100dvh-var(--site-nav-h)-3rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-red-500/30 bg-[#0d0d14] shadow-2xl"
        data-testid="destroy-modal"
      >
        {/* Scrollable body — everything except the action buttons. On short or
            zoomed viewports this scrolls while the footer stays pinned, so the
            Destroy/Keep buttons are always reachable. */}
        <div data-testid="destroy-modal-scroll" className="flex-1 overflow-y-auto px-6 pt-6 pb-4">
          <h2 id="destroy-modal-title" className="font-semibold text-white">
            Destroy {slug}
          </h2>
          <p className="mt-1 text-sm text-white/50">
            This deprovisions the substrate and cancels your subscription together.
          </p>

          <div className="mt-4 space-y-2">
            {canSchedulePeriodEnd && (
              <DestroyOption
                value="period_end"
                current={timing}
                disabled={loading}
                onSelect={setTiming}
                title="At period end"
                body={
                  endsOn
                    ? `Keep full access until ${endsOn}, then it's destroyed and unsubscribed automatically. No refund. Reactivate any time before then.`
                    : "Keep full access until your billing period ends, then it's destroyed and unsubscribed automatically. No refund. Reactivate any time before then."
                }
              />
            )}
            <DestroyOption
              value="now"
              current={timing}
              disabled={loading}
              onSelect={setTiming}
              title="Destroy now"
              body="Stop immediately and refund the unused, non-provisioning portion of this period to your card."
            />
          </div>

          {timing === "now" && (
            <div
              className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4"
              data-testid="destroy-now-detail"
            >
              {!refundable ? (
                <p className="text-xs text-white/60" data-testid="destroy-no-charge">
                  No charge was taken for this substrate, so there&apos;s nothing to refund. This
                  deprovisions it immediately.
                </p>
              ) : previewStatus === "loading" ? (
                <div
                  className="h-4 w-40 animate-pulse rounded bg-white/10"
                  data-testid="destroy-preview-loading"
                />
              ) : previewStatus === "error" ? (
                <p className="text-sm text-white/60" data-testid="destroy-preview-error">
                  We couldn&apos;t calculate your refund right now. Please try again
                  {canSchedulePeriodEnd ? ", or choose “At period end”" : ""}.
                </p>
              ) : previewStatus === "loaded" && preview ? (
                <>
                  <p className="text-xs tracking-wider text-white/40 uppercase">
                    Refund to your card
                  </p>
                  <p
                    className="mt-1 text-lg font-semibold text-white"
                    data-testid="destroy-refund-amount"
                  >
                    {fmtUsd(preview.refundCents)}
                  </p>
                  {preview.withheldFeeCents > 0 && (
                    <p className="mt-1 text-xs text-white/50" data-testid="destroy-fee-excluded">
                      Excludes the non-refundable provisioning fee (
                      {fmtUsd(preview.withheldFeeCents)}
                      ), already used for setup.
                    </p>
                  )}
                </>
              ) : null}

              {(!refundable || previewStatus === "loaded") && (
                <>
                  <p
                    className="mt-3 text-xs font-medium text-red-300"
                    data-testid="destroy-irreversible-warning"
                  >
                    Your substrate is deleted immediately — access ends now and it can&apos;t be
                    self-served back. This can&apos;t be undone.
                  </p>
                  <label className="mt-3 block text-xs text-white/60">
                    Type{" "}
                    <span className="font-mono font-semibold text-white/80">{CONFIRM_PHRASE}</span>{" "}
                    to confirm
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      disabled={loading}
                      data-testid="destroy-confirm-input"
                      autoComplete="off"
                      className="mt-1 w-full rounded-md border border-white/15 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-red-500/60"
                    />
                  </label>
                </>
              )}
            </div>
          )}

          {error && (
            <p
              data-testid="destroy-modal-error"
              className="mt-4 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-200"
            >
              {error}
            </p>
          )}
        </div>

        {/* Action buttons — pinned footer, never scrolls, so Keep/Destroy stay
            visible regardless of viewport height. */}
        <div
          data-testid="destroy-modal-footer"
          className="flex shrink-0 gap-3 border-t border-white/10 px-6 py-4"
        >
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            data-testid="destroy-modal-keep"
            className="flex-1 rounded-lg border border-white/10 py-2 text-sm text-white/60 transition hover:border-white/20 hover:text-white/80 disabled:opacity-50"
          >
            Keep subscription
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            data-testid="destroy-modal-confirm"
            className="flex flex-1 items-center justify-center rounded-lg bg-red-600 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Working…" : timing === "now" ? "Destroy now" : "Schedule at period end"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DestroyOption({
  value,
  current,
  title,
  body,
  disabled,
  onSelect,
}: {
  value: DestroyTiming;
  current: DestroyTiming;
  title: string;
  body: string;
  disabled: boolean;
  onSelect: (v: DestroyTiming) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(value)}
      data-testid={`destroy-timing-${value}`}
      aria-pressed={active}
      className={`w-full rounded-lg border p-3 text-left transition disabled:opacity-50 ${
        active ? "border-red-500/60 bg-red-500/10" : "border-white/10 hover:border-white/20"
      }`}
    >
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-0.5 text-xs text-white/50">{body}</p>
    </button>
  );
}
