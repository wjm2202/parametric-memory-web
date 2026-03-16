"use client";

import { useRef, useMemo, useCallback } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import {
  useMemoryStore,
  SSE_ANIM_DURATION_MS,
  SSE_ANIM_ATOM_START_MS,
} from "@/stores/memory-store";
import type { SseAnimationType } from "@/stores/memory-store";
import { ATOM_COLORS, AtomType } from "@/types/memory";

const SPHERE_SEGMENTS = 16;
const BASE_RADIUS = 0.18;
const PULSE_SCALE = 1.6;

/**
 * Fixed capacity for the InstancedMesh — pre-allocated once, never recreated.
 * Must be >= the maximum number of atoms we'll ever display.
 * 2048 supports ~500 atoms per shard with headroom for growth.
 */
const MAX_INSTANCES = 2048;

/**
 * Bloom-ready per-type colors.
 * MeshBasicMaterial + toneMapped=false + bright colors → bloom picks them up.
 */
const BLOOM_BOOST = 2.2;
const TYPE_COLORS: Record<AtomType, THREE.Color> = Object.fromEntries(
  Object.entries(ATOM_COLORS).map(([type, hex]) => [
    type,
    new THREE.Color(hex).multiplyScalar(BLOOM_BOOST),
  ]),
) as Record<AtomType, THREE.Color>;

const HOVER_COLOR = new THREE.Color("#ffffff").multiplyScalar(BLOOM_BOOST);
const SELECT_COLOR = new THREE.Color("#f0abfc").multiplyScalar(BLOOM_BOOST);
const ACCESS_COLOR = new THREE.Color("#fbbf24").multiplyScalar(BLOOM_BOOST * 1.3); // bright amber
const TOMBSTONED_COLOR = new THREE.Color("#475569").multiplyScalar(0.6); // dim slate gray

/** S16-7: SSE animation flash colors per event type */
const SSE_FLASH_COLORS: Record<SseAnimationType, THREE.Color> = {
  add: new THREE.Color("#22d3ee").multiplyScalar(3.0), // bright cyan-green
  tombstone: new THREE.Color("#f472b6").multiplyScalar(3.0), // bright pink
  train: new THREE.Color("#ffffff").multiplyScalar(3.0), // bright white
  access: new THREE.Color("#fbbf24").multiplyScalar(3.0), // bright amber
};

/**
 * Module-level reusable Map — cleared each frame, never reallocated.
 * Eliminates GC pressure from per-frame `new Map()` allocation.
 */
const _atomAnimMap = new Map<string, { type: SseAnimationType; progress: number }>();

/**
 * Optimised per-frame rendering of atom spheres.
 *
 * Key optimisations:
 *   1. Fixed-capacity InstancedMesh — never recreated when atom count changes
 *   2. mesh.count updated to actual atom count (GPU only draws active instances)
 *   3. Module-level reusable Map for SSE animation lookups (zero GC per frame)
 *   4. Pre-computed sin/cos lookup, index-based comparisons
 */
