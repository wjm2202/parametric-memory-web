"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  useMemoryStore,
  shardRingPosition,
  treeNodePosition,
  atomTreeDepth,
  atomTreePosInLevel,
  CASCADE_ANIM_DURATION_MS,
  SSE_ANIM_DURATION_MS,
} from "@/stores/memory-store";
import type { SseAnimation, VisualAtom } from "@/stores/memory-store";

/**
 * Merkle Rehash Cascade — scientifically accurate add/tombstone animation.
 *
 * Replaces the simple ring→atom line with a multi-phase animation:
 *
 *   Phase 1 (0–400ms):   DESCENT — particle travels from hash ring → shard root → leaf,
 *                         lighting each tree edge as it passes through.
 *   Phase 2 (400–1400ms): REHASH CASCADE — golden wave sweeps UPWARD from leaf → root,
 *                         representing the hash recomputation that propagates up the Merkle tree.
 *                         This is the "money shot" — shows the cryptographic integrity guarantee.
 *   Phase 3 (1400–2200ms): SETTLE — edges fade, atom pulses to its type colour.
 *
 * For tombstone: same cascade but in pink/red tones with desaturation.
 *
 * Architecture:
 *   - Path cache: Merkle path computed once per animation, cached by anim ID
 *   - Pre-allocated line buffer: zero GC per frame
 *   - Instanced traveling particle: single sphere mesh reused across animations
 *   - Staggered batch: atoms within a batch cascade are offset by STAGGER_MS
 */

/* ─── Timing constants ─── */
const DESCENT_START_MS = 0;
const DESCENT_END_MS = 400;
const REHASH_START_MS = 400;
const REHASH_END_MS = 1400;
const SETTLE_START_MS = 1400;
const SETTLE_END_MS = CASCADE_ANIM_DURATION_MS;

/** Stagger between atoms in a batch (ms) */
const STAGGER_MS = 80;

/* ─── Colors (vivid — tuned for bloom at intensity 1.2+) ─── */
const ADD_DESCENT_COLOR = new THREE.Color("#22d3ee").multiplyScalar(3.5); // cyan descent
const ADD_REHASH_COLOR = new THREE.Color("#fbbf24").multiplyScalar(5.0); // golden rehash
const ADD_REHASH_BRIGHT = new THREE.Color("#fef3c7").multiplyScalar(7.0); // bright gold leading edge
const TOMB_DESCENT_COLOR = new THREE.Color("#f472b6").multiplyScalar(3.5); // pink descent
const TOMB_REHASH_COLOR = new THREE.Color("#ef4444").multiplyScalar(5.0); // red rehash
const TOMB_REHASH_BRIGHT = new THREE.Color("#fecaca").multiplyScalar(7.0); // bright red leading edge
const PARTICLE_COLOR_ADD = new THREE.Color("#67e8f9").multiplyScalar(6.0); // bright cyan particle
const PARTICLE_COLOR_TOMB = new THREE.Color("#fb7185").multiplyScalar(6.0); // bright pink particle
/** Pre-computed rehash particle colors (1.5× rehash) — avoids per-frame multiplyScalar */
const ADD_REHASH_PARTICLE = new THREE.Color("#fbbf24").multiplyScalar(5.0 * 1.5);
const TOMB_REHASH_PARTICLE = new THREE.Color("#ef4444").multiplyScalar(5.0 * 1.5);

/* ─── Access-specific colors (descent only, no rehash) ─── */
const ACCESS_DESCENT_COLOR = new THREE.Color("#fbbf24").multiplyScalar(3.5); // amber descent
const PARTICLE_COLOR_ACCESS = new THREE.Color("#fef3c7").multiplyScalar(6.0); // bright amber particle

/* ─── Buffer limits ─── */
const MAX_CASCADE_LINES = 256; // edges across all active cascades
const FLOATS_PER_LINE = 6; // 2 vertices × 3 components
const MAX_PARTICLES = 16; // traveling particles (one per atom in active cascades)
const PARTICLE_RADIUS = 0.22;

