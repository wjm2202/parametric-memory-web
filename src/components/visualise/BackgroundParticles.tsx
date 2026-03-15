"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 200;
const SPREAD = 30;

/**
 * Subtle floating particles in the background.
 * Creates depth and atmosphere — like dust motes in a dark lab.
 */
export default function BackgroundParticles() {
  const pointsRef = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3] = (Math.random() - 0.5) * SPREAD;
      arr[i * 3 + 1] = (Math.random() - 0.5) * SPREAD;
      arr[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
    }
    return arr;
  }, []);

  const velocities = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 0.003;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 0.002;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 0.003;
    }
    return arr;
  }, []);

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
