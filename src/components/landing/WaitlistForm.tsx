"use client";

import { useState } from "react";

type State = "idle" | "loading" | "success" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || state === "loading") return;

    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong");
      }

      setState("success");
      setEmail("");
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Please try again.");
    }
  };

  if (state === "success") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-5 py-4">
        <svg
          className="h-5 w-5 flex-shrink-0 text-emerald-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
        <div>
          <p className="text-sm font-medium text-emerald-300">You&apos;re on the list.</p>
          <p className="text-xs text-emerald-500/70">
            We&apos;ll reach out when early access opens.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        required
        disabled={state === "loading"}
        className="border-surface-800 bg-surface-900 font-body text-surface-100 placeholder:text-surface-600 focus:border-brand-500 focus:ring-brand-500/30 flex-1 rounded-xl border px-4 py-3 text-sm transition-colors outline-none focus:ring-1 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={state === "loading" || !email}
        className="bg-brand-500 hover:bg-brand-400 inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold whitespace-nowrap text-white shadow-[0_0_24px_rgba(12,142,230,0.3)] transition-all hover:shadow-[0_0_32px_rgba(54,170,245,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state === "loading" ? (
          <>
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Joining…
          </>
        ) : (
          <>
            Join Early Access
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
              />
            </svg>
          </>
        )}
      </button>

      {state === "error" && <p className="text-xs text-red-400 sm:col-span-2">{errorMsg}</p>}
    </form>
  );
}
