"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useMemoryStore } from "@/stores/memory-store";

/**
 * Animated Merkle access-path highlight.
 *
 * When an access path is active, this component:
 *  1. Draws bright edges from the selected leaf up to the root, then to the ring
 *  2. Cascades the "light-up" effect edge by edge (~0.1s per segment)
 *  3. Places a glowing sphere at the selected atom that pulses
 *  4. Fades everything out after ~3s
 *
 * All edges are bloom-visible (toneMapped=false, bright colors > 1.0).
 */

const PATH_COLOR = new THREE.Color("#fbbf24").multiplyScalar(2.5); // bright amber
const RING_SEG_COLOR = new THREE.Color("#22d3ee").multiplyScalar(2.0); // bright cyan for ring segment
const GLOW_SPHERE_COLOR = new THREE.Color("#fbbf24").multiplyScalar(3.0);

/** Time (ms) for the atom to scale up */
const ATOM_SCALE_MS = 300;
/** Delay per edge segment cascade (ms) */
const CASCADE_PER_EDGE_MS = 100;
/** How long the full path stays lit before fading (ms) */
const HOLD_MS = 2000;
/** Fade-out duration (ms) */
const FADE_MS = 1000;

export default function AccessPathHighlight() {
  const accessPath = useMemoryStore((s) => s.accessPath);
  const lineRef = useRef<THREE.LineSegments>(null);
  const sphereRef = useRef<THREE.Mesh>(null);

  // Build edge pairs from positions: [pos0→pos1, pos1→pos2, ...]
  const { edgeBuffer, edgeCount } = useMemo(() => {
    if (!accessPath || accessPath.positions.length < 2) {
      return { edgeBuffer: new Float32Array(0), edgeCount: 0 };
    }
    const positions = accessPath.positions;
    const count = positions.length - 1;
    const buf = new Float32Array(count * 6); // 2 vertices × 3 components per edge
    for (let i = 0; i < count; i++) {
      const [ax, ay, az] = positions[i];
      const [bx, by, bz] = positions[i + 1];
      buf[i * 6 + 0] = ax;
      buf[i * 6 + 1] = ay;
      buf[i * 6 + 2] = az;
      buf[i * 6 + 3] = bx;
      buf[i * 6 + 4] = by;
      buf[i * 6 + 5] = bz;
    }
    return { edgeBuffer: buf, edgeCount: count };
  }, [accessPath]);

  // Per-edge color buffer (animated)
  const colorBuffer = useMemo(() => {
    if (edgeCount === 0) return new Float32Array(0);
    return new Float32Array(edgeCount * 6); // 2 vertices × RGB per edge
  }, [edgeCount]);

  useFrame(() => {
    if (!accessPath || edgeCount === 0) return;

    const elapsed = performance.now() - accessPath.startTime;
    const totalCascade = ATOM_SCALE_MS + edgeCount * CASCADE_PER_EDGE_MS;
    const totalDuration = totalCascade + HOLD_MS + FADE_MS;

    // Fade multiplier: 1.0 during hold, then ramp to 0
    let fade = 1.0;
    if (elapsed > totalCascade + HOLD_MS) {
      fade = 1.0 - Math.min(1.0, (elapsed - totalCascade - HOLD_MS) / FADE_MS);
    }

    // Update edge colors based on cascade timing
    const line = lineRef.current;
    if (line) {
      for (let i = 0; i < edgeCount; i++) {
        const edgeStart = ATOM_SCALE_MS + i * CASCADE_PER_EDGE_MS;
        const t = Math.max(0, Math.min(1, (elapsed - edgeStart) / CASCADE_PER_EDGE_MS));
        const brightness = t * fade;

        // Last edge (root→ring) uses cyan, others use amber
        const isRingEdge = i === edgeCount - 1;
        const color = isRingEdge ? RING_SEG_COLOR : PATH_COLOR;

        // Both vertices of this edge get the same color
        for (let v = 0; v < 2; v++) {
          const offset = i * 6 + v * 3;
          colorBuffer[offset + 0] = color.r * brightness;
          colorBuffer[offset + 1] = color.g * brightness;
          colorBuffer[offset + 2] = color.b * brightness;
        }
      }

      const colorAttr = line.geometry.getAttribute("color") as THREE.BufferAttribute;
      if (colorAttr) {
        (colorAttr.array as Float32Array).set(colorBuffer);
        colorAttr.needsUpdate = true;
      }
    }

    // Glow sphere at the selected atom position
    const sphere = sphereRef.current;
    if (sphere && accessPath.positions.length > 0) {
      const [sx, sy, sz] = accessPath.positions[0];
      sphere.position.set(sx, sy, sz);

      // Scale up over ATOM_SCALE_MS, then gentle pulse
      const scaleT = Math.min(1, elapsed / ATOM_SCALE_MS);
      const eased = 1 - Math.pow(1 - scaleT, 3); // ease-out cubic
      const pulse = 1 + Math.sin(elapsed * 0.008) * 0.15;
      const baseScale = 0.5 * eased * pulse * fade;
      sphere.scale.setScalar(baseScale);

      // Update material opacity
      const mat = sphere.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.7 * fade;

      sphere.visible = elapsed < totalDuration;
    }
  });

  if (!accessPath || edgeCount === 0) return null;

  return (
    <group>
      {/* Animated path edges */}
      <lineSegments ref={lineRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[edgeBuffer, 3]}
            count={edgeBuffer.length / 3}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colorBuffer, 3]}
            count={colorBuffer.length / 3}
            itemSize={3}
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

      {/* Glowing sphere at the accessed atom */}
      <mesh ref={sphereRef}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial
          color={GLOW_SPHERE_COLOR}
          transparent
          opacity={0.7}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
