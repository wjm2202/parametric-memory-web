"use client";

import { Text } from "@react-three/drei";
import { useMemoryStore, RING_Y, getVisualDepth, treeNodePosition } from "@/stores/memory-store";

/**
 * Floating text labels for each shard and the hash ring.
 * Labels sit below each shard's leaf row (bottom of the inverted tree).
 * Ring label sits above the ring center.
 */
export default function ShardLabels() {
  const atoms = useMemoryStore((s) => s.atoms);
  const treeHead = useMemoryStore((s) => s.treeHead);

  // Count atoms per shard
  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const a of atoms) {
    counts[a.shard] = (counts[a.shard] ?? 0) + 1;
  }

  return (
    <group>
      {[0, 1, 2, 3].map((shard) => {
        const atomCount = counts[shard] ?? 0;
        // Label sits below the deepest level's center node of this shard
        const vDepth = getVisualDepth(Math.max(atomCount, 1));
        // Use the middle position at the deepest level as the label anchor
        const midPos = Math.floor((1 << vDepth) / 2);
        const [cx, cy, cz] = treeNodePosition(shard, vDepth, midPos);
        return (
          <Text
            key={shard}
            position={[cx, cy - 1.2, cz]}
            fontSize={0.45}
            color="#475569"
            anchorX="center"
            anchorY="top"
            letterSpacing={0.08}
          >
            {`SHARD ${shard}  ·  ${atomCount} atoms`}
          </Text>
        );
      })}

      {/* Hash ring label at center */}
      {treeHead && (
        <Text
          position={[0, RING_Y + 1.2, 0]}
          fontSize={0.35}
          color="#f59e0b"
          anchorX="center"
          anchorY="bottom"
          letterSpacing={0.1}
        >
          {`HASH RING  ·  v${treeHead.version}  ·  ${treeHead.root.slice(0, 12)}…`}
        </Text>
      )}
    </group>
  );
}
