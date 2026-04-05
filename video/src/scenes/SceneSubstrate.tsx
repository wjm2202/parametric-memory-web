/** Scene 2 — THE SUBSTRATE (8s) */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C } from "../MMPMVideo";

const STATS = [
  { value: "821+", label: "atoms sealed", color: C.brand },
  { value: "0.045ms", label: "recall latency", color: C.cyan },
  { value: "64%", label: "Markov hit rate", color: C.amber },
  { value: "<60s", label: "instance setup", color: C.green },
];

export const SceneSubstrate: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headingOpacity = interpolate(frame, [15, 45], [0, 1], { extrapolateRight: "clamp" });
  const headingY = interpolate(frame, [15, 45], [30, 0], { extrapolateRight: "clamp" });

  const subOpacity = interpolate(frame, [40, 70], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "0 120px",
      }}
    >
      {/* Live badge */}
      <div
        style={{
          opacity: interpolate(frame, [5, 30], [0, 1], { extrapolateRight: "clamp" }),
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(16,185,129,0.1)",
          border: "1px solid rgba(16,185,129,0.25)",
          borderRadius: 99,
          padding: "8px 20px",
          fontFamily: "monospace",
          fontSize: 12,
          color: C.green,
          letterSpacing: "0.1em",
          textTransform: "uppercase" as const,
          marginBottom: 28,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: C.green,
            display: "inline-block",
          }}
        />
        Live substrate — in production since March 2026
      </div>

      {/* Heading */}
      <h1
        style={{
          fontFamily: "sans-serif",
          fontSize: 88,
          fontWeight: 800,
          color: "white",
          letterSpacing: "-0.04em",
          lineHeight: 1.0,
          margin: "0 0 20px",
          opacity: headingOpacity,
          transform: `translateY(${headingY}px)`,
        }}
      >
        Memory that
        <br />
        <span
          style={{
            background: "linear-gradient(135deg, #36aaf5 0%, #22d3ee 50%, #f59e0b 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          proves itself.
        </span>
      </h1>

      {/* Subheading */}
      <p
        style={{
          fontFamily: "sans-serif",
          fontSize: 24,
          color: "rgba(148,163,184,0.7)",
          lineHeight: 1.5,
          marginBottom: 60,
          maxWidth: 800,
          opacity: subOpacity,
        }}
      >
        Every thought your AI has — stored, hashed, and cryptographically sealed.
        <br />
        Recalled in 0.045ms. Predicted before you ask.
      </p>

      {/* Stats */}
      <div style={{ display: "flex", gap: 60, justifyContent: "center" }}>
        {STATS.map((s, i) => {
          const delay = 70 + i * 20;
          const statOpacity = interpolate(frame, [delay, delay + 25], [0, 1], { extrapolateRight: "clamp" });
          const statY = interpolate(frame, [delay, delay + 25], [20, 0], { extrapolateRight: "clamp" });
          return (
            <div
              key={s.label}
              style={{
                textAlign: "center",
                opacity: statOpacity,
                transform: `translateY(${statY}px)`,
              }}
            >
              <div
                style={{
                  fontFamily: "sans-serif",
                  fontSize: 56,
                  fontWeight: 800,
                  color: s.color,
                  letterSpacing: "-0.04em",
                  lineHeight: 1,
                  marginBottom: 8,
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: "rgba(100,116,139,0.8)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.1em",
                }}
              >
                {s.label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
