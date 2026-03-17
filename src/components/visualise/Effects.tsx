"use client";

import { EffectComposer, Bloom } from "@react-three/postprocessing";

/**
 * Post-processing effects — the "game-engine quality" glow.
 *
 * UnrealBloom creates the signature neon glow around emissive atoms.
 * This is what separates a tech demo from a product visualization.
 */
export default function Effects() {
  return (
    <EffectComposer>
      <Bloom intensity={1.0} luminanceThreshold={0.25} luminanceSmoothing={0.9} mipmapBlur />
    </EffectComposer>
  );
}
