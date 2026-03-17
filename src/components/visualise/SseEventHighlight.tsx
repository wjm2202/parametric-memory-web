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

/**
 * SSE Event Highlight — currently a no-op.
 *
 * All animation types are now handled by dedicated components:
 *   - Add/tombstone/access: MerkleRehashCascade (edge-following descent)
 *   - Train: TrainParticles (bezier arc lightning)
 *
 * Kept for structural compatibility — cleanExpiredAnimations() GC runs here.
 */

const ACCESS_LINE_COLOR = new THREE.Color("#fbbf24").multiplyScalar(2.5); // amber (unused)

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

      // Add/tombstone/access handled by MerkleRehashCascade, train by TrainArcLightning
      if (
        anim.type === "add" ||
        anim.type === "tombstone" ||
        anim.type === "train" ||
        anim.type === "access"
      )
        continue;

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

      const color = ACCESS_LINE_COLOR;
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

    // Update geometry — only flag GPU upload when there's something to draw
    const hasContent = lineCount > 0;
    if (hasContent || line.visible) {
      const posAttr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      const colAttr = line.geometry.getAttribute("color") as THREE.BufferAttribute;
      if (posAttr && colAttr) {
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      }
      line.geometry.setDrawRange(0, lineCount * 2);
      line.visible = hasContent;
    }
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
