/** Scene 6 — THE CLOSE (7s) — Logo reveal + CTA */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, Logomark } from "../MMPMVideo";

export const SceneClose: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame: frame - 10, fps, config: { damping: 80, stiffness: 60 } });
  const logoOpacity = interpolate(frame, [10, 40], [0, 1], { extrapolateRight: "clamp" });

  const headingOpacity = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" });
  const headingY = interpolate(frame, [30, 60], [24, 0], { extrapolateRight: "clamp" });

  const subOpacity = interpolate(frame, [55, 80], [0, 1], { extrapolateRight: "clamp" });

  const ctaScale = spring({ frame: frame - 80, fps, config: { damping: 100, stiffness: 80 } });
  const ctaOpacity = interpolate(frame, [80, 105], [0, 1], { extrapolateRight: "clamp" });

  const microOpacity = interpolate(frame, [105, 130], [0, 1], { extrapolateRight: "clamp" });

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
      {/* Logo */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${0.7 + 0.3 * logoScale})`,
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 40,
        }}
      >
        <Logomark size={56} />
        <span
          style={{
            fontFamily: "sans-serif",
            fontSize: 28,
            fontWeight: 700,
            color: "rgba(255,255,255,0.8)",
            letterSpacing: "-0.02em",
          }}
        >
          Parametric Memory
        </span>
      </div>

      {/* Main heading */}
      <h1
        style={{
          fontFamily: "sans-serif",
          fontSize: 92,
          fontWeight: 800,
          color: "white",
          letterSpacing: "-0.04em",
          lineHeight: 1.0,
          margin: "0 0 20px",
          opacity: headingOpacity,
          transform: `translateY(${headingY}px)`,
        }}
      >
        Your AI's second brain.
        <br />
        <span
          style={{
            background: "linear-gradient(135deg, #36aaf5 0%, #22d3ee 50%, #f59e0b 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Ready in 60 seconds.
        </span>
      </h1>

      {/* Sub */}
      <p
        style={{
          fontFamily: "sans-serif",
          fontSize: 24,
          color: "rgba(148,163,184,0.6)",
          lineHeight: 1.5,
          marginBottom: 56,
          opacity: subOpacity,
        }}
      >
        Dedicated substrate · Cryptographic proofs · Markov prediction
        <br />
        Your own Merkle tree — not a row in someone else's database.
      </p>

      {/* CTA button */}
      <div
        style={{
          opacity: ctaOpacity,
          transform: `scale(${0.85 + 0.15 * ctaScale})`,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 14,
            background: C.brandDim,
            color: "white",
            fontFamily: "sans-serif",
            fontSize: 22,
            fontWeight: 700,
            padding: "20px 52px",
            borderRadius: 18,
            letterSpacing: "-0.01em",
            boxShadow: "0 0 80px rgba(12,142,230,0.55)",
          }}
        >
          Get Your Instance
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </div>
      </div>

      {/* Micro copy */}
      <div style={{ opacity: microOpacity }}>
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 15,
            color: "rgba(100,116,139,0.7)",
            letterSpacing: "0.04em",
            marginBottom: 8,
          }}
        >
          parametric-memory.dev
        </p>
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 13,
            color: "rgba(71,85,105,0.7)",
            letterSpacing: "0.04em",
          }}
        >
          Starting at $9/month · 14-day free trial · No credit card required to start
        </p>
      </div>
    </AbsoluteFill>
  );
};
