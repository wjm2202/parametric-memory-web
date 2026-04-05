"use client";

import { useState } from "react";

type TeamSize = "1-5" | "6-20" | "20+";
type FormState = "idle" | "submitting" | "success" | "error";

/**
 * Inline Team tier inquiry form.
 *
 * Shown in place of a self-serve checkout button on the Team pricing card.
 * On submit, POSTs to /api/team-inquiry which sends an email notification.
 * Team buyers get a conversation before paying — correct sales motion at $79/month.
 */
export function TeamInquiryForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [teamSize, setTeamSize] = useState<TeamSize>("1-5");
  const [formState, setFormState] = useState<FormState>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormState("submitting");

    try {
      const res = await fetch("/api/team-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, teamSize }),
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

  if (formState === "success") {
    return (
      <div className="mb-8 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-center">
        <p className="text-sm font-medium text-emerald-400">We&apos;ll be in touch shortly.</p>
        <p className="text-surface-400 mt-1 text-xs">Check your inbox.</p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mb-8">
        <button
          onClick={() => setOpen(true)}
          className="bg-surface-800 text-surface-200 hover:bg-surface-700 ring-surface-200/10 inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold ring-1 transition-all"
        >
          Talk to us →
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-8 space-y-3">
      <p className="text-surface-300 text-sm font-medium">Interested in the Team plan?</p>

      <input
        type="text"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="border-surface-700 bg-surface-800/60 text-surface-100 placeholder-surface-500 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-0"
      />

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="border-surface-700 bg-surface-800/60 text-surface-100 placeholder-surface-500 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-0"
      />

      <div className="grid grid-cols-3 gap-2">
        {(["1-5", "6-20", "20+"] as TeamSize[]).map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => setTeamSize(size)}
            className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
              teamSize === size
                ? "border-brand-500 bg-brand-500/10 text-brand-300"
                : "border-surface-700 text-surface-400 hover:border-surface-500"
            }`}
          >
            {size} people
          </button>
        ))}
      </div>

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
