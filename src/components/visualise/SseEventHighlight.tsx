"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  useMemoryStore,
  shardRingPosition,
  SSE_ANIM_DURATION_MS,
  SSE_ANIM_LINE_START_MS,
  SSE_ANIM_LINE_END_MS,
} from "@/stores/memory-store";
import type { SseAnimationType } from "@/stores/memory-store";

/**
 * S16-7: SSE Event Highlight — draws animated line cascades from the hash ring
 * down to target atoms whenever SSE events arrive.
 *
 * Each active SseAnimation in the store produces a line per target atom:
 *   shard ring point → atom position
 *
 * Line color depends on event type:
 *   add       → green-cyan (#22d3ee × 2.5)
 *   tombstone → pink (#f472b6 × 2.5)
 *   train     → white (#ffffff × 2.5)
 *   access    → amber (#fbbf24 × 2.5)
 *
 * The cascade ramps brightness from 0→1 over the line window, then fades.
 * All geometry uses a pre-allocated Float32Array pool — zero GC per frame.
 */

const COLORS: Record<SseAnimationType, THREE.Color> = {
  add: new THREE.Color("#22d3ee").multiplyScalar(2.5),
  tombstone: new THREE.Color("#f472b6").multiplyScalar(2.5),
  train: new THREE.Color("#ffffff").multiplyScalar(2.5),
  access: new THREE.Color("#fbbf24").multiplyScalar(2.5),
};

/** Max simultaneous line segments we'll draw (avoids unbounded allocation) */
const MAX_LINES = 128;
/** Vertices per line: 2 endpoints × 3 components */
const FLOATS_PER_LINE = 6;

export default function SseEventHighlight() {
  const lineRef = useRef<THREE.LineSegments>(null);

  // Pre-allocated buffers — never reallocated
  const posBuffer = useMemo(() => new Float32Array(MAX_LINES * FLOATS_PER_LINE), []);
  const colorBuffer = useMemo(() => new Float32Array(MAX_LINES * FLOATS_PER_LINE), []);

  useFrame(() => {
    const line = lineRef.current;
    if (!line) return;

    const { sseAnimations, atomMap, cleanExpiredAnimations } = useMemoryStore.getState();

    // Garbage-collect expired animations once per frame
    cleanExpiredAnimations();

    if (sseAnimations.length === 0) {
      line.visible = false;
      return;
    }

    const now = performance.now();
    let lineCount = 0;

    for (const anim of sseAnimations) {
      if (lineCount >= MAX_LINES) break;

      // Add/tombstone handled by MerkleRehashCascade, train by TrainArcLightning
      if (anim.type === "add" || anim.type === "tombstone" || anim.type === "train") continue;

      const elapsed = now - anim.startTime;
      if (elapsed > SSE_ANIM_DURATION_MS) continue;

      // Line cascade brightness: ramp up during line window, fade after
      const lineProgress = Math.max(
        0,
        Math.min(
          1,
          (elapsed - SSE_ANIM_LINE_START_MS) / (SSE_ANIM_LINE_END_MS - SSE_ANIM_LINE_START_MS),
        ),
      );
      // Fade out in the second half of the animation
      const fadeStart = SSE_ANIM_DURATION_MS * 0.5;
      const fade =
        elapsed > fadeStart
          ? 1.0 - Math.min(1.0, (elapsed - fadeStart) / (SSE_ANIM_DURATION_MS - fadeStart))
          : 1.0;
      const brightness = lineProgress * fade;

      if (brightness < 0.01) continue;

      const color = COLORS[anim.type];
      const ringPos = shardRingPosition(anim.shardId);

      for (const atomKey of anim.atomKeys) {
        if (lineCount >= MAX_LINES) break;

        const atom = atomMap.get(atomKey);
        if (!atom) continue;

        const [ax, ay, az] = atom.position;
        // Skip atoms that haven't been positioned yet
        if (ax === 0 && ay === 0 && az === 0) continue;

        const offset = lineCount * FLOATS_PER_LINE;

        // Ring endpoint
        posBuffer[offset + 0] = ringPos[0];
        posBuffer[offset + 1] = ringPos[1];
        posBuffer[offset + 2] = ringPos[2];
        // Atom endpoint
        posBuffer[offset + 3] = ax;
        posBuffer[offset + 4] = ay;
        posBuffer[offset + 5] = az;

        // Color for both vertices
        for (let v = 0; v < 2; v++) {
          const co = offset + v * 3;
          colorBuffer[co + 0] = color.r * brightness;
          colorBuffer[co + 1] = color.g * brightness;
          colorBuffer[co + 2] = color.b * brightness;
        }

        lineCount++;
      }
    }

    // Update geometry
    const posAttr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = line.geometry.getAttribute("color") as THREE.BufferAttribute;

    if (posAttr && colAttr) {
      (posAttr.array as Float32Array).set(posBuffer);
      posAttr.needsUpdate = true;
      (colAttr.array as Float32Array).set(colorBuffer);
      colAttr.needsUpdate = true;
    }

    line.geometry.setDrawRange(0, lineCount * 2); // 2 vertices per line
    line.visible = lineCount > 0;
  });

  return (
    <lineSegments ref={lineRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[posBuffer, 3]}
          count={MAX_LINES * 2}
          itemSize={3}
          usage={THREE.DynamicDrawUsage}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colorBuffer, 3]}
          count={MAX_LINES * 2}
          itemSize={3}
          usage={THREE.DynamicDrawUsage}
        />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        toneMapped={false}
        linewidth={1}
        depthWrite={false}
      />
    </lineSegments>
  );
}