export default function AtomNodes() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const atoms = useMemoryStore((s) => s.atoms);
  const selectedAtom = useMemoryStore((s) => s.selectedAtom);
  const hoveredAtom = useMemoryStore((s) => s.hoveredAtom);
  const selectAtom = useMemoryStore((s) => s.selectAtom);
  const hoverAtom = useMemoryStore((s) => s.hoverAtom);
  const accessPath = useMemoryStore((s) => s.accessPath);

  const tmpObj = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  // Pre-compute index lookups for selected/hovered/accessed (avoid string compare per instance)
  const selectedIdx = useMemo(() => {
    if (!selectedAtom) return -1;
    return atoms.findIndex((a) => a.key === selectedAtom);
  }, [atoms, selectedAtom]);

  const hoveredIdx = useMemo(() => {
    if (!hoveredAtom) return -1;
    return atoms.findIndex((a) => a.key === hoveredAtom);
  }, [atoms, hoveredAtom]);

  const accessedIdx = useMemo(() => {
    if (!accessPath) return -1;
    return atoms.findIndex((a) => a.key === accessPath.atomKey);
  }, [atoms, accessPath]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const atomCount = atoms.length;

    // Update mesh.count so GPU only draws active instances
    mesh.count = atomCount;

    if (atomCount === 0) return;

    const time = state.clock.elapsedTime;
    const now = performance.now();
    // Pre-compute shared trig values (reused across atoms)
    const sinT = Math.sin(time * 0.5);
    const cosT = Math.cos(time * 0.3);
    let colorChanged = false;

    // S16-7: Build a quick lookup of active SSE animations per atom key.
    // Reuse module-level Map — zero allocation per frame.
    const sseAnimations = useMemoryStore.getState().sseAnimations;
    _atomAnimMap.clear();
    for (const anim of sseAnimations) {
      const elapsed = now - anim.startTime;
      if (elapsed < SSE_ANIM_ATOM_START_MS || elapsed > SSE_ANIM_DURATION_MS) continue;
      const progress =
        (elapsed - SSE_ANIM_ATOM_START_MS) / (SSE_ANIM_DURATION_MS - SSE_ANIM_ATOM_START_MS);
      for (const key of anim.atomKeys) {
        const existing = _atomAnimMap.get(key);
        if (!existing || progress < existing.progress) {
          _atomAnimMap.set(key, { type: anim.type, progress });
        }
      }
    }

    for (let i = 0; i < atomCount; i++) {
      const atom = atoms[i];
      const [x, y, z] = atom.position;

      // Gentle floating — use pre-computed base + per-atom offset (cheap addition vs full trig)
      const phase = i * 0.3;
      const floatY = sinT * Math.cos(phase) * 0.08;
      const floatX = cosT * Math.sin(phase * 2.33) * 0.04;

      let scale = BASE_RADIUS;

      // S16-7: SSE animation effects on scale
      const sseAnim = _atomAnimMap.get(atom.key);

      if (atom.tombstoned) {
        // Tombstoned atoms are smaller and have no animation
        scale *= 0.7;
      } else if (sseAnim) {
        // Animation-driven scale
        const p = sseAnim.progress; // 0→1
        if (sseAnim.type === "add") {
          // Scale up from 0 → full, then settle
          const ramp = Math.min(1, p * 3); // ramps up in first third
          const eased = 1 - Math.pow(1 - ramp, 3);
          scale *= eased * (1 + Math.sin(p * Math.PI) * 0.4);
        } else if (sseAnim.type === "tombstone") {
          // Shrink from full → 0.7 over duration
          scale *= 1 - p * 0.3;
        } else if (sseAnim.type === "train") {
          // Bright pulse — scale bump
          scale *= 1 + Math.sin(p * Math.PI) * 0.5;
        } else {
          // access — regular pulse
          const pulsePhase = (time * 4) % (Math.PI * 2);
          scale *= 1 + Math.sin(pulsePhase) * (PULSE_SCALE - 1);
        }
      } else if (atom.pulse) {
        const pulsePhase = (time * 4) % (Math.PI * 2);
        scale *= 1 + Math.sin(pulsePhase) * (PULSE_SCALE - 1);
      }

      if (i === accessedIdx) {
        const elapsed = accessPath ? now - accessPath.startTime : 0;
        const t = Math.min(1, elapsed / 300);
        const eased = 1 - Math.pow(1 - t, 3);
        scale *= 1.8 * eased + Math.sin(time * 3) * 0.15 * eased;
      } else if (i === selectedIdx) scale *= 1.5;
      else if (i === hoveredIdx) scale *= 1.25;

      tmpObj.position.set(x + floatX, y + floatY, z);
      tmpObj.scale.setScalar(scale);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);

      // Color — SSE animation flash takes priority over base type color
      if (sseAnim && i !== selectedIdx && i !== hoveredIdx && i !== accessedIdx) {
        const flashColor = SSE_FLASH_COLORS[sseAnim.type];
        const baseColor = atom.tombstoned
          ? TOMBSTONED_COLOR
          : (TYPE_COLORS[atom.type] ?? TYPE_COLORS.other);
        // Flash intensity: strong at start, fades to base color
        const flashT = 1 - sseAnim.progress;
        tmpColor.copy(baseColor).lerp(flashColor, flashT * 0.8);
        colorChanged = true;
      } else if (atom.tombstoned && i !== selectedIdx && i !== hoveredIdx) {
        tmpColor.copy(TOMBSTONED_COLOR);
        colorChanged = true;
      } else if (i === accessedIdx) {
        tmpColor.copy(ACCESS_COLOR);
        colorChanged = true;
      } else if (i === selectedIdx) {
        tmpColor.copy(SELECT_COLOR);
        colorChanged = true;
      } else if (i === hoveredIdx) {
        tmpColor.copy(HOVER_COLOR);
        colorChanged = true;
      } else {
        tmpColor.copy(TYPE_COLORS[atom.type] ?? TYPE_COLORS.other);
        if (atom.pulse) {
          tmpColor.lerp(HOVER_COLOR, 0.6);
          colorChanged = true;
        }
      }
      mesh.setColorAt(i, tmpColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    // Only flag color update if something actually changed
    if (
      mesh.instanceColor &&
      (colorChanged ||
        selectedIdx >= 0 ||
        hoveredIdx >= 0 ||
        accessedIdx >= 0 ||
        _atomAnimMap.size > 0)
    ) {
      mesh.instanceColor.needsUpdate = true;
    }
  });

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined && e.instanceId < atoms.length && atoms[e.instanceId]) {
        selectAtom(atoms[e.instanceId].key);
      }
    },
    [atoms, selectAtom],
  );

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined && e.instanceId < atoms.length && atoms[e.instanceId]) {
        hoverAtom(atoms[e.instanceId].key);
        document.body.style.cursor = "pointer";
      }
    },
    [atoms, hoverAtom],
  );

  const handlePointerOut = useCallback(() => {
    hoverAtom(null);
    document.body.style.cursor = "auto";
  }, [hoverAtom]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_INSTANCES]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, SPHERE_SEGMENTS, SPHERE_SEGMENTS]} />
      <meshBasicMaterial toneMapped={false} transparent opacity={0.92} />
    </instancedMesh>
  );
}
