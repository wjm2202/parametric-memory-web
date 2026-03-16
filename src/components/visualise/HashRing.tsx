"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  useMemoryStore,
  RING_RADIUS,
  RING_Y,
  SHARD_ANGLES,
  SSE_ANIM_DURATION_MS,
  SSE_ANIM_RING_MS,
} from "@/stores/memory-store";
/**
 * The Hash Ring — a flat rotating ring in the XZ plane at RING_Y.
 *
 * Represents the consistent-hashing ring buffer that cryptographically
 * connects the 4 shard Merkle trees. Each shard root sits at its
 * assigned position on this ring.
 *
 * Visual elements:
 *   - Thin torus ring rotating slowly
 *   - Hash bucket markers evenly spaced around the ring
 *   - Brighter markers at shard positions
 *   - Glows bright when an access-path animation reaches the ring
 */

const RING_COLOR = new THREE.Color("#0ea5e9").multiplyScalar(1.5); // bright sky blue
/** Pre-computed scaled glow color — avoids Color.clone().multiplyScalar() per frame */
const RING_GLOW_SCALED = new THREE.Color("#22d3ee").multiplyScalar(3.0);
const BUCKET_COLOR = new THREE.Color("#334155"); // dim hash buckets
const SHARD_MARKER_COLOR = new THREE.Color("#22d3ee").multiplyScalar(2.0); // bright cyan
const CENTER_ROOT_COLOR = new THREE.Color("#f59e0b").multiplyScalar(2); // amber root marker
/** Pre-computed scaled shard glow — avoids Color.clone().multiplyScalar() per frame */
const SHARD_GLOW_SCALED = new THREE.Color("#fbbf24").multiplyScalar(3.0);

/** Module-level reusable per-shard SSE glow state — avoids array allocation every frame */
const _shardSseIntensity = new Float32Array(4);
const _shardSseColorIdx = new Int8Array(4); // index into SSE_GLOW_COLORS_ARRAY
const SSE_GLOW_COLORS_ARRAY: THREE.Color[] = [
  new THREE.Color("#22d3ee").multiplyScalar(3.0), // add
  new THREE.Color("#f472b6").multiplyScalar(3.0), // tombstone
  new THREE.Color("#ffffff").multiplyScalar(2.5), // train
  new THREE.Color("#fbbf24").multiplyScalar(3.0), // amber/access
];
const SSE_TYPE_TO_IDX: Record<string, number> = { add: 0, tombstone: 1, train: 2, access: 3 };

/** S16-7: Per-type ring glow colors — see SSE_GLOW_COLORS_ARRAY above */
const RING_SEGMENTS = 256; // smooth circle
const HASH_BUCKETS = 64; // visual markers around the ring
const RING_TUBE_RADIUS = 0.18; // thicker ring for compact layout

/** Timing constants — kept in sync with AccessPathHighlight */
const ATOM_SCALE_MS = 300;
const CASCADE_PER_EDGE_MS = 100;
const HOLD_MS = 2000;
const FADE_MS = 1000;

