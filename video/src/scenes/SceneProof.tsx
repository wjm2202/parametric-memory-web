/** Scene 4 — THE PROOF (8s) — Merkle verification + stats */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C } from "../MMPMVideo";

const PROOF_STATS = [
  { v: "RFC 6962", l: "Merkle proof standard", color: C.brand },
  { v: "SHA-256", l: "Hash algorithm", color: C.cyan },
  { v: "37%", l: "token savings (compact proofs)", color: C.amber },
  { v: "Zero", l: "shared infrastructure", color: C.green },
];

const HASH_NODES = [
  { label: "⬡ Root Hash · f3a2b9c1", level: 0, active: true, root: true, delay: 30 },
  { label: "Shard A · 8d4f", level: 1, active: true, delay: 50 },
  { label: "Shard B · 2c91", level: 1, active: true, delay: 60 },
  { label: "atom.001", level: 2, active: false, delay: 75 },
  { label: "atom.002", level: 2, active: true, delay: 80 },
  { label: "atom.003", level: 2, active: false, delay: 85 },
  { label: "atom.004", level: 2, active: true, delay: 90 },
];

export const SceneProof: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const leftOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 80,
        padding: "60px 100px",
        alignItems: "center",
      }}
    >
      {/* ── Left: Headline + stats ── */}
      <div style={{ opacity: leftOpacity }}>
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 12,
            color: "rgba(54,170,245,0.6)",
            textTransform: "uppercase" as const,
            letterSpacing: "0.12em",
            marginBottom: 20,
          }}
        >
          Cryptographic verification
        </p>
        <h2
          style={{
            fontFamily: "sans-serif",
            fontSize: 64,
            fontWeight: 800,
            color: "white",
            letterSpacing: "-0.035em",
            lineHeight: 1.1,
            margin: "0 0 20px",
          }}
        >
          Verified by math.
          <br />
          <span
            style={{
              background: "linear-gradient(135deg, #36aaf5, #22d3ee)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Not trusted on faith.
          </span>
        </h2>
        <p
          style={{
            fontFamily: "sans-serif",
            fontSize: 19,
            color: "rgba(148,163,184,0.7)",
            lineHeight: 1.6,
            marginBottom: 36,
          }}
        >
          Every competitor asks you to trust their infrastructure.
          We give you a Merkle proof — mathematical evidence your
          memories are intact, untampered, and yours alone.
        </p>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {PROOF_STATS.map((s, i) => {
            const delay = 40 + i * 15;
            const statOpacity = interpolate(frame, [delay, delay + 20], [0, 1], { extrapolateRight: "clamp" });
            return (
              <div
                key={s.l}
                style={{
                  background: "rgba(15,23,42,0.8)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14,
                  padding: "18px 20px",
                  opacity: statOpacity,
                }}
              >
                <div
                  style={{
                    fontFamily: "sans-serif",
                    fontSize: 32,
                    fontWeight: 800,
                    color: s.color,
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                    marginBottom: 6,
                  }}
                >
                  {s.v}
                </div>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: 11,
                    color: "rgba(100,116,139,0.8)",
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.08em",
                  }}
                >
                  {s.l}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: Merkle tree visualisation ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
        }}
      >
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 12,
            color: "rgba(100,116,139,0.6)",
            textTransform: "uppercase" as const,
            letterSpacing: "0.1em",
            marginBottom: 20,
            opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          Your Merkle audit trail
        </p>

        {/* Root */}
        <HashBlock label="⬡ Root Hash · f3a2b9c1" isRoot delay={30} frame={frame} />
        <div style={{ width: 1, height: 24, background: "rgba(54,170,245,0.2)" }} />

        {/* Level 1 */}
        <div style={{ display: "flex", gap: 20 }}>
          <HashBlock label="Shard A · 8d4f" active delay={50} frame={frame} />
          <HashBlock label="Shard B · 2c91" active delay={60} frame={frame} />
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ width: 1, height: 24, background: "rgba(54,170,245,0.15)", marginRight: 90 }} />
          <div style={{ width: 1, height: 24, background: "rgba(54,170,245,0.15)" }} />
        </div>

        {/* Level 2 */}
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { label: "atom.001", active: false, delay: 75 },
            { label: "atom.002", active: true,  delay: 80 },
            { label: "atom.003", active: false, delay: 85 },
            { label: "atom.004", active: true,  delay: 90 },
          ].map((n) => (
            <HashBlock key={n.label} label={n.label} active={n.active} delay={n.delay} frame={frame} small />
          ))}
        </div>

        {/* Verified banner */}
        <div
          style={{
            marginTop: 28,
            padding: "16px 28px",
            background: "rgba(16,185,129,0.07)",
            border: "1px solid rgba(16,185,129,0.2)",
            borderRadius: 14,
            textAlign: "center",
            opacity: interpolate(frame, [110, 135], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 13,
              color: C.green,
              marginBottom: 4,
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
            }}
          >
            ✓ Proof verified
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(100,116,139,0.7)" }}>
            All atoms intact · Root hash matches · 0.045ms
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

function HashBlock({
  label,
  active = false,
  isRoot = false,
  delay,
  frame,
  small = false,
}: {
  label: string;
  active?: boolean;
  isRoot?: boolean;
  delay: number;
  frame: number;
  small?: boolean;
}) {
  const opacity = interpolate(frame, [delay, delay + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        opacity,
        background: isRoot
          ? "rgba(245,158,11,0.08)"
          : active
          ? "rgba(54,170,245,0.08)"
          : "rgba(30,41,59,0.8)",
        border: `1px solid ${
          isRoot ? "rgba(245,158,11,0.4)" : active ? "rgba(54,170,245,0.35)" : "rgba(255,255,255,0.07)"
        }`,
        borderRadius: 10,
        padding: small ? "8px 12px" : "10px 16px",
        fontFamily: "monospace",
        fontSize: small ? 11 : 13,
        color: isRoot ? C.amber : active ? "white" : "rgba(148,163,184,0.6)",
        boxShadow: isRoot
          ? "0 0 24px rgba(245,158,11,0.15)"
          : active
          ? "0 0 16px rgba(54,170,245,0.1)"
          : "none",
      }}
    >
      {label}
    </div>
  );
}
