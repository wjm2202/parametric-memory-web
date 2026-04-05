/** Scene 5 — TAGLINE CAROUSEL (10s) — 5 taglines, 2s each */
import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C } from "../MMPMVideo";

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

const FRAMES_PER_TAGLINE = 60; // 2s each
const FADE_FRAMES = 10;

export const SceneTaglines: React.FC = () => {
  const frame = useCurrentFrame();

  const labelOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const idx = Math.min(Math.floor(frame / FRAMES_PER_TAGLINE), TAGLINES.length - 1);
  const localFrame = frame % FRAMES_PER_TAGLINE;

  // Fade in / out within each tagline window
  const taglineOpacity = interpolate(
    localFrame,
    [0, FADE_FRAMES, FRAMES_PER_TAGLINE - FADE_FRAMES, FRAMES_PER_TAGLINE],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const taglineY = interpolate(
    localFrame,
    [0, FADE_FRAMES],
    [16, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const tagline = TAGLINES[idx];

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "0 160px",
      }}
    >
      {/* Label */}
      <p
        style={{
          fontFamily: "monospace",
          fontSize: 12,
          color: "rgba(54,170,245,0.5)",
          textTransform: "uppercase" as const,
          letterSpacing: "0.14em",
          marginBottom: 56,
          opacity: labelOpacity,
        }}
      >
        Parametric Memory — the principle
      </p>

      {/* Tagline text */}
      <div
        style={{
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          marginBottom: 64,
        }}
      >
        <h1
          style={{
            fontFamily: "sans-serif",
            fontSize: 72,
            fontWeight: 800,
            color: "white",
            letterSpacing: "-0.04em",
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          {tagline.line1}
          <br />
          <span
            style={{
              background: "linear-gradient(135deg, #36aaf5 0%, #22d3ee 60%, #f59e0b 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {tagline.line2}
          </span>
        </h1>
      </div>

      {/* Progress dots */}
      <div style={{ display: "flex", gap: 10 }}>
        {TAGLINES.map((_, i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: i === idx ? C.brand : "rgba(54,170,245,0.2)",
              transition: "background 0.3s",
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
