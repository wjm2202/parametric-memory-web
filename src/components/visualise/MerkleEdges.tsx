"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useMemoryStore } from "@/stores/memory-store";
import { getVisualDepth, treeNodePosition, shardRingPosition } from "@/stores/memory-store";

/**
 * Renders the full binary-tree skeleton for each shard as line segments.
 *
 * Prefers pre-computed Float32Arrays from the layout worker (store.geometry).
 * Falls back to local useMemo computation if the worker hasn't responded yet.
 *
 * Either way, this component does NO per-frame work — geometry is static
 * and only recomputed when the atom set changes.
 */

const EDGE_COLOR = new THREE.Color("#38bdf8").multiplyScalar(1.2); // bright sky-blue, bloom-visible
const RING_EDGE_COLOR = new THREE.Color("#22d3ee").multiplyScalar(1.5); // bright cyan

export default function MerkleEdges() {
  const atoms = useMemoryStore((s) => s.atoms);
  const geometry = useMemoryStore((s) => s.geometry);

  // Fallback: compute locally if worker geometry isn't available
  const localEdges = useMemo(() => {
    if (geometry) return null; // worker data available, skip

    const edges: number[] = [];
    const rEdges: number[] = [];

    const shardCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const a of atoms) {
      shardCounts[a.shard] = (shardCounts[a.shard] ?? 0) + 1;
    }

    for (const shardId of [0, 1, 2, 3]) {
      const atomCount = shardCounts[shardId] ?? 0;
      if (atomCount === 0) continue;

      const vDepth = getVisualDepth(atomCount);

      for (let level = 0; level < vDepth; level++) {
        const nodesAtLevel = 1 << level;
        for (let pos = 0; pos < nodesAtLevel; pos++) {
          const [px, py, pz] = treeNodePosition(shardId, level, pos);
          const [lx, ly, lz] = treeNodePosition(shardId, level + 1, pos * 2);
          edges.push(px, py, pz, lx, ly, lz);
          const [rx, ry, rz] = treeNodePosition(shardId, level + 1, pos * 2 + 1);
          edges.push(px, py, pz, rx, ry, rz);
        }
      }

      const [rootX, rootY, rootZ] = treeNodePosition(shardId, 0, 0);
      const ringPos = shardRingPosition(shardId);
      rEdges.push(rootX, rootY, rootZ, ringPos[0], ringPos[1], ringPos[2]);
    }

    return {
      treeEdges: new Float32Array(edges),
      ringEdges: new Float32Array(rEdges),
    };
  }, [geometry, atoms]);

  const treeEdges = geometry?.treeEdges ?? localEdges?.treeEdges;
  const ringEdges = geometry?.ringEdges ?? localEdges?.ringEdges;

  if (!treeEdges || !ringEdges || atoms.length === 0) return null;

  return (
    <group>
      {treeEdges.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[treeEdges, 3]}
              count={treeEdges.length / 3}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={EDGE_COLOR}
            transparent
            opacity={0.6}
            toneMapped={false}
            linewidth={1}
          />
        </lineSegments>
      )}

      {ringEdges.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[ringEdges, 3]}
              count={ringEdges.length / 3}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={RING_EDGE_COLOR}
            transparent
            opacity={0.7}
            toneMapped={false}
            linewidth={1}
          />
        </lineSegments>
      )}
    </group>
  );
}
