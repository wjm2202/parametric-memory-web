"use client";

/**
 * HoverLabel — single drei <Text> label above the currently hovered node.
 *
 * Sprint 2.5: Only ONE label at a time (never render 50 Text instances).
 * The Text component loads a font atlas async, so it's wrapped in Suspense
 * by the parent Safe wrapper in KnowledgeScene.
 *
 * Reads hovered atom key from Zustand, resolves the node's live position
 * from simNodes.current (mutated by d3-force-3d), and renders a label
 * slightly above the node.
 *
 * KG-02: Module-level Map for O(1) node lookup instead of O(n) .find() per frame.
 * Rebuilt only when node count changes — zero GC allocation in the steady state.
 */

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useKnowledgeStore, parseLabel, type KGNode } from "@/stores/knowledge-store";
import type { ForceGraphHandle } from "./useForceGraph";

interface HoverLabelProps {
  handle: ForceGraphHandle;
}

const LABEL_OFFSET_Y = 1.2;

/* ─── KG-02: Module-level node lookup Map ───────────────────────────────── */
/**
 * Rebuilt only when simNodes.length changes (cheap integer check each frame).
 * .clear() + re-populate is cheaper than new Map() — no allocation at all
 * in the steady state. Pattern mirrors _atomAnimMap in AtomNodes.tsx (/visualise).
 */
const _nodeByKey = new Map<string, KGNode>();
let _nodeByKeySize = 0;

export default function HoverLabel({ handle }: HoverLabelProps) {
  const { simNodes } = handle;
  const hoveredAtom = useKnowledgeStore((s) => s.hoveredAtom);
  const groupRef = useRef<THREE.Group>(null);

  // Update label position every frame from live sim positions
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    // KG-02: Rebuild index only when node count changes
    const nodes = simNodes.current;
    if (nodes.length !== _nodeByKeySize) {
      _nodeByKey.clear();
      for (const n of nodes) _nodeByKey.set(n.key, n);
      _nodeByKeySize = nodes.length;
    }

    if (!hoveredAtom) {
      group.visible = false;
      return;
    }

    // KG-02: O(1) lookup instead of O(n) .find()
    const node = _nodeByKey.get(hoveredAtom);
    if (!node) {
      group.visible = false;
      return;
    }

    group.visible = true;
    group.position.set(node.x ?? 0, (node.y ?? 0) + LABEL_OFFSET_Y, node.z ?? 0);
  });

  // Don't mount Text at all when nothing is hovered — saves the font atlas load
  if (!hoveredAtom) return null;

  const label = parseLabel(hoveredAtom);

  return (
    <group ref={groupRef}>
      <Text
        fontSize={0.8}
        anchorY="bottom"
        color="#e2e8f0"
        outlineWidth={0.04}
        outlineColor="#030712"
        maxWidth={20}
      >
        {label}
      </Text>
    </group>
  );
}
