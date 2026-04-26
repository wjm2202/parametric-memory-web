/**
 * HeroSceneWrapper — server-component shim around the hero background.
 *
 * History:
 *   - v1: dynamically imported R3F Three.js scene. Tanked Lighthouse TBT
 *     (37+ seconds of main-thread work) — the rAF loop kept the JS thread
 *     pinned.
 *   - v2: static SVG diagram (MemoryRing). Zero JS, but visually static —
 *     didn't read as "alive" enough for the brand.
 *   - v3 (sprint 2026-W17): user-recorded video. Best of both — moves
 *     visually, costs zero CPU after the first paint, ~3 MB on desktop /
 *     ~290 KB on mobile. Audio stripped at encode time.
 *
 * Kept as a wrapper so page.tsx's import path doesn't change. This file is
 * a server component — no "use client", no hooks, no JS shipped.
 */

import { HeroVideo } from "./HeroVideo";

export function HeroSceneWrapper() {
  return <HeroVideo />;
}