export default function HashRing() {
  const ringGroupRef = useRef<THREE.Group>(null);
  const torusRef = useRef<THREE.Mesh>(null);
  const mainLineRef = useRef<THREE.LineLoop>(null);
  const innerLineRef = useRef<THREE.LineLoop>(null);
  const shardMarkerRefs = useRef<(THREE.Mesh | null)[]>([null, null, null, null]);
  const treeHead = useMemoryStore((s) => s.treeHead);
  const accessPath = useMemoryStore((s) => s.accessPath);

  // Scratch color to avoid per-frame allocation
  const _scratchColor = useMemo(() => new THREE.Color(), []);

  // Animate rotation + glow
  useFrame((_, delta) => {
    if (ringGroupRef.current) {
      ringGroupRef.current.rotation.y += delta * 0.08;
    }

    // Compute ring glow intensity from access path timing
    let glowIntensity = 0;
    let activeShardId = -1;

    if (accessPath) {
      const elapsed = performance.now() - accessPath.startTime;
      const edgeCount = accessPath.positions.length - 1;
      // The ring edge is the LAST edge in the cascade
      const ringEdgeStart = ATOM_SCALE_MS + (edgeCount - 1) * CASCADE_PER_EDGE_MS;
      const totalCascade = ATOM_SCALE_MS + edgeCount * CASCADE_PER_EDGE_MS;

      // Glow ramps up when the cascade reaches the ring
      if (elapsed >= ringEdgeStart) {
        const rampUp = Math.min(1, (elapsed - ringEdgeStart) / CASCADE_PER_EDGE_MS);
        let fade = 1.0;
        if (elapsed > totalCascade + HOLD_MS) {
          fade = 1.0 - Math.min(1.0, (elapsed - totalCascade - HOLD_MS) / FADE_MS);
        }
        glowIntensity = rampUp * fade;
        activeShardId = accessPath.shardId;
      }
    }

    // S16-7: Compute per-shard SSE glow — strongest active animation per shard wins
    // Uses module-level arrays — zero allocation per frame
    const sseAnimations = useMemoryStore.getState().sseAnimations;
    const now = performance.now();
    _shardSseIntensity[0] =
      _shardSseIntensity[1] =
      _shardSseIntensity[2] =
      _shardSseIntensity[3] =
        0;
    _shardSseColorIdx[0] = _shardSseColorIdx[1] = _shardSseColorIdx[2] = _shardSseColorIdx[3] = -1;
    let maxSseRingGlow = 0;

    for (const anim of sseAnimations) {
      const elapsed = now - anim.startTime;
      if (elapsed > SSE_ANIM_DURATION_MS || elapsed < 0) continue;

      // Ring glow ramps up over SSE_ANIM_RING_MS, then fades in second half
      const ramp = Math.min(1, elapsed / SSE_ANIM_RING_MS);
      const fadeStart = SSE_ANIM_DURATION_MS * 0.5;
      const fade =
        elapsed > fadeStart
          ? 1.0 - Math.min(1.0, (elapsed - fadeStart) / (SSE_ANIM_DURATION_MS - fadeStart))
          : 1.0;
      const intensity = ramp * fade;

      if (intensity > _shardSseIntensity[anim.shardId]) {
        _shardSseIntensity[anim.shardId] = intensity;
        _shardSseColorIdx[anim.shardId] = SSE_TYPE_TO_IDX[anim.type] ?? 3;
      }
      if (intensity > maxSseRingGlow) maxSseRingGlow = intensity;
    }

    // Combine access-path glow with SSE glow (take max)
    const combinedRingGlow = Math.max(glowIntensity, maxSseRingGlow);

    // Apply glow to torus
    if (torusRef.current) {
      const mat = torusRef.current.material as THREE.MeshBasicMaterial;
      const baseOpacity = 0.15;
      const glowOpacity = 0.6;
      mat.opacity = baseOpacity + combinedRingGlow * (glowOpacity - baseOpacity);
      mat.color.copy(RING_COLOR).lerp(RING_GLOW_SCALED, combinedRingGlow);
    }

    // Apply glow to main ring line
    if (mainLineRef.current) {
      const mat = mainLineRef.current.material as THREE.LineBasicMaterial;
      mat.opacity = 0.35 + combinedRingGlow * 0.55;
      mat.color.copy(RING_COLOR).lerp(RING_GLOW_SCALED, combinedRingGlow);
    }

    // Apply glow to inner ring line
    if (innerLineRef.current) {
      const mat = innerLineRef.current.material as THREE.LineBasicMaterial;
      mat.opacity = 0.12 + combinedRingGlow * 0.4;
    }

    // Glow shard markers — access path OR SSE animation (whichever stronger)
    for (let i = 0; i < 4; i++) {
      const mesh = shardMarkerRefs.current[i];
      if (!mesh) continue;
      const mat = mesh.material as THREE.MeshBasicMaterial;

      const accessGlow = i === activeShardId ? glowIntensity : 0;
      const sseGlow = _shardSseIntensity[i];

      if (sseGlow > accessGlow && sseGlow > 0) {
        // SSE animation wins — use type-specific color from pre-allocated array
        const sseColor = SSE_GLOW_COLORS_ARRAY[_shardSseColorIdx[i]] ?? SHARD_MARKER_COLOR;
        _scratchColor.copy(SHARD_MARKER_COLOR).lerp(sseColor, sseGlow);
        mat.color.copy(_scratchColor);
        const pulse = 1 + Math.sin(now * 0.01) * 0.15 * sseGlow;
        mesh.scale.setScalar(1.0 + sseGlow * 0.8 * pulse);
      } else if (accessGlow > 0) {
        // Access path wins — amber glow (pre-computed scaled color)
        mat.color.copy(SHARD_MARKER_COLOR).lerp(SHARD_GLOW_SCALED, accessGlow);
        const pulse = 1 + Math.sin(now * 0.01) * 0.15 * accessGlow;
        mesh.scale.setScalar(1.0 + accessGlow * 0.8 * pulse);
      } else {
        mat.color.copy(SHARD_MARKER_COLOR);
        mesh.scale.setScalar(1.0);
      }
    }
  });

  // Hash bucket positions around the ring
  const bucketPositions = useMemo(() => {
    const positions: Array<[number, number, number]> = [];
    for (let i = 0; i < HASH_BUCKETS; i++) {
      const angle = (i / HASH_BUCKETS) * Math.PI * 2;
      positions.push([
        Math.cos(angle) * RING_RADIUS,
        0, // relative to group Y
        Math.sin(angle) * RING_RADIUS,
      ]);
    }
    return positions;
  }, []);

  // Shard connection points on the ring (fixed, don't rotate)
  const shardPoints = useMemo(() => {
    return [0, 1, 2, 3].map((id) => {
      const angle = SHARD_ANGLES[id] ?? 0;
      return [Math.cos(angle) * RING_RADIUS, RING_Y, Math.sin(angle) * RING_RADIUS] as [
        number,
        number,
        number,
      ];
    });
  }, []);

  // Ring circle geometry (line loop)
  const ringLine = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= RING_SEGMENTS; i++) {
      const angle = (i / RING_SEGMENTS) * Math.PI * 2;
      points.push(
        new THREE.Vector3(Math.cos(angle) * RING_RADIUS, 0, Math.sin(angle) * RING_RADIUS),
      );
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, []);

  // Inner ring (slightly smaller, for depth)
  const innerRingLine = useMemo(() => {
    const innerR = RING_RADIUS - 0.5;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= RING_SEGMENTS; i++) {
      const angle = (i / RING_SEGMENTS) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * innerR, 0, Math.sin(angle) * innerR));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, []);

  return (
    <>
      {/* Rotating hash bucket markers */}
      <group ref={ringGroupRef} position={[0, RING_Y, 0]}>
        {/* Main ring line */}
        <lineLoop ref={mainLineRef} geometry={ringLine}>
          <lineBasicMaterial color={RING_COLOR} transparent opacity={0.35} toneMapped={false} />
        </lineLoop>

        {/* Inner ring line */}
        <lineLoop ref={innerLineRef} geometry={innerRingLine}>
          <lineBasicMaterial color={RING_COLOR} transparent opacity={0.12} toneMapped={false} />
        </lineLoop>

        {/* Torus for solid ring body */}
        <mesh ref={torusRef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[RING_RADIUS, RING_TUBE_RADIUS, 8, RING_SEGMENTS]} />
          <meshBasicMaterial color={RING_COLOR} transparent opacity={0.15} toneMapped={false} />
        </mesh>

        {/* Hash bucket tick marks (small dots around the ring) */}
        {bucketPositions.map((pos, i) => (
          <mesh key={`bucket-${i}`} position={pos}>
            <sphereGeometry args={[0.04, 6, 6]} />
            <meshBasicMaterial color={BUCKET_COLOR} transparent opacity={0.5} />
          </mesh>
        ))}
      </group>

      {/* Shard connection markers on the ring (fixed, don't rotate with hash buckets) */}
      {shardPoints.map((pos, i) => (
        <mesh
          key={`shard-ring-${i}`}
          ref={(el) => {
            shardMarkerRefs.current[i] = el;
          }}
          position={pos}
        >
          <sphereGeometry args={[0.2, 12, 12]} />
          <meshBasicMaterial
            color={SHARD_MARKER_COLOR}
            toneMapped={false}
            transparent
            opacity={0.9}
          />
        </mesh>
      ))}

      {/* Center root marker */}
      {treeHead && (
        <mesh position={[0, RING_Y, 0]}>
          <sphereGeometry args={[0.25, 16, 16]} />
          <meshBasicMaterial
            color={CENTER_ROOT_COLOR}
            toneMapped={false}
            transparent
            opacity={0.9}
          />
        </mesh>
      )}
    </>
  );
}
