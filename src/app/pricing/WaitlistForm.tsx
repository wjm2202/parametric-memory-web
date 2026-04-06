"use client";

import { useState } from "react";

interface WaitlistFormProps {
  tier: string;
  tierDisplayName: string;
  message: string;
}

export function WaitlistForm({ tier, tierDisplayName, message }: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/capacity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, tier }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong.");
        setStatus("error");
        return;
      }

      setStatus("success");
    } catch {
      setErrorMsg("Network error. Check your connection.");
      setStatus("error");
    }
  }

  // Success state
  if (status === "success") {
    return (
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
        <p className="text-sm font-medium text-emerald-400">You&apos;re on the list.</p>
        <p className="mt-1 text-xs text-emerald-400/70">
          We&apos;ll email you at {email} as soon as a {tierDisplayName} slot opens.
        </p>
      </div>
    );
  }

  // Idle / loading / error state
  return (
    <div className="space-y-2.5">
      {message && <p className="text-surface-400 text-xs">{message}</p>}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className="bg-surface-900/50 text-surface-200 placeholder:text-surface-500 flex-1 rounded-lg px-3 py-2 text-sm ring-1 ring-amber-400/30 transition-all focus:ring-2 focus:ring-amber-400/50 focus:outline-none"
          disabled={status === "loading"}
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-300 ring-1 ring-amber-400/30 transition-all hover:bg-amber-500/30 hover:ring-amber-400/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "loading" ? "Saving…" : "Notify me"}
        </button>
      </form>
      {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
    </div>
  );
}