/* ─── Path cache ─── */
type MerklePath = [number, number, number][]; // ordered: [ringPos, root, ..., leaf]
const _pathCache = new Map<string, Map<string, MerklePath>>();
/** Track last cleanup time so we don't scan every frame */
let _lastCacheCleanup = 0;
const CACHE_CLEANUP_INTERVAL_MS = 2000;

/**
 * Compute the Merkle tree path from ring → root → ... → leaf for an atom.
 * Returns positions ordered from ring (top) down to leaf (bottom).
 */
function computeMerklePath(atom: VisualAtom, allAtoms: VisualAtom[]): MerklePath {
  const shard = atom.shard;

  // Find this atom's sorted index within its shard (BFS layout order)
  // Atoms within a shard are sorted by their `index` field
  let sortedIdx = 0;
  let found = false;
  const shardAtomIndices: { key: string; index: number }[] = [];
  for (const a of allAtoms) {
    if (a.shard === shard) {
      shardAtomIndices.push({ key: a.key, index: a.index });
    }
  }
  shardAtomIndices.sort((a, b) => a.index - b.index);
  for (let i = 0; i < shardAtomIndices.length; i++) {
    if (shardAtomIndices[i].key === atom.key) {
      sortedIdx = i;
      found = true;
      break;
    }
  }
  if (!found) {
    // Fallback: just use atom position directly
    return [shardRingPosition(shard), atom.position];
  }

  const depth = atomTreeDepth(sortedIdx);
  const posInLevel = atomTreePosInLevel(sortedIdx);

  // Build path from leaf upward to root
  const pathUp: [number, number, number][] = [];
  let d = depth;
  let p = posInLevel;
  while (d >= 0) {
    pathUp.push(treeNodePosition(shard, d, p));
    p = Math.floor(p / 2);
    d--;
  }
  // pathUp is [leaf, parent, grandparent, ..., root]

  // Reverse to get [root, ..., leaf], then prepend ring
  pathUp.reverse(); // now [root, ..., leaf]
  return [shardRingPosition(shard), ...pathUp];
}

/**
 * Get or compute cached paths for an animation.
 */
function getAnimPaths(
  anim: SseAnimation,
  atomMap: Map<string, VisualAtom>,
  allAtoms: VisualAtom[],
): Map<string, MerklePath> {
  const cached = _pathCache.get(anim.id);
  if (cached) return cached;

  const paths = new Map<string, MerklePath>();
  for (const key of anim.atomKeys) {
    const atom = atomMap.get(key);
    if (!atom) continue;
    const [ax, ay, az] = atom.position;
    if (ax === 0 && ay === 0 && az === 0) continue;
    paths.set(key, computeMerklePath(atom, allAtoms));
  }
  _pathCache.set(anim.id, paths);
  return paths;
}

/**
 * Interpolate position along a path given progress 0→1.
 * Progress 0 = first point, 1 = last point.
 */
function interpolatePath(path: MerklePath, progress: number, out: [number, number, number]): void {
  if (path.length === 0) return;
  if (path.length === 1) {
    out[0] = path[0][0];
    out[1] = path[0][1];
    out[2] = path[0][2];
    return;
  }

  const t = Math.max(0, Math.min(1, progress)) * (path.length - 1);
  const idx = Math.floor(t);
  const frac = t - idx;
  const a = path[Math.min(idx, path.length - 1)];
  const b = path[Math.min(idx + 1, path.length - 1)];

  out[0] = a[0] + (b[0] - a[0]) * frac;
  out[1] = a[1] + (b[1] - a[1]) * frac;
  out[2] = a[2] + (b[2] - a[2]) * frac;
}

