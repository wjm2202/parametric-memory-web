/**
 * Layout Web Worker — runs ALL heavy tree computation off the main thread.
 *
 * Receives raw atom metadata, computes:
 *   1. Atom 3D positions (BFS tree, conical pyramid layout)
 *   2. Full binary-tree placeholder geometry (Float32Arrays)
 *   3. Tree edge geometry (Float32Arrays)
 *
 * Results are sent back with Transferable buffers (zero-copy).
 * The main thread never does layout math — it just applies the results.
 */

/* ─── Duplicated constants (workers can't import from main bundle) ─── */

const RING_RADIUS = 5;
const RING_Y = 14;
const ROOT_GAP = 1.5;
const NODE_SPACING = 0.8;
const CONE_RATIO = 0.45;
const LEVEL_DROP = 3.5;
const MAX_VISUAL_DEPTH = 7;
const NUM_SHARDS = 4;
const ARC_FILL = 0.92;

/** Radial distance from world center at a given depth (exponential). */
function radialAtDepth(depth: number): number {
  return RING_RADIUS + ((1 << depth) - 1) * CONE_RATIO;
}

/** Cumulative vertical drop — linear (bowl curve with exponential radial). */
function cumulativeDrop(depth: number): number {
  return depth * LEVEL_DROP;
}

const SHARD_ANGLES: Record<number, number> = {
  0: 0,
  1: Math.PI / 2,
  2: Math.PI,
  3: (3 * Math.PI) / 2,
};

/* ─── Pure math (identical to memory-store.ts exports) ─── */

function getVisualDepth(atomCount: number): number {
  if (atomCount <= 0) return 0;
  if (atomCount === 1) return 0;
  return Math.min(Math.floor(Math.log2(atomCount)), MAX_VISUAL_DEPTH);
}

/** Full 3D position for a tree node — angular arc distribution. */
function treeNodePosition(
  shardId: number,
  depth: number,
  posInLevel: number,
): [number, number, number] {
  const centerAngle = SHARD_ANGLES[shardId] ?? 0;
  const radial = radialAtDepth(depth);
  const nodesAtLevel = 1 << depth;
  const fraction = (posInLevel + 0.5) / nodesAtLevel;

  // Angular span: maintain NODE_SPACING arc-length, capped at quadrant
  const naturalSpan = (nodesAtLevel * NODE_SPACING) / radial;
  const maxSpan = ARC_FILL * ((2 * Math.PI) / NUM_SHARDS);
  const span = Math.min(naturalSpan, maxSpan);

  const nodeAngle = centerAngle + (fraction - 0.5) * span;

  return [
    Math.cos(nodeAngle) * radial,
    RING_Y - ROOT_GAP - cumulativeDrop(depth),
    Math.sin(nodeAngle) * radial,
  ];
}

/** BFS tree depth for the i-th atom (0-indexed sorted within shard). */
function atomTreeDepth(sortedIndex: number): number {
  return Math.floor(Math.log2(sortedIndex + 1));
}

/** BFS position-in-level for the i-th atom (0-indexed sorted within shard). */
function atomTreePosInLevel(sortedIndex: number): number {
  const depth = atomTreeDepth(sortedIndex);
  return sortedIndex - ((1 << depth) - 1);
}

function shardRingPosition(shardId: number): [number, number, number] {
  const angle = SHARD_ANGLES[shardId] ?? 0;
  return [Math.cos(angle) * RING_RADIUS, RING_Y, Math.sin(angle) * RING_RADIUS];
}

/* ─── Atom type ─── */

interface RawAtom {
  key: string;
  type: string;
  shard: number;
  index: number;
  hash: string;
  resolved: boolean;
}

/* ─── Computation: atom positions ─── */

function computeAtomPositions(
  atoms: RawAtom[],
): Array<{ key: string; position: [number, number, number] }> {
  const byShard: Record<number, RawAtom[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const a of atoms) {
    (byShard[a.shard] ?? (byShard[a.shard] = [])).push(a);
  }

  const result: Array<{ key: string; position: [number, number, number] }> = [];

  for (const sid of [0, 1, 2, 3]) {
    const shardAtoms = byShard[sid];
    shardAtoms.sort((a, b) => a.index - b.index);

    const N = shardAtoms.length;
    if (N === 0) continue;

    for (let i = 0; i < N; i++) {
      const a = shardAtoms[i];
      const depth = atomTreeDepth(i);
      const posInLevel = atomTreePosInLevel(i);

      result.push({
        key: a.key,
        position: treeNodePosition(sid, depth, posInLevel),
      });
    }
  }

  return result;
}

/* ─── Computation: placeholder geometry ─── */

// Placeholder colors (pre-computed RGB, multiplied by bloom factor)
const PH_R = 0.2 * 1.5,
  PH_G = 0.255 * 1.5,
  PH_B = 0.333 * 1.5; // slate-700 dim
const OC_R = 0.278 * 1.2,
  OC_G = 0.333 * 1.2,
  OC_B = 0.412 * 1.2; // slate-600 brighter

