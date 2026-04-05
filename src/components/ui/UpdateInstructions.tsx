"use client";

import { useState } from "react";

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 flex-shrink-0 text-zinc-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ── Accordion item ────────────────────────────────────────────────────────────

function AccordionItem({ label, steps }: { label: string; steps: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-zinc-700/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-zinc-400 transition-colors hover:text-zinc-200"
        aria-expanded={open}
      >
        <span>{label}</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <ol className="space-y-1.5 border-t border-zinc-700/50 px-3 py-2.5">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2 text-xs text-zinc-400">
              <span className="flex-shrink-0 font-medium text-zinc-500">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const CLAUDE_DESKTOP_STEPS = [
  "Open Claude Desktop → Settings → Developer → Edit Config",
  "Replace the Authorization header value with your new key",
  "Restart Claude Desktop",
  "Your memory substrate will reconnect automatically",
];

const COWORK_STEPS = [
  "Open Cowork → Settings → Connected Services",
  "Find your Parametric Memory connection and click Edit",
  "Replace the Authorization header value with your new key",
  "Save — Cowork will reconnect automatically",
];

export function UpdateInstructions() {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-zinc-500">Need help updating your app?</p>
      <AccordionItem label="How do I update Claude Desktop?" steps={CLAUDE_DESKTOP_STEPS} />
      <AccordionItem label="How do I update Cowork?" steps={COWORK_STEPS} />
    </div>
  );
}
