"use client";

import { useRef, useEffect, useMemo } from "react";
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
 *
 * BUG FIX: R3F v9 treats `args` as constructor-only — changing `args` on a
 * mounted <bufferAttribute> does NOT update the underlying THREE.BufferAttribute.
 * Solution: use refs + useEffect to imperatively call setAttribute() whenever
 * the edge data changes, exactly like TreePlaceholders does for its InstancedMesh.
 * Also adds frustumCulled={false} so new depth-level edges are never clipped by
 * a stale bounding sphere.
 */

const EDGE_COLOR = new THREE.Color("#38bdf8").multiplyScalar(1.2); // bright sky-blue, bloom-visible
const RING_EDGE_COLOR = new THREE.Color("#22d3ee").multiplyScalar(1.5); // bright cyan

export default function MerkleEdges() {
  const atoms = useMemoryStore((s) => s.atoms);
  const geometry = useMemoryStore((s) => s.geometry);

  const treeGeoRef = useRef<THREE.BufferGeometry>(null);
  const ringGeoRef = useRef<THREE.BufferGeometry>(null);

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

  // Imperatively push new edge data into the BufferGeometry whenever it changes.
  // This is necessary because R3F v9 does not re-apply `args` on mounted elements —
  // only initial construction gets the buffer. Without this, new depth-level edges
  // computed by the layout worker are silently dropped.
  useEffect(() => {
    const geo = treeGeoRef.current;
    if (!geo || !treeEdges || treeEdges.length === 0) return;
    geo.setAttribute("position", new THREE.BufferAttribute(treeEdges, 3));
    geo.computeBoundingSphere();
  }, [treeEdges]);

  useEffect(() => {
    const geo = ringGeoRef.current;
    if (!geo || !ringEdges || ringEdges.length === 0) return;
    geo.setAttribute("position", new THREE.BufferAttribute(ringEdges, 3));
    geo.computeBoundingSphere();
  }, [ringEdges]);

  if (atoms.length === 0) return null;

  return (
    <group>
      {treeEdges && treeEdges.length > 0 && (
        <lineSegments frustumCulled={false}>
          <bufferGeometry ref={treeGeoRef} />
          <lineBasicMaterial
            color={EDGE_COLOR}
            transparent
            opacity={0.6}
            toneMapped={false}
            linewidth={1}
          />
        </lineSegments>
      )}

      {ringEdges && ringEdges.length > 0 && (
        <lineSegments frustumCulled={false}>
          <bufferGeometry ref={ringGeoRef} />
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
