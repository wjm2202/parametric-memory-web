/**
 * MMPM Product Explainer Video — 50 seconds @ 30fps = 1500 frames
 *
 * Scene Timeline:
 *   S1  0–240    (0–8s)    The Pain — AI amnesia problem
 *   S2  240–480  (8–16s)   The Substrate — memory network visualisation
 *   S3  480–750  (16–25s)  Use Cases — dev, ops, business
 *   S4  750–990  (25–33s)  The Proof — Merkle verification
 *   S5  990–1290 (33–43s)  Tagline Carousel
 *   S6  1290–1500 (43–50s) The Close — CTA
 *
 * All transitions use fade() from @remotion/transitions at 20 frames.
 */

import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import { ScenePain } from "./scenes/ScenePain";
import { SceneSubstrate } from "./scenes/SceneSubstrate";
import { SceneUseCases } from "./scenes/SceneUseCases";
import { SceneProof } from "./scenes/SceneProof";
import { SceneTaglines } from "./scenes/SceneTaglines";
import { SceneClose } from "./scenes/SceneClose";
import { SubstrateNetwork } from "./components/SubstrateNetwork";

export const VIDEO_FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;

// Scene durations in frames (at 30fps)
export const SCENE = {
  S1_START: 0,    S1_DUR: 240,  // 8s
  S2_START: 240,  S2_DUR: 240,  // 8s
  S3_START: 480,  S3_DUR: 270,  // 9s
  S4_START: 750,  S4_DUR: 240,  // 8s
  S5_START: 990,  S5_DUR: 300,  // 10s
  S6_START: 1290, S6_DUR: 210,  // 7s
};

export const VIDEO_DURATION_FRAMES = 1500; // 50s

// Brand colours
export const C = {
  brand:   "#36aaf5",
  brandDim:"#0c8ee6",
  cyan:    "#22d3ee",
  amber:   "#f59e0b",
  green:   "#10b981",
  red:     "#ef4444",
  bg:      "#020617",
  surface: "#0f172a",
  surface800: "#1e293b",
  text400: "#94a3b8",
  text300: "#cbd5e1",
  text200: "#e2e8f0",
};

// Transition duration
const TRANS_DUR = 20;

export const MMPMVideo: React.FC = () => {
  const frame = useCurrentFrame();

  // Global substrate brightness — changes per scene
  const substrateBrightness = (() => {
    if (frame < SCENE.S1_START + SCENE.S1_DUR) return 0.28;   // Pain: dim
    if (frame < SCENE.S2_START + SCENE.S2_DUR) return 0.95;   // Substrate: full
    if (frame < SCENE.S3_START + SCENE.S3_DUR) return 0.45;   // Use cases: medium
    if (frame < SCENE.S4_START + SCENE.S4_DUR) return 0.32;   // Proof: dim
    if (frame < SCENE.S5_START + SCENE.S5_DUR) return 0.60;   // Taglines: medium
    return 0.70; // Close
  })();

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: "sans-serif" }}>

      {/* ── Background particle network (always running) ── */}
      <AbsoluteFill>
        <SubstrateNetwork brightness={substrateBrightness} />
      </AbsoluteFill>

      {/* ── Vignette ── */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse 85% 75% at 50% 50%, transparent 35%, rgba(2,6,23,0.75) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* ── Scene transitions ── */}
      <TransitionSeries>

        {/* S1: Pain */}
        <TransitionSeries.Sequence durationInFrames={SCENE.S1_DUR}>
          <ScenePain />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANS_DUR })}
        />

        {/* S2: Substrate */}
        <TransitionSeries.Sequence durationInFrames={SCENE.S2_DUR}>
          <SceneSubstrate />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANS_DUR })}
        />

        {/* S3: Use Cases */}
        <TransitionSeries.Sequence durationInFrames={SCENE.S3_DUR}>
          <SceneUseCases />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANS_DUR })}
        />

        {/* S4: Proof */}
        <TransitionSeries.Sequence durationInFrames={SCENE.S4_DUR}>
          <SceneProof />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANS_DUR })}
        />

        {/* S5: Taglines */}
        <TransitionSeries.Sequence durationInFrames={SCENE.S5_DUR}>
          <SceneTaglines />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANS_DUR })}
        />

        {/* S6: Close */}
        <TransitionSeries.Sequence durationInFrames={SCENE.S6_DUR}>
          <SceneClose />
        </TransitionSeries.Sequence>

      </TransitionSeries>

      {/* ── Persistent brand mark (bottom-left) ── */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: 60,
            display: "flex",
            alignItems: "center",
            gap: 10,
            opacity: 0.4,
            fontFamily: "monospace",
            fontSize: 13,
            color: C.text400,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <Logomark size={18} />
          parametric-memory.dev
        </div>
      </AbsoluteFill>

    </AbsoluteFill>
  );
};

export function Logomark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      <circle cx="36" cy="36" r="32" stroke="#36aaf5" strokeWidth="1.5" opacity="0.5" />
      <line x1="36" y1="36" x2="36" y2="4" stroke="#36aaf5" strokeWidth="1" opacity="0.6" />
      <line x1="36" y1="36" x2="68" y2="36" stroke="#36aaf5" strokeWidth="1" opacity="0.6" />
      <line x1="36" y1="36" x2="36" y2="68" stroke="#36aaf5" strokeWidth="1" opacity="0.6" />
      <line x1="36" y1="36" x2="4" y2="36" stroke="#36aaf5" strokeWidth="1" opacity="0.6" />
      <circle cx="36" cy="36" r="4" fill="#f59e0b" />
      <circle cx="36" cy="4" r="3.5" fill="#36aaf5" />
      <circle cx="68" cy="36" r="3.5" fill="#36aaf5" />
      <circle cx="36" cy="68" r="3.5" fill="#36aaf5" />
      <circle cx="4" cy="36" r="3.5" fill="#36aaf5" />
    </svg>
  );
}
