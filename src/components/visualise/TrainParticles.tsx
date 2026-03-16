"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  useMemoryStore,
  SSE_ANIM_DURATION_MS,
} from "@/stores/memory-store";

/**
 * Arc Lightning — Markov training sequence visualisation.
 *
 * When atoms are trained (sequence reinforcement), this draws curved
 * bezier arcs between atoms in the sequence to show the Markov transitions.
 *
 * Three phases:
 *   Phase 1 (0–400ms):    Sequential PULSE — atoms in the sequence glow in order
 *   Phase 2 (400–800ms):  ARC DRAW — curved bezier arcs draw A→B, B→C
 *                          (electric blue/violet, representing learned transitions)
 *   Phase 3 (800–1200ms): FLASH & FADE — arcs pulse bright then fade to lingering glow
 *
 * The arcs are quadratic bezier curves with a control point offset perpendicular
 * to the straight line, creating a graceful curve that suggests signal flow.
 *
 * Architecture:
 *   - Pre-allocated line buffer for arc segments (tessellated bezier curves)
 *   - Instanced particles for the traveling "signal" along each arc
 *   - Zero GC per frame
 */

/* ─── Timing ─── */
const PULSE_START = 0;
const PULSE_END = 400;
const ARC_DRAW_START = 400;
const ARC_DRAW_END = 800;
const FLASH_START = 800;
const FLASH_END = SSE_ANIM_DURATION_MS;

/* ─── Arc tessellation ─── */
const ARC_SEGMENTS = 16; // segments per bezier arc
const ARC_LIFT = 3.0; // perpendicular offset for the bezier control point
const MAX_ARCS = 32; // max simultaneous arcs
const MAX_ARC_LINES = MAX_ARCS * ARC_SEGMENTS;
const FLOATS_PER_LINE = 6;

/* ─── Colors ─── */
const ARC_COLOR = new THREE.Color("#818cf8").multiplyScalar(2.5); // indigo/violet
const ARC_BRIGHT = new THREE.Color("#c7d2fe").multiplyScalar(4.0); // bright flash
const ARC_TRAIL = new THREE.Color("#6366f1").multiplyScalar(1.5); // dim trail
const SIGNAL_COLOR = new THREE.Color("#e0e7ff").multiplyScalar(5.0); // bright white-indigo

/* ─── Signal particles ─── */
const MAX_SIGNALS = 16;
const SIGNAL_RADIUS = 0.1;

/**
 * Compute a quadratic bezier point at t ∈ [0,1].
 * P(t) = (1-t)²·A + 2(1-t)t·C + t²·B
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

/**
 * Compute a bezier control point perpendicular to the line A→B,
 * lifted upward to create a visually pleasing arc.
 */
function computeControlPoint(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const mz = (a[2] + b[2]) / 2;

  // Direction A→B
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];

  // Cross with up vector to get perpendicular
  // up = [0, 1, 0], cross(dir, up) = [dz, 0, -dx]
  const px = dz;
  const pz = -dx;
  const pLen = Math.sqrt(px * px + pz * pz) || 1;

  // Lift control point upward and perpendicular
  return [
    mx + (px / pLen) * ARC_LIFT * 0.5,
    my + ARC_LIFT, // always lift upward
    mz + (pz / pLen) * ARC_LIFT * 0.5,
  ];
}

