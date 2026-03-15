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

const PLACEHOLDER_RADIUS = 0.06;

/**
 * Renders small dim spheres at every node position in each shard's visual tree.
 *
 * KEY OPTIMISATION: Placeholders are STATIC — positions never change between
 * layout updates. Matrices are set ONCE via useEffect (not useFrame), so this
 * component costs zero per-frame work. The previous version updated 1000+
 * instance matrices every frame at 60 fps; this version updates them only
 * when the geometry changes.
 *
 * Prefers pre-computed Float32Arrays from the layout worker (store.geometry).
 * Falls back to local computation if the worker hasn't responded yet.
 */
export default function TreePlaceholders() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemoryStore((s) => s.geometry);
  const atoms = useMemoryStore((s) => s.atoms);

  // Fallback: compute locally if worker geometry isn't available yet
  const localData = useMemo(() => {
    if (geometry) return null; // worker data available, skip local computation

    const shardCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    // Track which BFS tree positions are occupied (level * 1000 + pos)
    const occupiedNodes: Record<number, Set<number>> = {
      0: new Set(),
      1: new Set(),
      2: new Set(),
      3: new Set(),
    };

    for (const a of atoms) {
      shardCounts[a.shard] = (shardCounts[a.shard] ?? 0) + 1;
    }

    // Group by shard, sort, then mark BFS positions as occupied
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
      count: posArr.length / 3,
    };
  }, [geometry, atoms]);

  // Determine which data source to use
  const positions = geometry?.placeholderPositions ?? localData?.positions;
  const colors = geometry?.placeholderColors ?? localData?.colors;
  const count = geometry?.placeholderCount ?? localData?.count ?? 0;

  // Apply matrices ONCE when geometry changes — not every frame
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0 || !positions || !colors) return;

    const tmpObj = new THREE.Object3D();
    const tmpColor = new THREE.Color();

    for (let i = 0; i < count; i++) {
      tmpObj.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      tmpObj.scale.setScalar(PLACEHOLDER_RADIUS);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);

      tmpColor.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
      mesh.setColorAt(i, tmpColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [positions, colors, count]);

  if (count === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial toneMapped={false} transparent opacity={0.6} />
    </instancedMesh>
  );
}
