"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  useMemoryStore,
  SSE_ANIM_DURATION_MS,
  SSE_ANIM_ATOM_START_MS,
} from "@/stores/memory-store";

/**
 * S16-7: Train Particles — instanced point cloud that bursts outward
 * from atoms receiving "train" SSE events.
 *
 * Architecture:
 *   - Fixed pool of MAX_PARTICLES instanced points (pre-allocated, zero GC)
 *   - Each frame: scan active train animations, assign particles to atoms
 *   - Particles radiate outward from the atom position, fading as they go
 *   - When no train animations are active, all particles are hidden (scale 0)
 *
 * Performance:
 *   - Single InstancedMesh with MAX_PARTICLES instances
 *   - Only matrix + color updates per frame (no geometry allocation)
 *   - Particle assignment is O(activeTrainAnims × atomsPerAnim × particlesPerAtom)
 */

const MAX_PARTICLES = 120;
const PARTICLES_PER_ATOM = 8;
const PARTICLE_SPEED = 12; // units per second radial velocity
const PARTICLE_RADIUS = 0.06;
const PARTICLE_COLOR = new THREE.Color("#ffffff").multiplyScalar(3.0); // bright white, bloom-ready
const FADE_COLOR = new THREE.Color("#7dd3fc").multiplyScalar(2.0); // fades to sky blue

export default function TrainParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tmpObj = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  // Pre-compute stable random directions for each particle slot
  const directions = useMemo(() => {
    const dirs: THREE.Vector3[] = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      // Fibonacci sphere for even distribution
      const phi = Math.acos(1 - (2 * (i + 0.5)) / MAX_PARTICLES);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      dirs.push(
        new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta),
          Math.sin(phi) * Math.sin(theta),
          Math.cos(phi),
        ),
      );
    }
    return dirs;
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const { sseAnimations, atoms } = useMemoryStore.getState();
    const now = performance.now();

    let pIdx = 0; // next available particle slot

    for (const anim of sseAnimations) {
      if (anim.type !== "train") continue;
      if (pIdx >= MAX_PARTICLES) break;

      const elapsed = now - anim.startTime;
      if (elapsed < SSE_ANIM_ATOM_START_MS || elapsed > SSE_ANIM_DURATION_MS) continue;

      // Progress within the atom animation window (0→1)
      const progress =
        (elapsed - SSE_ANIM_ATOM_START_MS) / (SSE_ANIM_DURATION_MS - SSE_ANIM_ATOM_START_MS);

      for (const atomKey of anim.atomKeys) {
        if (pIdx >= MAX_PARTICLES) break;

        const atom = atoms.find((a) => a.key === atomKey);
        if (!atom) continue;
        const [ax, ay, az] = atom.position;
        if (ax === 0 && ay === 0 && az === 0) continue;

        // Assign PARTICLES_PER_ATOM particles radiating from this atom
        for (let p = 0; p < PARTICLES_PER_ATOM; p++) {
          if (pIdx >= MAX_PARTICLES) break;

          const dir = directions[pIdx % directions.length];
          const dist = progress * PARTICLE_SPEED * (0.5 + (pIdx % 3) * 0.25); // slight variation

          // Ease out: particles slow down and shrink
          const easeOut = 1 - progress * progress;
          const scale = PARTICLE_RADIUS * easeOut * (1.5 - progress * 0.5);

          tmpObj.position.set(ax + dir.x * dist, ay + dir.y * dist, az + dir.z * dist);
          tmpObj.scale.setScalar(scale > 0.001 ? scale : 0);
          tmpObj.updateMatrix();
          mesh.setMatrixAt(pIdx, tmpObj.matrix);

          // Color: white → sky blue, fading opacity via brightness
          const brightness = easeOut;
          tmpColor.copy(PARTICLE_COLOR).lerp(FADE_COLOR, progress);
          tmpColor.multiplyScalar(brightness);
          mesh.setColorAt(pIdx, tmpColor);

          pIdx++;
        }
      }
    }

    // Hide remaining unused particles
    for (let i = pIdx; i < MAX_PARTICLES; i++) {
      tmpObj.position.set(0, 0, 0);
      tmpObj.scale.setScalar(0);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_PARTICLES]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial toneMapped={false} transparent opacity={0.85} />
    </instancedMesh>
  );
}
