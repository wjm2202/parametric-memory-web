"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useMemoryStore, SSE_ANIM_DURATION_MS } from "@/stores/memory-store";

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
const PULSE_START_MS = 0;
const PULSE_END_MS = 400;
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

/** Module-level reusable control point — eliminates tuple allocation per arc per frame */
const _ctrlPoint: [number, number, number] = [0, 0, 0];

/** Module-level reusable positions array — eliminates map() allocation per train anim per frame */
const _positions: ([number, number, number] | null)[] = new Array(32).fill(null);

/* ─── Signal particles ─── */
const MAX_SIGNALS = 16;
const SIGNAL_RADIUS = 0.1;

/* ─── Phase 1 halos: instanced spheres that bloom around each atom in sequence ─── */
const MAX_HALOS = 16;
const HALO_RADIUS = 0.35; // larger than atom radius (0.18) to create a glow halo
const HALO_COLOR = new THREE.Color("#c7d2fe").multiplyScalar(3.5); // bright indigo-white

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

  // Direction A→B (only XZ needed for perpendicular to up vector)
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];

  // Cross with up vector to get horizontal perpendicular
  // cross([dx,dy,dz], [0,1,0]) = [-dz, 0, dx]; we use [dz, 0, -dx] for consistent handedness
  const px = dz;
  const pz = -dx;
  const pLen = Math.sqrt(px * px + pz * pz) || 1;

  // Lift control point upward and perpendicular — writes to module-level reusable tuple
  _ctrlPoint[0] = mx + (px / pLen) * ARC_LIFT * 0.5;
  _ctrlPoint[1] = my + ARC_LIFT; // always lift upward
  _ctrlPoint[2] = mz + (pz / pLen) * ARC_LIFT * 0.5;
  return _ctrlPoint;
}

export default function TrainParticles() {
  const lineRef = useRef<THREE.LineSegments>(null);
  const signalRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);

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
    const halos = haloRef.current;

    let lineCount = 0;
    let sigIdx = 0;
    let haloIdx = 0;

    for (const anim of sseAnimations) {
      if (anim.type !== "train") continue;
      if (lineCount >= MAX_ARC_LINES) break;

      const elapsed = now - anim.startTime;
      if (elapsed < 0 || elapsed > FLASH_END) continue;

      const atomKeys = anim.atomKeys;
      if (atomKeys.length < 2) continue;

      // Resolve atom positions into module-level reusable array — zero allocation
      const posCount = Math.min(atomKeys.length, _positions.length);
      for (let pi = 0; pi < posCount; pi++) {
        const atom = atomMap.get(atomKeys[pi]);
        if (!atom) {
          _positions[pi] = null;
          continue;
        }
        const [x, y, z] = atom.position;
        _positions[pi] = x === 0 && y === 0 && z === 0 ? null : atom.position;
      }
      // Alias for readability (same reference, no allocation)
      const positions = _positions;

      // ─── Phase 1: SEQUENTIAL PULSE — atoms glow A, then B, then C ───
      if (halos && elapsed >= PULSE_START_MS && elapsed < PULSE_END_MS) {
        const pulseDuration = PULSE_END_MS - PULSE_START_MS;
        const perAtomWindow = pulseDuration / posCount;

        for (let i = 0; i < posCount; i++) {
          if (haloIdx >= MAX_HALOS) break;
          const pos = positions[i];
          if (!pos) continue;

          // Each atom's pulse starts at its offset in the sequence
          const atomPulseStart = i * perAtomWindow;
          const atomPulseElapsed = elapsed - atomPulseStart;

          if (atomPulseElapsed < 0) continue; // not yet
          // Progress within this atom's pulse window (0→1)
          const t = Math.min(1, atomPulseElapsed / perAtomWindow);
          // Ease: quick ramp up, slow fade — like a camera flash
          const intensity = t < 0.3 ? t / 0.3 : 1.0 - (t - 0.3) / 0.7;
          const scale = HALO_RADIUS * (0.5 + intensity * 1.0);

          tmpObj.position.set(pos[0], pos[1], pos[2]);
          tmpObj.scale.setScalar(scale);
          tmpObj.updateMatrix();
          halos.setMatrixAt(haloIdx, tmpObj.matrix);
          tmpColor.copy(HALO_COLOR).multiplyScalar(intensity);
          halos.setColorAt(haloIdx, tmpColor);
          haloIdx++;
        }
      }

      // Draw arcs between consecutive atoms in the sequence
      for (let i = 0; i < posCount - 1; i++) {
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

    // Update line geometry — only flag GPU upload when there's something to draw
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

    // Hide unused halo instances
    if (halos) {
      for (let i = haloIdx; i < MAX_HALOS; i++) {
        tmpObj.position.set(0, 0, 0);
        tmpObj.scale.setScalar(0);
        tmpObj.updateMatrix();
        halos.setMatrixAt(i, tmpObj.matrix);
      }
      halos.instanceMatrix.needsUpdate = true;
      if (halos.instanceColor) {
        halos.instanceColor.needsUpdate = true;
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
      <instancedMesh
        ref={signalRef}
        args={[undefined, undefined, MAX_SIGNALS]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.9} />
      </instancedMesh>

      {/* Phase 1 sequential pulse halos */}
      <instancedMesh ref={haloRef} args={[undefined, undefined, MAX_HALOS]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.5} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
