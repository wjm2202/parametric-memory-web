"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  useMemoryStore,
  RING_RADIUS,
  RING_Y,
  SHARD_ANGLES,
  SSE_ANIM_DURATION_MS,
} from "@/stores/memory-store";

/**
 * Ring Particle Flow — ambient flowing particles around the hash ring.
 *
 * Particles orbit continuously around the ring, creating a sense of
 * life and activity even when no operations are happening.
 * During SSE events, particles near the active shard accelerate
 * and brighten, drawing the eye to the action.
 *
 * Architecture:
 *   - InstancedMesh with PARTICLE_COUNT instances
 *   - Each particle has an angle (position on ring), speed, and slight Y/radial offset
 *   - Module-level state arrays: no GC, pure math per frame
 *   - Acceleration zones near active shards
 */

const PARTICLE_COUNT = 64;
const BASE_SPEED = 0.15; // radians per second
const ACCEL_SPEED = 0.8; // radians per second near active shard
const ACCEL_ZONE = Math.PI / 6; // angular radius of acceleration zone
const PARTICLE_SIZE = 0.04;
const ORBIT_Y_RANGE = 0.3; // vertical wobble
const ORBIT_R_RANGE = 0.4; // radial wobble
const BASE_COLOR = new THREE.Color("#0ea5e9").multiplyScalar(0.8); // dim sky blue
const ACTIVE_COLOR = new THREE.Color("#22d3ee").multiplyScalar(2.5); // bright cyan
const RING_INNER_OFFSET = -0.1; // particles orbit slightly inside the ring

// Module-level particle state (no GC)
const angles = new Float32Array(PARTICLE_COUNT);
const speeds = new Float32Array(PARTICLE_COUNT);
const yOffsets = new Float32Array(PARTICLE_COUNT);
const rOffsets = new Float32Array(PARTICLE_COUNT);
const phases = new Float32Array(PARTICLE_COUNT); // for wobble

// Initialize once
for (let i = 0; i < PARTICLE_COUNT; i++) {
  angles[i] = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
  speeds[i] = BASE_SPEED * (0.7 + Math.random() * 0.6);
  yOffsets[i] = (Math.random() - 0.5) * ORBIT_Y_RANGE;
  rOffsets[i] = (Math.random() - 0.5) * ORBIT_R_RANGE + RING_INNER_OFFSET;
  phases[i] = Math.random() * Math.PI * 2;
}

export default function RingParticleFlow() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tmpObj = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Find active shard from SSE animations
    const { sseAnimations } = useMemoryStore.getState();
    const now = performance.now();

    // Collect active shard angles and their intensities
    const activeShards: { angle: number; intensity: number }[] = [];
    for (const anim of sseAnimations) {
      const elapsed = now - anim.startTime;
      if (elapsed < 0 || elapsed > SSE_ANIM_DURATION_MS) continue;
      const ramp = Math.min(1, elapsed / 200);
      const fadeStart = SSE_ANIM_DURATION_MS * 0.5;
      const fade = elapsed > fadeStart
        ? 1.0 - Math.min(1.0, (elapsed - fadeStart) / (SSE_ANIM_DURATION_MS - fadeStart))
        : 1.0;
      const shardAngle = SHARD_ANGLES[anim.shardId] ?? 0;
      activeShards.push({ angle: shardAngle, intensity: ramp * fade });
    }

    const clampedDelta = Math.min(delta, 0.05); // cap for tab-out

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Check proximity to active shards
      let accelFactor = 0;
      let glowFactor = 0;
      for (const { angle: sa, intensity } of activeShards) {
        let angleDist = Math.abs(angles[i] - sa);
        if (angleDist > Math.PI) angleDist = Math.PI * 2 - angleDist;
        if (angleDist < ACCEL_ZONE) {
          const proximity = 1 - angleDist / ACCEL_ZONE;
          accelFactor = Math.max(accelFactor, proximity * intensity);
          glowFactor = Math.max(glowFactor, proximity * intensity);
        }
      }

      // Update angle with acceleration
      const speed = speeds[i] + accelFactor * (ACCEL_SPEED - speeds[i]);
      angles[i] += speed * clampedDelta;
      if (angles[i] > Math.PI * 2) angles[i] -= Math.PI * 2;

      // Wobble
      const wobbleY = Math.sin(now * 0.001 + phases[i]) * ORBIT_Y_RANGE * 0.5;
      const r = RING_RADIUS + rOffsets[i];

      tmpObj.position.set(
        Math.cos(angles[i]) * r,
        RING_Y + yOffsets[i] + wobbleY,
        Math.sin(angles[i]) * r,
      );

      // Scale: slightly larger when accelerated
      const scale = PARTICLE_SIZE * (1 + accelFactor * 0.8);
      tmpObj.scale.setScalar(scale);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);

      // Color: blend from dim to bright near active shard
      tmpColor.copy(BASE_COLOR).lerp(ACTIVE_COLOR, glowFactor);
      mesh.setColorAt(i, tmpColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 4, 4]} />
      <meshBasicMaterial toneMapped={false} transparent opacity={0.7} depthWrite={false} />
    </instancedMesh>
  );
}
