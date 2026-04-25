/**
 * HeroSceneWrapper — server-component shim around <MemoryRing />.
 *
 * Previously this dynamically imported the R3F three.js scene and deferred
 * mount until idle, but R3F's continuous rAF loop tanked Lighthouse TBT
 * (37+ seconds of main-thread work). The static SVG diagram in MemoryRing
 * conveys the same product semantics (Merkle root, 4 shards, Markov
 * transitions) at zero JS cost.
 *
 * Kept as a wrapper so page.tsx's import path doesn't change. This file is
 * now a server component — no "use client", no hooks, no JS shipped.
 */

import { MemoryRing } from "./MemoryRing";

export function HeroSceneWrapper() {
  return <MemoryRing />;
}
