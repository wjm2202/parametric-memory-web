"use client";

import { useRef, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useMemoryStore } from "@/stores/memory-store";
import {
  getVisualDepth,
  treeNodePosition,
  atomTreeDepth,
  atomTreePosInLevel,
} from "@/stores/memory-store";

/**
 * Renders a dim dot at every BFS node position in each shard's visual tree,
 * showing the full Merkle skeleton (occupied and empty positions).
 *
 * Uses THREE.Points instead of InstancedMesh:
 * - No fixed capacity limit — grows organically with the tree depth
 * - Single draw call regardless of node count
 * - Positions and per-vertex colors pushed imperatively via useEffect,
 *   same pattern as MerkleEdges, so R3F args-update issues don't apply
 * - Worker already computes placeholderPositions + placeholderColors as
 *   Float32Arrays — we just forward them straight to the GPU
 *
 * Zero per-frame work — geometry is only updated when the atom set changes.
 */

const POINT_SIZE = 0.12; // world-space point radius (THREE.Points sizeAttenuation)

export default function TreePlaceholders() {
  const geoRef = useRef<THREE.BufferGeometry>(null);
  const geometry = useMemoryStore((s) => s.geometry);
  const atoms = useMemoryStore((s) => s.atoms);

  // Fallback: compute locally if worker geometry isn't available yet
  const localData = useMemo(() => {
    if (geometry) return null; // worker data available, skip local computation

    const shardCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    const occupiedNodes: Record<number, Set<number>> = {
      0: new Set(),
      1: new Set(),
      2: new Set(),
      3: new Set(),
    };

    for (const a of atoms) {
      shardCounts[a.shard] = (shardCounts[a.shard] ?? 0) + 1;
    }

    const sortedByShard: Record<number, typeof atoms> = { 0: [], 1: [], 2: [], 3: [] };
    for (const a of atoms) {
      (sortedByShard[a.shard] ?? (sortedByShard[a.shard] = [])).push(a);
    }
    for (const sid of [0, 1, 2, 3]) {
      sortedByShard[sid].sort((a, b) => a.index - b.index);
      for (let i = 0; i < sortedByShard[sid].length; i++) {
        const depth = atomTreeDepth(i);
        const posInLevel = atomTreePosInLevel(i);
        occupiedNodes[sid]?.add(depth * 1000 + posInLevel);
      }
    }

    const posArr: number[] = [];
    const colArr: number[] = [];

    for (const shardId of [0, 1, 2, 3]) {
      const atomCount = shardCounts[shardId] ?? 0;
      if (atomCount === 0) continue;
      const vDepth = getVisualDepth(atomCount);

      for (let level = 0; level <= vDepth; level++) {
        const nodesAtLevel = 1 << level;
        for (let pos = 0; pos < nodesAtLevel; pos++) {
          const [nx, ny, nz] = treeNodePosition(shardId, level, pos);
          posArr.push(nx, ny, nz);

          const isOccupied = occupiedNodes[shardId]?.has(level * 1000 + pos) ?? false;
          if (isOccupied) {
            colArr.push(0.278 * 1.2, 0.333 * 1.2, 0.412 * 1.2);
          } else {
            colArr.push(0.2 * 1.5, 0.255 * 1.5, 0.333 * 1.5);
          }
        }
      }
    }

    return {
      positions: new Float32Array(posArr),
      colors: new Float32Array(colArr),
    };
  }, [geometry, atoms]);

  const positions = geometry?.placeholderPositions ?? localData?.positions;
  const colors = geometry?.placeholderColors ?? localData?.colors;

  // Push new geometry to the GPU whenever the data changes.
  // setAttribute replaces buffers in-place — no capacity limit, no remount.
  useEffect(() => {
    const geo = geoRef.current;
    if (!geo || !positions || positions.length === 0) return;
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    if (colors && colors.length === positions.length) {
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    geo.computeBoundingSphere();
  }, [positions, colors]);

  if (atoms.length === 0) return null;

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geoRef} />
      <pointsMaterial
        size={POINT_SIZE}
        sizeAttenuation
        vertexColors
        toneMapped={false}
        transparent
        opacity={0.55}
      />
    </points>
  );
}