function computePlaceholders(
  shardCounts: Record<number, number>,
  occupiedNodes: Record<number, Set<number>>,
): { positions: Float32Array; colors: Float32Array; count: number } {
  let totalNodes = 0;
  for (const sid of [0, 1, 2, 3]) {
    const count = shardCounts[sid] ?? 0;
    if (count === 0) continue;
    const vDepth = getVisualDepth(count);
    totalNodes += (1 << (vDepth + 1)) - 1;
  }

  const positions = new Float32Array(totalNodes * 3);
  const colors = new Float32Array(totalNodes * 3);
  let idx = 0;

  for (const sid of [0, 1, 2, 3]) {
    const count = shardCounts[sid] ?? 0;
    if (count === 0) continue;

    const vDepth = getVisualDepth(count);
    const nodes = occupiedNodes[sid] ?? new Set();

    for (let level = 0; level <= vDepth; level++) {
      const nodesAtLevel = 1 << level;
      for (let pos = 0; pos < nodesAtLevel; pos++) {
        const [nx, ny, nz] = treeNodePosition(sid, level, pos);
        const i3 = idx * 3;
        positions[i3] = nx;
        positions[i3 + 1] = ny;
        positions[i3 + 2] = nz;

        const isOccupied = nodes.has(level * 1000 + pos);
        colors[i3] = isOccupied ? OC_R : PH_R;
        colors[i3 + 1] = isOccupied ? OC_G : PH_G;
        colors[i3 + 2] = isOccupied ? OC_B : PH_B;

        idx++;
      }
    }
  }

  return { positions, colors, count: idx };
}

/* ─── Computation: tree edge geometry ─── */

function computeEdges(shardCounts: Record<number, number>): {
  treeEdges: Float32Array;
  ringEdges: Float32Array;
} {
  const edges: number[] = [];
  const rEdges: number[] = [];

  for (const sid of [0, 1, 2, 3]) {
    const count = shardCounts[sid] ?? 0;
    if (count === 0) continue;

    const vDepth = getVisualDepth(count);

    for (let level = 0; level < vDepth; level++) {
      const nodesAtLevel = 1 << level;
      for (let pos = 0; pos < nodesAtLevel; pos++) {
        const [px, py, pz] = treeNodePosition(sid, level, pos);
        const [lx, ly, lz] = treeNodePosition(sid, level + 1, pos * 2);
        edges.push(px, py, pz, lx, ly, lz);
        const [rx, ry, rz] = treeNodePosition(sid, level + 1, pos * 2 + 1);
        edges.push(px, py, pz, rx, ry, rz);
      }
    }

    // Root to ring
    const [rootX, rootY, rootZ] = treeNodePosition(sid, 0, 0);
    const ringPos = shardRingPosition(sid);
    rEdges.push(rootX, rootY, rootZ, ringPos[0], ringPos[1], ringPos[2]);
  }

  return {
    treeEdges: new Float32Array(edges),
    ringEdges: new Float32Array(rEdges),
  };
}

/* ─── Message handler ─── */

self.onmessage = (e: MessageEvent) => {
  const { type, atoms, generation } = e.data;

  if (type === "compute-all") {
    const rawAtoms = atoms as RawAtom[];

    const shardCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const a of rawAtoms) {
      shardCounts[a.shard] = (shardCounts[a.shard] ?? 0) + 1;
    }

    // Track which BFS tree positions are occupied
    const occupiedNodes: Record<number, Set<number>> = {
      0: new Set(),
      1: new Set(),
      2: new Set(),
      3: new Set(),
    };
    const sortedByShard: Record<number, RawAtom[]> = { 0: [], 1: [], 2: [], 3: [] };
    for (const a of rawAtoms) {
      (sortedByShard[a.shard] ?? (sortedByShard[a.shard] = [])).push(a);
    }
    for (const sid of [0, 1, 2, 3]) {
      sortedByShard[sid].sort((a, b) => a.index - b.index);
      for (let i = 0; i < sortedByShard[sid].length; i++) {
        const depth = atomTreeDepth(i);
        const posInLevel = atomTreePosInLevel(i);
        occupiedNodes[sid]?.add(depth * 1000 + posInLevel);
      }
    }

    const atomPositions = computeAtomPositions(rawAtoms);
    const placeholders = computePlaceholders(shardCounts, occupiedNodes);
    const edgeData = computeEdges(shardCounts);

    const msg = {
      type: "layout-result",
      generation,
      atomPositions,
      placeholderPositions: placeholders.positions,
      placeholderColors: placeholders.colors,
      placeholderCount: placeholders.count,
      treeEdges: edgeData.treeEdges,
      ringEdges: edgeData.ringEdges,
    };

    (self as unknown as Worker).postMessage(msg, [
      placeholders.positions.buffer,
      placeholders.colors.buffer,
      edgeData.treeEdges.buffer,
      edgeData.ringEdges.buffer,
    ]);
  }
};
