"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 200;
const SPREAD = 30;

// ── Deterministic particle generation ───────────────────────────────────────
//
// The previous implementation called `Math.random()` inside `useMemo`. That
// looked safe because of the empty dep array, but `useMemo` is allowed to
// re-run between renders, and `Math.random()` is impure during render — the
// React Compiler's `react-hooks/purity` rule rightly flags this.
//
// Fix: pre-compute positions and velocities once at module load via a
// tiny seeded PRNG (mulberry32). The visual is identical (still a noisy
// cloud of dust motes) but the output is now deterministic and computed
// outside of any React lifecycle.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildField(seed: number, count: number, scale: number): Float32Array {
  const rand = mulberry32(seed);
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = (rand() - 0.5) * scale;
    arr[i * 3 + 1] = (rand() - 0.5) * scale;
    arr[i * 3 + 2] = (rand() - 0.5) * scale;
  }
  return arr;
}

// Two independent seeds so positions and velocities are uncorrelated.
const POSITIONS = buildField(0xc0ffee, PARTICLE_COUNT, SPREAD);
const VEL_X_Z = buildField(0xfeed_face, PARTICLE_COUNT, 0.003);
// y-axis drift is gentler — overlay a softer field on top of the x/z one.
for (let i = 0; i < PARTICLE_COUNT; i++) {
  VEL_X_Z[i * 3 + 1] = (VEL_X_Z[i * 3 + 1] / 0.003) * 0.002;
}
const VELOCITIES = VEL_X_Z;

/**
 * Subtle floating particles in the background.
 * Creates depth and atmosphere — like dust motes in a dark lab.
 */
export default function BackgroundParticles() {
  const pointsRef = useRef<THREE.Points>(null);
  const positions = POSITIONS;
  const velocities = VELOCITIES;

  useFrame(() => {
    const geo = pointsRef.current?.geometry;
    if (!geo) return;

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3] += velocities[i * 3];
      arr[i * 3 + 1] += velocities[i * 3 + 1];
      arr[i * 3 + 2] += velocities[i * 3 + 2];

      // Wrap around boundaries
      for (let j = 0; j < 3; j++) {
        if (arr[i * 3 + j] > SPREAD / 2) arr[i * 3 + j] = -SPREAD / 2;
        if (arr[i * 3 + j] < -SPREAD / 2) arr[i * 3 + j] = SPREAD / 2;
      }
    }

    pos.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={PARTICLE_COUNT}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        color="#334155"
        transparent
        opacity={0.4}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}
