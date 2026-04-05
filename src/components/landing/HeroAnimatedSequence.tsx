"use client";

/**
 * HeroAnimatedSequence
 *
 * On mount: cycles through 5 taglines (2s each).
 * After the last tagline: fades into the "close" state and stays there.
 *
 * Phases:
 *   "taglines"  →  cycles TAGLINES[0..4]
 *   "close"     →  shows the CTA hero content, never transitions away
 *
 * The R3F canvas (HeroSceneWrapper) and vignette live in the parent —
 * this component only controls the foreground text content.
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

// ── Taglines ───────────────────────────────────────────────────────────────

const TAGLINES = [
  {
    line1: "AI with a perfect memory.",
    line2: "And the receipts to prove it.",
  },
  {
    line1: "Don't just trust your AI.",
    line2: "Verify it.",
  },
  {
    line1: "Stop predicting the next word.",
    line2: "Start predicting the next thought.",
  },
  {
    line1: "Memory that learns.",
    line2: "Proof that it's real.",
  },
  {
    line1: "The end of AI hallucinations",
    line2: "starts at the memory layer.",
  },
];

const TAGLINE_HOLD_MS = 2000; // how long each tagline is fully visible
const FADE_MS = 380; // CSS transition duration

// ── Gradient text style ────────────────────────────────────────────────────

const gradStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #36aaf5 0%, #22d3ee 55%, #f59e0b 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
  display: "inline",
};

// ── Component ──────────────────────────────────────────────────────────────

type Phase = "taglines" | "close";

export function HeroAnimatedSequence() {
  const [phase, setPhase] = useState<Phase>("taglines");
  const [taglineIdx, setTaglineIdx] = useState(0);

  // Controls the CSS transition: 0 = invisible+shifted, 1 = fully visible
  const [shown, setShown] = useState(false);

  // Prevent stale closure issues in timeout chains
  const taglineIdxRef = useRef(taglineIdx);
  taglineIdxRef.current = taglineIdx;

  // ── Mount: fade in first tagline ──────────────────────────────────────
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Tagline cycling engine ─────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "taglines") return;

    // Hold the current tagline, then advance
    const holdTimer = setTimeout(() => {
      // 1. Fade out
      setShown(false);

      // 2. After fade completes, switch content then fade back in
      const switchTimer = setTimeout(() => {
        const idx = taglineIdxRef.current;

        if (idx < TAGLINES.length - 1) {
          // More taglines remain
          setTaglineIdx(idx + 1);
        } else {
          // Last tagline done — move to close phase
          setPhase("close");
        }

        // Tiny tick to let React re-render with new content before fading in
        requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      }, FADE_MS);

      return () => clearTimeout(switchTimer);
    }, TAGLINE_HOLD_MS);

    return () => clearTimeout(holdTimer);
  }, [phase, taglineIdx]);

  // ── Shared transition style ────────────────────────────────────────────
  const transStyle: React.CSSProperties = {
    transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
    opacity: shown ? 1 : 0,
    transform: shown ? "translateY(0)" : "translateY(18px)",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  };

  // ── Render tagline phase ───────────────────────────────────────────────
  if (phase === "taglines") {
    const t = TAGLINES[taglineIdx];
    return (
      <div className="relative z-10 mx-auto max-w-6xl px-6" style={transStyle}>
        {/* Tagline */}

        <h1
          className="font-display mb-6 font-extrabold tracking-tight text-white"
          style={{
            fontSize: "clamp(32px, 4.5vw, 64px)",
            letterSpacing: "-0.035em",
            lineHeight: 1.1,
          }}
        >
          {t.line1}
          <br />
          <span style={gradStyle}>{t.line2}</span>
        </h1>
      </div>
    );
  }

  // ── Render close phase (stays here permanently) ─────────────────────────
  return (
    <div className="relative z-10 mx-auto max-w-5xl px-6" style={transStyle}>
      {/* Main heading */}
      <h1
        className="font-display mb-5 font-extrabold tracking-tight text-white"
        style={{ fontSize: "clamp(32px, 4.5vw, 64px)", letterSpacing: "-0.04em", lineHeight: 1.05 }}
      >
        Your AI&apos;s second brain.
        <br />
        <span style={gradStyle}>Ready in 60 seconds.</span>
      </h1>

      {/* Subtitle */}
      <p
        className="font-body mb-3 font-medium"
        style={{ fontSize: "clamp(16px, 2vw, 20px)", color: "#7cc8fb" }}
      >
        Persistent, Verifiable Memory for AI
      </p>

      <p
        className="font-body mb-10"
        style={{ fontSize: "clamp(13px, 1.4vw, 15px)", color: "rgba(148,163,184,0.55)" }}
      >
        Built for developers using Claude, GPT, and any MCP-compatible agent.
      </p>

      {/* CTAs */}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        {/* Primary */}
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-semibold text-white transition-all"
          style={{
            background: "#0c8ee6",
            boxShadow: "0 0 32px rgba(12,142,230,0.4)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.boxShadow = "0 0 44px rgba(54,170,245,0.55)";
            (e.currentTarget as HTMLElement).style.background = "#36aaf5";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.boxShadow = "0 0 32px rgba(12,142,230,0.4)";
            (e.currentTarget as HTMLElement).style.background = "#0c8ee6";
          }}
        >
          Get Your Instance
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
        </Link>

        {/* Secondary */}
        <a
          href="/knowledge"
          className="inline-flex items-center gap-2 rounded-xl border px-7 py-3.5 text-sm font-semibold backdrop-blur-sm transition-all"
          style={{
            borderColor: "rgba(30,41,59,1)",
            background: "rgba(15,23,42,0.6)",
            color: "rgba(203,213,225,0.9)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(54,170,245,0.4)";
            (e.currentTarget as HTMLElement).style.color = "white";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(30,41,59,1)";
            (e.currentTarget as HTMLElement).style.color = "rgba(203,213,225,0.9)";
          }}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="#36aaf5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
            />
          </svg>
          See It Live
        </a>
      </div>
    </div>
  );
}
