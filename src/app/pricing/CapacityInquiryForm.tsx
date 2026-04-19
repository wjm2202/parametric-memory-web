"use client";

import { useState } from "react";
import type { TierId } from "@/config/tiers";

type FormState = "idle" | "submitting" | "success" | "error";

interface Props {
  /**
   * The pricing tier the customer is inquiring from. Pre-filled into the
   * form payload and rendered as a read-only display label — the user
   * cannot change it client-side.
   */
  tier: TierId;
  /**
   * Visual variant.
   *
   *  - "primary": big filled button that becomes the card's main CTA.
   *    Used on the Team card, which has no self-serve checkout.
   *  - "link":    subtle text link that sits below an existing primary CTA.
   *    Used on Starter / Solo / Professional cards so the self-serve
   *    checkout stays the dominant action.
   */
  variant?: "primary" | "link";
  /** Override the collapsed CTA label. Defaults per variant. */
  ctaLabel?: string;
}

const TIER_LABEL: Record<TierId, string> = {
  free: "Free",
  starter: "Starter",
  indie: "Solo",
  pro: "Professional",
  team: "Team",
};

function placeholderFor(tier: TierId): string {
  if (tier === "team") {
    return "e.g. team of 15 engineers, need SSO and extra bootstraps";
  }
  return "e.g. running low on atoms, interested in a custom quota";
}

/**
 * Capacity-inquiry form used across every pricing tier card.
 *
 * The tier is pre-filled from the `tier` prop and is not user-editable; the
 * form POSTs to /api/capacity-inquiry with `{ name, email, tier, message }`.
 *
 * Generalised from the old TeamInquiryForm (2026-04-19, sprint 2026-W17 Item B)
 * so that customers on Starter/Solo/Professional can also signal "my limits
 * aren't enough — quote me something custom" without having to upgrade to
 * Team to get a conversation.
 */
export function CapacityInquiryForm({ tier, variant = "primary", ctaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormState("submitting");

    try {
      const res = await fetch("/api/capacity-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, tier, message }),
      });

      if (res.ok) {
        setFormState("success");
      } else {
        setFormState("error");
      }
    } catch {
      setFormState("error");
    }
  }

  // ── Success state ───────────────────────────────────────────────────────
  if (formState === "success") {
    return (
      <div
        data-testid={`capacity-success-${tier}`}
        className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-center"
      >
        <p className="text-sm font-medium text-emerald-400">We&apos;ll be in touch shortly.</p>
        <p className="text-surface-400 mt-1 text-xs">Check your inbox.</p>
      </div>
    );
  }

  // ── Collapsed CTA ───────────────────────────────────────────────────────
  if (!open) {
    const defaultLabel =
      variant === "primary" ? "Talk to us →" : "Need more capacity? Talk to us →";

    if (variant === "primary") {
      return (
        <div className="mb-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            data-testid={`capacity-cta-${tier}`}
            data-tier={tier}
            className="bg-surface-800 text-surface-200 hover:bg-surface-700 ring-surface-200/10 inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold ring-1 transition-all"
          >
            {ctaLabel ?? defaultLabel}
          </button>
        </div>
      );
    }

    // "link" variant — subtle, sits under the features list. Margin/positioning
    // is the call-site's responsibility so this stays composable.
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={`capacity-cta-${tier}`}
        data-tier={tier}
        className="text-surface-400 hover:text-surface-200 text-left text-xs underline-offset-2 transition hover:underline"
      >
        {ctaLabel ?? defaultLabel}
      </button>
    );
  }

  // ── Expanded form ───────────────────────────────────────────────────────
  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-3"
      data-testid={`capacity-form-${tier}`}
      data-tier={tier}
      aria-label={`Capacity inquiry form for ${TIER_LABEL[tier]} plan`}
    >
      <p className="text-surface-300 text-sm font-medium">Tell us what you need</p>

      {/* Tier is not user-editable: shown as read-only display + hidden input. */}
      <div className="text-surface-400 text-xs">
        Plan:{" "}
        <span className="text-surface-200 font-medium" data-testid={`capacity-tier-label-${tier}`}>
          {TIER_LABEL[tier]}
        </span>
      </div>
      <input
        type="hidden"
        name="tier"
        value={tier}
        readOnly
        data-testid={`capacity-tier-input-${tier}`}
      />

      <input
        type="text"
        name="name"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="border-surface-700 bg-surface-800/60 text-surface-100 placeholder-surface-500 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-0"
      />

      <input
        type="email"
        name="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="border-surface-700 bg-surface-800/60 text-surface-100 placeholder-surface-500 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-0"
      />

      <textarea
        name="message"
        placeholder={placeholderFor(tier)}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        rows={3}
        className="border-surface-700 bg-surface-800/60 text-surface-100 placeholder-surface-500 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-0"
      />

      <button
        type="submit"
        disabled={formState === "submitting"}
        className="bg-brand-500 hover:bg-brand-400 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-wait disabled:opacity-50"
      >
        {formState === "submitting" ? "Sending…" : "Send →"}
      </button>

      {formState === "error" && (
        <p className="text-center text-xs text-red-400">Something went wrong. Email us directly.</p>
      )}
    </form>
  );
}
