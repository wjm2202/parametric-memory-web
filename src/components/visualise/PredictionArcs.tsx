"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useMemoryStore } from "@/stores/memory-store";

/**
 * Prediction Arcs — shows Markov transition predictions from the selected atom.
 *
 * When an atom is selected and its weights are loaded, draws faint dashed arcs
 * from the selected atom to its top 2-3 predicted next atoms. Arc brightness
 * correlates with transition weight (probability).
 *
 * Gives customers an intuitive view of how the Markov chain has learned
 * sequence patterns and what the memory system predicts will be accessed next.
 *
 * Architecture:
 *   - Only renders when an atom is selected AND weights are loaded
 *   - Up to MAX_PREDICTIONS arcs, each with ARC_SEGMENTS line segments
 *   - Dashed effect via alternating segment visibility
 *   - Gentle pulsing animation for visual life
 */

const MAX_PREDICTIONS = 3;
const ARC_SEGMENTS = 16;
const MAX_LINES = MAX_PREDICTIONS * ARC_SEGMENTS;
const FLOATS_PER_LINE = 6;
const ARC_LIFT = 2.5;

/* ─── Colors ─── */
const PRIMARY_ARC_COLOR = new THREE.Color("#34d399").multiplyScalar(2.0); // emerald for dominant
const SECONDARY_ARC_COLOR = new THREE.Color("#6ee7b7").multiplyScalar(1.2); // lighter emerald
const DIM_ARC_COLOR = new THREE.Color("#a7f3d0").multiplyScalar(0.6); // very faint

/**
 * Quadratic bezier at t.
 */
function quadBezier(
  a: [number, number, number],
  ctrl: [number, number, number],
  b: [number, number, number],
  t: number,
  out: [number, number, number],
): void {
  const u = 1 - t;
  out[0] = u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0];
  out[1] = u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1];
  out[2] = u * u * a[2] + 2 * u * t * ctrl[2] + t * t * b[2];
}

function computeControlPoint(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const mz = (a[2] + b[2]) / 2;
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const px = dz;
  const pz = -dx;
  const pLen = Math.sqrt(px * px + pz * pz) || 1;
  return [
    mx + (px / pLen) * ARC_LIFT * 0.3,
    my + ARC_LIFT,
    mz + (pz / pLen) * ARC_LIFT * 0.3,
  ];
}

export default function PredictionArcs() {
  const lineRef = useRef<THREE.LineSegments>(null);
  const selectedAtom = useMemoryStore((s) => s.selectedAtom);
  const weights = useMemoryStore((s) => s.weights);
  const tmpA = useMemo((): [number, number, number] => [0, 0, 0], []);
  const tmpB = useMemo((): [number, number, number] => [0, 0, 0], []);

  const posBuffer = useMemo(() => new Float32Array(MAX_LINES * FLOATS_PER_LINE), []);
  const colorBuffer = useMemo(() => new Float32Array(MAX_LINES * FLOATS_PER_LINE), []);

  useFrame(() => {
    const line = lineRef.current;
    if (!line) return;

    let lineCount = 0;

    if (selectedAtom) {
      const { atomMap } = useMemoryStore.getState();
      const sourceAtom = atomMap.get(selectedAtom);
      const atomWeights = weights.get(selectedAtom);

      if (sourceAtom && atomWeights && atomWeights.transitions.length > 0) {
        const now = performance.now();
        const pulse = 0.6 + Math.sin(now * 0.003) * 0.2; // gentle pulse

        // Sort by effectiveWeight descending, take top N
        const topTransitions = [...atomWeights.transitions]
          .sort((a, b) => b.effectiveWeight - a.effectiveWeight)
          .slice(0, MAX_PREDICTIONS);

        const maxWeight = topTransitions[0]?.effectiveWeight ?? 1;

        for (let ti = 0; ti < topTransitions.length; ti++) {
          const transition = topTransitions[ti];
          const targetAtom = atomMap.get(transition.to);
          if (!targetAtom) continue;
          const [tx, ty, tz] = targetAtom.position;
          if (tx === 0 && ty === 0 && tz === 0) continue;

          const relWeight = transition.effectiveWeight / maxWeight;
          const ctrl = computeControlPoint(sourceAtom.position, targetAtom.position);

          // Select color based on rank
          const arcColor = ti === 0 ? PRIMARY_ARC_COLOR : ti === 1 ? SECONDARY_ARC_COLOR : DIM_ARC_COLOR;

          // Dash pattern: every other pair of segments is dimmed
          const dashPhase = Math.floor(now * 0.004) % ARC_SEGMENTS; // animated dash crawl

          for (let s = 0; s < ARC_SEGMENTS; s++) {
            if (lineCount >= MAX_LINES) break;

            const t0 = s / ARC_SEGMENTS;
            const t1 = (s + 1) / ARC_SEGMENTS;
            quadBezier(sourceAtom.position, ctrl, targetAtom.position, t0, tmpA);
            quadBezier(sourceAtom.position, ctrl, targetAtom.position, t1, tmpB);

            const offset = lineCount * FLOATS_PER_LINE;
            posBuffer[offset + 0] = tmpA[0];
            posBuffer[offset + 1] = tmpA[1];
            posBuffer[offset + 2] = tmpA[2];
            posBuffer[offset + 3] = tmpB[0];
            posBuffer[offset + 4] = tmpB[1];
            posBuffer[offset + 5] = tmpB[2];

            // Animated dash: segments alternate bright/dim, pattern shifts over time
            const isDash = ((s + dashPhase) % 4) < 2;
            const brightness = isDash ? relWeight * pulse : relWeight * 0.15;

            for (let v = 0; v < 2; v++) {
              const co = offset + v * 3;
              colorBuffer[co + 0] = arcColor.r * brightness;
              colorBuffer[co + 1] = arcColor.g * brightness;
              colorBuffer[co + 2] = arcColor.b * brightness;
            }
            lineCount++;
          }
        }
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
    line.geometry.setDrawRange(0, lineCount * 2);
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