export default function MerkleRehashCascade() {
  const lineRef = useRef<THREE.LineSegments>(null);
  const particleRef = useRef<THREE.InstancedMesh>(null);

  const tmpObj = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const tmpPos = useMemo((): [number, number, number] => [0, 0, 0], []);

  // Pre-allocated buffers
  const posBuffer = useMemo(() => new Float32Array(MAX_CASCADE_LINES * FLOATS_PER_LINE), []);
  const colorBuffer = useMemo(() => new Float32Array(MAX_CASCADE_LINES * FLOATS_PER_LINE), []);

  useFrame(() => {
    const line = lineRef.current;
    const particles = particleRef.current;
    if (!line) return;

    const { sseAnimations, atomMap, atoms } = useMemoryStore.getState();
    const now = performance.now();

    // Periodic cache cleanup — evict paths for animations that no longer exist
    if (now - _lastCacheCleanup > CACHE_CLEANUP_INTERVAL_MS) {
      _lastCacheCleanup = now;
      const liveIds = new Set(sseAnimations.map((a) => a.id));
      for (const cachedId of _pathCache.keys()) {
        if (!liveIds.has(cachedId)) _pathCache.delete(cachedId);
      }
    }

    let lineCount = 0;
    let pIdx = 0;

    for (const anim of sseAnimations) {
      // Handle add, tombstone, AND access (access = descent only, no rehash)
      if (anim.type !== "add" && anim.type !== "tombstone" && anim.type !== "access") continue;
      if (lineCount >= MAX_CASCADE_LINES) break;

      const isAccess = anim.type === "access";
      const maxDuration = isAccess ? SSE_ANIM_DURATION_MS : CASCADE_ANIM_DURATION_MS;
      const elapsed = now - anim.startTime;
      if (elapsed < 0 || elapsed > maxDuration) continue;

      const isTombstone = anim.type === "tombstone";
      const descentColor = isAccess ? ACCESS_DESCENT_COLOR : isTombstone ? TOMB_DESCENT_COLOR : ADD_DESCENT_COLOR;
      const rehashColor = isTombstone ? TOMB_REHASH_COLOR : ADD_REHASH_COLOR;
      const rehashBright = isTombstone ? TOMB_REHASH_BRIGHT : ADD_REHASH_BRIGHT;
      const particleColor = isAccess ? PARTICLE_COLOR_ACCESS : isTombstone ? PARTICLE_COLOR_TOMB : PARTICLE_COLOR_ADD;

      const paths = getAnimPaths(anim, atomMap, atoms);

      let atomIdx = 0;
      for (const [, path] of paths) {
        if (lineCount >= MAX_CASCADE_LINES) break;
        if (path.length < 2) {
          atomIdx++;
          continue;
        }

        // Stagger: each atom in a batch starts slightly later
        const staggerOffset = atomIdx * STAGGER_MS;
        const atomElapsed = elapsed - staggerOffset;
        if (atomElapsed < 0) {
          atomIdx++;
          continue;
        }

        const edgeCount = path.length - 1;

        // ─── Phase 1: DESCENT (ring → leaf) ───
        if (atomElapsed >= DESCENT_START_MS && atomElapsed < DESCENT_END_MS) {
          const descentProgress =
            (atomElapsed - DESCENT_START_MS) / (DESCENT_END_MS - DESCENT_START_MS);
          // How many edges have been "reached" by the descending particle
          const edgesReached = descentProgress * edgeCount;

          for (let e = 0; e < edgeCount; e++) {
            if (lineCount >= MAX_CASCADE_LINES) break;

            // Edge brightness: fully lit if passed, partially lit if current, dark if ahead
            let edgeBrightness = 0;
            if (e < Math.floor(edgesReached)) {
              // Already passed — dim trail
              edgeBrightness = 0.3;
            } else if (e < edgesReached) {
              // Current edge — bright leading edge
              edgeBrightness = 0.8;
            } else {
              continue; // Not reached yet
            }

            const offset = lineCount * FLOATS_PER_LINE;
            posBuffer[offset + 0] = path[e][0];
            posBuffer[offset + 1] = path[e][1];
            posBuffer[offset + 2] = path[e][2];
            posBuffer[offset + 3] = path[e + 1][0];
            posBuffer[offset + 4] = path[e + 1][1];
            posBuffer[offset + 5] = path[e + 1][2];

            for (let v = 0; v < 2; v++) {
              const co = offset + v * 3;
              colorBuffer[co + 0] = descentColor.r * edgeBrightness;
              colorBuffer[co + 1] = descentColor.g * edgeBrightness;
              colorBuffer[co + 2] = descentColor.b * edgeBrightness;
            }
            lineCount++;
          }

          // Traveling particle position
          if (particles && pIdx < MAX_PARTICLES) {
            interpolatePath(path, descentProgress, tmpPos);
            tmpObj.position.set(tmpPos[0], tmpPos[1], tmpPos[2]);
            const pulse = 1 + Math.sin(atomElapsed * 0.02) * 0.2;
            tmpObj.scale.setScalar(PARTICLE_RADIUS * pulse);
            tmpObj.updateMatrix();
            particles.setMatrixAt(pIdx, tmpObj.matrix);
            tmpColor.copy(particleColor);
            particles.setColorAt(pIdx, tmpColor);
            pIdx++;
          }
        }

        // ─── Access: FADE after descent (no rehash, no settle) ───
        if (isAccess && atomElapsed >= DESCENT_END_MS) {
          const fadeDuration = SSE_ANIM_DURATION_MS - DESCENT_END_MS;
          const fade = 1.0 - Math.min(1.0, (atomElapsed - DESCENT_END_MS) / fadeDuration);
          if (fade > 0.01) {
            for (let e = 0; e < edgeCount; e++) {
              if (lineCount >= MAX_CASCADE_LINES) break;
              const offset = lineCount * FLOATS_PER_LINE;
              posBuffer[offset + 0] = path[e][0];
              posBuffer[offset + 1] = path[e][1];
              posBuffer[offset + 2] = path[e][2];
              posBuffer[offset + 3] = path[e + 1][0];
              posBuffer[offset + 4] = path[e + 1][1];
              posBuffer[offset + 5] = path[e + 1][2];
              const brightness = 0.6 * fade;
              for (let v = 0; v < 2; v++) {
                const co = offset + v * 3;
                colorBuffer[co + 0] = descentColor.r * brightness;
                colorBuffer[co + 1] = descentColor.g * brightness;
                colorBuffer[co + 2] = descentColor.b * brightness;
              }
              lineCount++;
            }
          }
        }

        // ─── Phase 2: REHASH CASCADE (leaf → root, upward golden wave) ───
        // (skipped for access — access is read-only, no tree mutation)
        if (!isAccess && atomElapsed >= REHASH_START_MS && atomElapsed < REHASH_END_MS) {
          const rehashProgress =
            (atomElapsed - REHASH_START_MS) / (REHASH_END_MS - REHASH_START_MS);
          // Rehash travels from leaf (last edge) UP to root (first edge)
          const rehashEdgesReached = rehashProgress * edgeCount;

          for (let e = 0; e < edgeCount; e++) {
            if (lineCount >= MAX_CASCADE_LINES) break;

            // Reverse index: leaf is at (edgeCount-1), root connection at 0
            const reverseE = edgeCount - 1 - e;

            let edgeBrightness = 0;
            const isLeadingEdge =
              reverseE < rehashEdgesReached && reverseE >= Math.floor(rehashEdgesReached) - 0.5;

            if (reverseE < Math.floor(rehashEdgesReached)) {
              // Already rehashed — bright sustained glow that fades slowly
              const timeSinceRehash = rehashEdgesReached - reverseE;
              edgeBrightness = Math.max(0.4, 1.0 - timeSinceRehash * 0.15);
            } else if (reverseE < rehashEdgesReached) {
              // Leading edge — maximum brightness
              edgeBrightness = 1.0;
            } else {
              // Dim trace from descent
              edgeBrightness = 0.15;
            }

            const offset = lineCount * FLOATS_PER_LINE;
            posBuffer[offset + 0] = path[e][0];
            posBuffer[offset + 1] = path[e][1];
            posBuffer[offset + 2] = path[e][2];
            posBuffer[offset + 3] = path[e + 1][0];
            posBuffer[offset + 4] = path[e + 1][1];
            posBuffer[offset + 5] = path[e + 1][2];

            // Leading edge gets the bright flash color, rest get rehash color
            const edgeColor = isLeadingEdge ? rehashBright : rehashColor;
            for (let v = 0; v < 2; v++) {
              const co = offset + v * 3;
              colorBuffer[co + 0] = edgeColor.r * edgeBrightness;
              colorBuffer[co + 1] = edgeColor.g * edgeBrightness;
              colorBuffer[co + 2] = edgeColor.b * edgeBrightness;
            }
            lineCount++;
          }

          // Traveling particle moves upward (leaf → root) during rehash.
          // The Merkle rehash propagates leaf → root, NOT past the root to the ring.
          // Path = [ring(0), root(1), ..., leaf(N)].
          // rehashProgress 0 → leaf (path[N]) = interpolateProgress 1.0
          // rehashProgress 1 → root (path[1]) = interpolateProgress 1/N
          if (particles && pIdx < MAX_PARTICLES) {
            const N = path.length - 1;
            const rootFraction = 1 / N; // where the root sits in interpolation space
            const interpProgress = 1.0 - rehashProgress * (1.0 - rootFraction);
            interpolatePath(path, interpProgress, tmpPos);
            tmpObj.position.set(tmpPos[0], tmpPos[1], tmpPos[2]);
            const pulse = 1.2 + Math.sin(atomElapsed * 0.03) * 0.3;
            tmpObj.scale.setScalar(PARTICLE_RADIUS * pulse * 1.5); // larger during rehash
            tmpObj.updateMatrix();
            particles.setMatrixAt(pIdx, tmpObj.matrix);
            tmpColor.copy(isTombstone ? TOMB_REHASH_PARTICLE : ADD_REHASH_PARTICLE);
            particles.setColorAt(pIdx, tmpColor);
            pIdx++;
          }
        }

        // ─── Phase 3: SETTLE (fade out) — add/tombstone only ───
        if (!isAccess && atomElapsed >= SETTLE_START_MS && atomElapsed < SETTLE_END_MS) {
          const settleProgress =
            (atomElapsed - SETTLE_START_MS) / (SETTLE_END_MS - SETTLE_START_MS);
          const fade = 1.0 - settleProgress;

          for (let e = 0; e < edgeCount; e++) {
            if (lineCount >= MAX_CASCADE_LINES) break;

            const offset = lineCount * FLOATS_PER_LINE;
            posBuffer[offset + 0] = path[e][0];
            posBuffer[offset + 1] = path[e][1];
            posBuffer[offset + 2] = path[e][2];
            posBuffer[offset + 3] = path[e + 1][0];
            posBuffer[offset + 4] = path[e + 1][1];
            posBuffer[offset + 5] = path[e + 1][2];

            const brightness = 0.4 * fade;
            for (let v = 0; v < 2; v++) {
              const co = offset + v * 3;
              colorBuffer[co + 0] = rehashColor.r * brightness;
              colorBuffer[co + 1] = rehashColor.g * brightness;
              colorBuffer[co + 2] = rehashColor.b * brightness;
            }
            lineCount++;
          }
        }

        atomIdx++;
      }
    }

    // Update line geometry — only flag GPU upload when there's something to draw
    // (posBuffer/colorBuffer ARE the attribute backing arrays, shared by reference)
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

    // Hide unused particles
    if (particles) {
      for (let i = pIdx; i < MAX_PARTICLES; i++) {
        tmpObj.position.set(0, 0, 0);
        tmpObj.scale.setScalar(0);
        tmpObj.updateMatrix();
        particles.setMatrixAt(i, tmpObj.matrix);
      }
      particles.instanceMatrix.needsUpdate = true;
      if (particles.instanceColor) {
        particles.instanceColor.needsUpdate = true;
      }
    }
  });

  return (
    <group>
      {/* Cascade edge lines */}
      <lineSegments ref={lineRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[posBuffer, 3]}
            count={MAX_CASCADE_LINES * 2}
            itemSize={3}
            usage={THREE.DynamicDrawUsage}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colorBuffer, 3]}
            count={MAX_CASCADE_LINES * 2}
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

      {/* Traveling particle */}
      <instancedMesh
        ref={particleRef}
        args={[undefined, undefined, MAX_PARTICLES]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.9} />
      </instancedMesh>
    </group>
  );
}