export default function TrainParticles() {
  const lineRef = useRef<THREE.LineSegments>(null);
  const signalRef = useRef<THREE.InstancedMesh>(null);

  const tmpObj = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const tmpA = useMemo((): [number, number, number] => [0, 0, 0], []);
  const tmpB = useMemo((): [number, number, number] => [0, 0, 0], []);

  // Pre-allocated buffers
  const posBuffer = useMemo(() => new Float32Array(MAX_ARC_LINES * FLOATS_PER_LINE), []);
  const colorBuffer = useMemo(() => new Float32Array(MAX_ARC_LINES * FLOATS_PER_LINE), []);

  useFrame(() => {
    const line = lineRef.current;
    const signals = signalRef.current;
    if (!line) return;

    const { sseAnimations, atomMap } = useMemoryStore.getState();
    const now = performance.now();

    let lineCount = 0;
    let sigIdx = 0;

    for (const anim of sseAnimations) {
      if (anim.type !== "train") continue;
      if (lineCount >= MAX_ARC_LINES) break;

      const elapsed = now - anim.startTime;
      if (elapsed < 0 || elapsed > FLASH_END) continue;

      const atomKeys = anim.atomKeys;
      if (atomKeys.length < 2) continue;

      // Resolve atom positions
      const positions: ([number, number, number] | null)[] = atomKeys.map((key) => {
        const atom = atomMap.get(key);
        if (!atom) return null;
        const [x, y, z] = atom.position;
        if (x === 0 && y === 0 && z === 0) return null;
        return atom.position;
      });

      // Draw arcs between consecutive atoms in the sequence
      for (let i = 0; i < atomKeys.length - 1; i++) {
        if (lineCount >= MAX_ARC_LINES) break;

        const posA = positions[i];
        const posB = positions[i + 1];
        if (!posA || !posB) continue;

        const ctrl = computeControlPoint(posA, posB);

        // Per-arc stagger: each arc in the sequence starts slightly later
        const arcStagger = i * 100;
        const arcElapsed = elapsed - arcStagger;

        // ─── Phase 2: ARC DRAW ───
        if (arcElapsed >= ARC_DRAW_START && arcElapsed < ARC_DRAW_END) {
          const drawProgress = (arcElapsed - ARC_DRAW_START) / (ARC_DRAW_END - ARC_DRAW_START);
          const segsToDraw = Math.ceil(drawProgress * ARC_SEGMENTS);

          for (let s = 0; s < segsToDraw && s < ARC_SEGMENTS; s++) {
            if (lineCount >= MAX_ARC_LINES) break;

            const t0 = s / ARC_SEGMENTS;
            const t1 = (s + 1) / ARC_SEGMENTS;
            quadBezier(posA, ctrl, posB, t0, tmpA);
            quadBezier(posA, ctrl, posB, t1, tmpB);

            const offset = lineCount * FLOATS_PER_LINE;
            posBuffer[offset + 0] = tmpA[0];
            posBuffer[offset + 1] = tmpA[1];
            posBuffer[offset + 2] = tmpA[2];
            posBuffer[offset + 3] = tmpB[0];
            posBuffer[offset + 4] = tmpB[1];
            posBuffer[offset + 5] = tmpB[2];

            // Leading segments are brighter
            const isLeading = s >= segsToDraw - 2;
            const brightness = isLeading ? 1.0 : 0.5 + (s / ARC_SEGMENTS) * 0.3;
            const color = isLeading ? ARC_BRIGHT : ARC_COLOR;
            for (let v = 0; v < 2; v++) {
              const co = offset + v * 3;
              colorBuffer[co + 0] = color.r * brightness;
              colorBuffer[co + 1] = color.g * brightness;
              colorBuffer[co + 2] = color.b * brightness;
            }
            lineCount++;
          }

          // Signal particle traveling along the arc
          if (signals && sigIdx < MAX_SIGNALS) {
            quadBezier(posA, ctrl, posB, drawProgress, tmpA);
            tmpObj.position.set(tmpA[0], tmpA[1], tmpA[2]);
            tmpObj.scale.setScalar(SIGNAL_RADIUS * (1 + Math.sin(arcElapsed * 0.03) * 0.3));
            tmpObj.updateMatrix();
            signals.setMatrixAt(sigIdx, tmpObj.matrix);
            tmpColor.copy(SIGNAL_COLOR);
            signals.setColorAt(sigIdx, tmpColor);
            sigIdx++;
          }
        }

        // ─── Phase 3: FLASH & FADE ───
        if (arcElapsed >= FLASH_START && arcElapsed < FLASH_END) {
          const fadeProgress = (arcElapsed - FLASH_START) / (FLASH_END - FLASH_START);
          // Flash bright at start, then ease out
          const flashT = fadeProgress < 0.2 ? 1.0 : 1.0 - (fadeProgress - 0.2) / 0.8;
          const brightness = flashT;

          for (let s = 0; s < ARC_SEGMENTS; s++) {
            if (lineCount >= MAX_ARC_LINES) break;

            const t0 = s / ARC_SEGMENTS;
            const t1 = (s + 1) / ARC_SEGMENTS;
            quadBezier(posA, ctrl, posB, t0, tmpA);
            quadBezier(posA, ctrl, posB, t1, tmpB);

            const offset = lineCount * FLOATS_PER_LINE;
            posBuffer[offset + 0] = tmpA[0];
            posBuffer[offset + 1] = tmpA[1];
            posBuffer[offset + 2] = tmpA[2];
            posBuffer[offset + 3] = tmpB[0];
            posBuffer[offset + 4] = tmpB[1];
            posBuffer[offset + 5] = tmpB[2];

            // Flash uses bright color, then fades to trail color
            const color = fadeProgress < 0.2 ? ARC_BRIGHT : ARC_TRAIL;
            for (let v = 0; v < 2; v++) {
              const co = offset + v * 3;
              colorBuffer[co + 0] = color.r * brightness;
              colorBuffer[co + 1] = color.g * brightness;
              colorBuffer[co + 2] = color.b * brightness;
            }
            lineCount++;
          }
        }
      }
    }

    // Update line geometry
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

    // Hide unused signal particles
    if (signals) {
      for (let i = sigIdx; i < MAX_SIGNALS; i++) {
        tmpObj.position.set(0, 0, 0);
        tmpObj.scale.setScalar(0);
        tmpObj.updateMatrix();
        signals.setMatrixAt(i, tmpObj.matrix);
      }
      signals.instanceMatrix.needsUpdate = true;
      if (signals.instanceColor) {
        signals.instanceColor.needsUpdate = true;
      }
    }
  });

  return (
    <group>
      {/* Arc lightning line segments */}
      <lineSegments ref={lineRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[posBuffer, 3]}
            count={MAX_ARC_LINES * 2}
            itemSize={3}
            usage={THREE.DynamicDrawUsage}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colorBuffer, 3]}
            count={MAX_ARC_LINES * 2}
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

      {/* Traveling signal particles */}
      <instancedMesh ref={signalRef} args={[undefined, undefined, MAX_SIGNALS]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.9} />
      </instancedMesh>
    </group>
  );
}
