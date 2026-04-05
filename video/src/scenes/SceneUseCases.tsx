/** Scene 3 — USE CASES (9s) — Not just for code */
import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C } from "../MMPMVideo";

const CASES = [
  {
    icon: "💻",
    tag: "Developer",
    tagColor: C.brand,
    borderColor: C.brand,
    title: "Architecture decisions remembered",
    body: "Every preference, decision, and correction persists across sessions. Your AI knows your stack, your patterns, and your rules — without you repeating them.",
    q: "→ \"What auth method did we decide on?\"",
    a: "✓ JWT with 24h expiry — your preference, set March 15th.",
    delay: 30,
  },
  {
    icon: "⚙️",
    tag: "Operations",
    tagColor: C.amber,
    borderColor: C.amber,
    title: "System state, always current",
    body: "Every billing event, deployment, and health check is a Merkle-sealed atom. Your AI manages infrastructure with full historical awareness and cryptographic audit trail.",
    q: "→ \"When did the last deployment happen?\"",
    a: "✓ 2026-04-03 14:22 UTC — 847 atoms committed.",
    delay: 60,
  },
  {
    icon: "🧠",
    tag: "Business Intelligence",
    tagColor: C.green,
    borderColor: C.green,
    title: "Compound learning over time",
    body: "Every customer interaction, market signal, and business decision compounds. Your AI gets smarter about your business with every session — not just every prompt.",
    q: "→ \"What do we know about enterprise pricing?\"",
    a: "✓ 12 atoms found. Team tier performs best at $79.",
    delay: 90,
  },
];

export const SceneUseCases: React.FC = () => {
  const frame = useCurrentFrame();

  const headerOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ padding: "0 60px" }}>
      {/* Header */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: headerOpacity,
        }}
      >
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 12,
            color: "rgba(54,170,245,0.6)",
            textTransform: "uppercase" as const,
            letterSpacing: "0.12em",
            marginBottom: 12,
          }}
        >
          Beyond code — every team, every use case
        </p>
        <h2
          style={{
            fontFamily: "sans-serif",
            fontSize: 46,
            fontWeight: 800,
            color: "white",
            letterSpacing: "-0.025em",
            margin: 0,
          }}
        >
          Not just for developers.
          <span
            style={{
              background: "linear-gradient(135deg, #36aaf5, #22d3ee)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              marginLeft: 12,
            }}
          >
            For everything your AI manages.
          </span>
        </h2>
      </div>

      {/* Cards */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 60,
          right: 60,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 28,
        }}
      >
        {CASES.map((c) => {
          const cardOpacity = interpolate(frame, [c.delay, c.delay + 30], [0, 1], { extrapolateRight: "clamp" });
          const cardY = interpolate(frame, [c.delay, c.delay + 30], [28, 0], { extrapolateRight: "clamp" });

          return (
            <div
              key={c.tag}
              style={{
                background: "rgba(15,23,42,0.85)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderTop: `2px solid ${c.borderColor}`,
                borderRadius: 20,
                padding: "36px 32px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                opacity: cardOpacity,
                transform: `translateY(${cardY}px)`,
              }}
            >
              <div style={{ fontSize: 40 }}>{c.icon}</div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase" as const,
                  color: c.tagColor,
                }}
              >
                {c.tag}
              </div>
              <div
                style={{
                  fontFamily: "sans-serif",
                  fontSize: 24,
                  fontWeight: 700,
                  color: "white",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                }}
              >
                {c.title}
              </div>
              <div
                style={{
                  fontFamily: "sans-serif",
                  fontSize: 15,
                  color: "rgba(148,163,184,0.75)",
                  lineHeight: 1.6,
                  flex: 1,
                }}
              >
                {c.body}
              </div>
              <div
                style={{
                  background: "rgba(30,41,59,0.7)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontFamily: "monospace",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <div style={{ color: "rgba(148,163,184,0.6)", marginBottom: 4 }}>{c.q}</div>
                <div style={{ color: "rgba(203,213,225,0.9)" }}>{c.a}</div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
