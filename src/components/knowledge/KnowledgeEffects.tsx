"use client";

import { EffectComposer, Bloom } from "@react-three/postprocessing";

/**
 * Bloom post-processing for the Knowledge Graph.
 * Matches Substrate Viewer settings exactly so node colours (BLOOM_BOOST × 2.2)
 * glow identically on both pages.
 */
export default function KnowledgeEffects() {
  return (
    <EffectComposer>
      <Bloom intensity={1.0} luminanceThreshold={0.25} luminanceSmoothing={0.9} mipmapBlur />
    </EffectComposer>
  );
}
