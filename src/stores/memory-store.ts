import { create } from "zustand";
import type {
  AtomDetailResponse,
  AtomListItem,
  TreeHeadResponse,
  WeightsResponse,
  AtomType,
  BatchAccessResponse,
  MerkleProof,
} from "@/types/memory";
import { parseAtomType } from "@/types/memory";
import { verifyFullProof, type VerificationResult } from "@/lib/verify-merkle-proof";

/* ─── Enriched atom with position + visual data ─── */
export interface VisualAtom {
  key: string;
  type: AtomType;
  shard: number;
  index: number;
  hash: string;
  /** true once shard/index come from the server, not a guess */
  resolved: boolean;
  /** 3D position [x, y, z] */
  position: [number, number, number];
  /** Recently accessed — triggers glow pulse */
  pulse: boolean;
  /** Atom has been removed/superseded in MMPM */
  tombstoned: boolean;
}

/* ─── Pre-computed geometry from the layout worker ─── */
export interface SceneGeometry {
  placeholderPositions: Float32Array;
  placeholderColors: Float32Array;
  placeholderCount: number;
  treeEdges: Float32Array;
  ringEdges: Float32Array;
}

/* ─── Scene error log ─── */
export interface SceneError {
  source: string;
  message: string;
  timestamp: number;
  severity: "warn" | "error" | "fatal";
}

const MAX_ERRORS = 50;

/* ─── Access path animation ─── */
export interface AccessPath {
  /** Key of the accessed atom */
  atomKey: string;
  /** Shard the atom belongs to */
  shardId: number;
  /** Ordered positions from leaf → root → ring point */
  positions: [number, number, number][];
  /** Time (performance.now()) when the animation started */
  startTime: number;
}

/* ─── S16-7: SSE animation queue ─── */
export type SseAnimationType = "add" | "tombstone" | "train" | "access";

export interface SseAnimation {
  id: string;
  type: SseAnimationType;
  /** Atom keys involved in this animation */
  atomKeys: string[];
  /** Which shard glows on the ring */
  shardId: number;
  /** performance.now() when the animation was queued */
  startTime: number;
}

/** Total animation duration — after this, the animation is garbage-collected */
export const SSE_ANIM_DURATION_MS = 1200;
/** Extended duration for Merkle cascade animations (add/tombstone) */
export const CASCADE_ANIM_DURATION_MS = 2200;
/** Max animation duration across all types — used for GC */
export const MAX_ANIM_DURATION_MS = 2200;
/** How long the ring glow ramps up */
export const SSE_ANIM_RING_MS = 200;
/** Line cascade: start after ring glow begins, finish before atom effect */
export const SSE_ANIM_LINE_START_MS = 100;
export const SSE_ANIM_LINE_END_MS = 500;
/** Atom effect window */
export const SSE_ANIM_ATOM_START_MS = 300;

let sseAnimIdCounter = 0;

/* ─── Batched pulse reset — coalesces multiple setTimeout callbacks into one state update ─── */
let _pulseResetTimer: ReturnType<typeof setTimeout> | null = null;
const _pulseResetKeys = new Set<string>();
const PULSE_RESET_BATCH_MS = 200; // batch pulse resets within 200ms

function schedulePulseReset(key: string): void {
  _pulseResetKeys.add(key);
  if (_pulseResetTimer) return; // batch already scheduled
  _pulseResetTimer = setTimeout(() => {
    _pulseResetTimer = null;
    const keys = new Set(_pulseResetKeys);
    _pulseResetKeys.clear();
    useMemoryStore.setState((s) => ({
      atoms: s.atoms.map((a) => (keys.has(a.key) ? { ...a, pulse: false } : a)),
    }));
  }, 1200 + PULSE_RESET_BATCH_MS);
}

/* ─── Store state ─── */
interface MemoryState {
  /* --- data --- */
  treeVersion: number;
  atoms: VisualAtom[];
  /** O(1) key→atom lookup — maintained alongside atoms array. Use in render loops instead of atoms.find(). */
  atomMap: Map<string, VisualAtom>;
  atomDetails: Map<string, AtomDetailResponse>;
  weights: Map<string, WeightsResponse>;
  treeHead: TreeHeadResponse | null;
  metrics: string | null;
  healthy: boolean;
  /** How many atoms have real shard/index from the server */
  resolvedCount: number;
  /** true once ALL atoms have real positions */
  positionsResolved: boolean;
  /** true while fetchRealPositions is actively running */
  resolvingInProgress: boolean;
  /** Pre-computed scene geometry (populated by layout worker) */
  geometry: SceneGeometry | null;

  /* --- error log --- */
  errors: SceneError[];
  consecutiveFailures: number;

  /* --- UI state --- */
  selectedAtom: string | null;
  hoveredAtom: string | null;
  isLoading: boolean;
  error: string | null;
  autoRotate: boolean;
  /** Currently animated access path (leaf → root → ring) */
  accessPath: AccessPath | null;

  /* --- SSE state (S16-3) --- */
  /** 'disconnected' | 'connecting' | 'connected' | 'fallback' */
  sseStatus: "disconnected" | "connecting" | "connected" | "fallback";
  /** Number of SSE clients connected to the server */
  sseClientCount: number;

  /* --- S16-7: SSE animation queue --- */
  sseAnimations: SseAnimation[];

  /* --- S16-4: Proof verification state --- */
  /** Verification result for the currently accessed atom (null = not yet verified) */
  proofVerification: VerificationResult | null;
  /** Raw proofs from the last random access (for badge hover detail) */
  accessProofs: { current: MerkleProof; shardRoot: MerkleProof } | null;

  /* --- actions --- */
  fetchTree: () => Promise<void>;
  fetchRealPositions: () => Promise<void>;
  fetchAtomDetail: (atom: string) => Promise<AtomDetailResponse | null>;
  fetchWeights: (atom: string) => Promise<void>;
  selectAtom: (atom: string | null) => void;
  hoverAtom: (atom: string | null) => void;
  toggleAutoRotate: () => void;
  pulseAtom: (atom: string) => void;
  /** Pick a random atom and animate its Merkle path */
  triggerRandomAccess: () => void;
  /** Clear the current access path animation */
  clearAccessPath: () => void;
  logError: (source: string, message: string, severity?: SceneError["severity"]) => void;
  clearErrors: () => void;
  /** S16-7: Push an SSE animation to the queue (O(1), non-blocking) */
  pushSseAnimation: (type: SseAnimationType, atomKeys: string[], shardId: number) => void;
  /** S16-7: Remove expired animations (called per-frame by scene components) */
  cleanExpiredAnimations: () => void;
  /** S16-3: Connect to SSE for real-time updates */
  connectSSE: () => void;
  /** S16-3: Disconnect SSE */
  disconnectSSE: () => void;
  /** Full teardown — SSE, timers, worker, caches. Call on page unload or route change. */
  dispose: () => void;
}

const API_BASE = "/api/memory";

/* ─── Progressive loading config ─── */
/**
 * Try to resolve all atoms in a single batch request first.
 * Only fall back to chunked requests if the single request fails
 * (e.g. payload too large, server timeout, or 429).
 */
const BATCH_CHUNK_SIZE = 200; // atoms per fallback chunk
const CHUNK_DELAY_MS = 200; // ms between fallback chunks
const RATE_LIMIT_PAUSE_MS = 5000; // pause on 429

/* ─── Layout constants ─── */

/** Real shard tree depth — from auditPath.length in real data */
export const SHARD_DEPTH = 8;
/** Total leaf slots per shard: 2^SHARD_DEPTH */
export const SHARD_SLOTS = 1 << SHARD_DEPTH; // 256

/**
 * CONICAL BOWL LAYOUT — ANGULAR ARC DISTRIBUTION
 * ───────────────────────────────────────────────
 * Each shard's tree hangs from a compact hash ring at the top.
 * Roots cluster near the ring; deeper levels fan outward radially,
 * forming a unified bowl/cone shape.
 *
 * KEY INSIGHT: Nodes are distributed along ARCS (not straight tangent
 * lines). Each shard fills its angular quadrant (90° for 4 shards),
 * so adjacent shard faces mesh together with minimal gaps.
 *
 * At each depth d, the natural angular span = (2^d × NODE_SPACING) / radial.
 * This is capped at ARC_FILL × (2π/N) to prevent overlap.
 * Deep levels naturally fill most of the quadrant as the tree widens.
 *
 * VERTICAL DROP IS LINEAR: combined with exponential radial spread,
 * this creates a bowl/parabola — steep near the root, flattening
 * toward horizontal at deeper levels.
 */

/** Hash ring radius — compact so shard roots cluster together */
export const RING_RADIUS = 5;
/** Hash ring Y position — where shard roots meet the ring */
export const RING_Y = 14;
/** Gap between ring and root node */
export const ROOT_GAP = 1.5;

/**
 * Spacing between adjacent nodes at each level.
 * Atoms are radius 0.18 so 0.8 gives clear separation.
 */
export const NODE_SPACING = 0.8;

/**
 * Cone ratio — radial growth factor per exponential step.
 * Controls how fast the bowl spreads outward with depth.
 * Lower values = tighter bowl, nodes fill more of each quadrant.
 */
export const CONE_RATIO = 0.45;

/**
 * How much of each shard's angular quadrant to fill (0–1).
 * 0.92 = 92% fill, leaving a thin seam between shards.
 */
export const ARC_FILL = 0.92;

/**
 * Constant vertical drop per level. Combined with the exponential
 * radial spread this creates a natural bowl/parabola: shallow levels
 * drop steeply (radial is small), deep levels spread nearly
 * horizontally (radial is huge but drop is the same constant).
 *
 * Slope at depth d ≈ LEVEL_DROP / (2^d × CONE_RATIO)
 *   d=1: 3.5/0.8 ≈ 4.4 (steep)  |  d=4: 3.5/12.8 ≈ 0.27 (gentle)
 *   d=7: 3.5/102 ≈ 0.03 (nearly flat)
 */
export const LEVEL_DROP = 3.5;

/** Maximum visual depth cap */
export const MAX_VISUAL_DEPTH = 7;

/** Number of shards (used for overlap math) */
export const NUM_SHARDS = 4;

/**
 * Shard angles — evenly spaced around the ring.
 * With 4 shards: right, front, left, back.
 */
export const SHARD_ANGLES: Record<number, number> = {
  0: 0, // right    (→)
  1: Math.PI / 2, // front    (↓ toward camera)
  2: Math.PI, // left     (←)
  3: (3 * Math.PI) / 2, // back     (↑ away from camera)
};

/** Position on the ring where each shard root connects */
export function shardRingPosition(shardId: number): [number, number, number] {
  const angle = SHARD_ANGLES[shardId] ?? 0;
  return [Math.cos(angle) * RING_RADIUS, RING_Y, Math.sin(angle) * RING_RADIUS];
}

/* ─── Visual tree helpers ─── */

/**
 * Visual depth for a shard with N atoms (BFS fill).
 * A single atom (root) → depth 0. Two atoms → depth 1. Etc.
 */
export function getVisualDepth(atomCount: number): number {
  if (atomCount <= 0) return 0;
  if (atomCount === 1) return 0;
  return Math.min(Math.floor(Math.log2(atomCount)), MAX_VISUAL_DEPTH);
}

/**
 * Radial distance from world center at a given depth.
 * Exponential: matches the doubling width of the binary tree.
 *
 *   radial(d) = RING_RADIUS + (2^d - 1) × CONE_RATIO
 *   d=0: 5  |  d=1: 5.45  |  d=3: 8.15  |  d=5: 18.95  |  d=7: 62.15
 */
export function radialAtDepth(depth: number): number {
  return RING_RADIUS + ((1 << depth) - 1) * CONE_RATIO;
}

/**
 * Cumulative vertical drop — LINEAR with depth.
 * Combined with exponential radial, this produces a bowl/parabola:
 * steep near the root, flattening toward horizontal at deep levels.
 */
export function cumulativeDrop(depth: number): number {
  return depth * LEVEL_DROP;
}

/** Y position for a given tree level */
export function treeNodeY(level: number): number {
  return RING_Y - ROOT_GAP - cumulativeDrop(level);
}

/**
 * Full 3D position for a tree node in the conical pyramid layout.
 *
 * ANGULAR DISTRIBUTION: Instead of spreading nodes along a straight tangent
 * line, we distribute them along an arc centered on the shard's angle.
 * This fills each shard's full angular quadrant, eliminating the wedge-shaped
 * gaps between adjacent shards.
 *
 * At each depth, the natural angular span = (2^d × NODE_SPACING) / radial.
 * This is capped at ARC_FILL × (2π / NUM_SHARDS) so shards never overlap.
 * Deep levels naturally fill most of the quadrant as the tree widens.
 */
export function treeNodePosition(
  shardId: number,
  depth: number,
  posInLevel: number,
): [number, number, number] {
  const centerAngle = SHARD_ANGLES[shardId] ?? 0;

  // Radial distance from world center — exponential growth
  const radial = radialAtDepth(depth);

  // Angular distribution: spread nodes along an arc
  const nodesAtLevel = 1 << depth; // 2^depth
  const fraction = (posInLevel + 0.5) / nodesAtLevel; // [0, 1]

  // Natural angular span to maintain NODE_SPACING arc-length between nodes
  const naturalSpan = (nodesAtLevel * NODE_SPACING) / radial;
  // Cap at ARC_FILL of the quadrant to prevent shard overlap
  const maxSpan = ARC_FILL * ((2 * Math.PI) / NUM_SHARDS);
  const span = Math.min(naturalSpan, maxSpan);

  // Place node at its angular position on the arc
  const nodeAngle = centerAngle + (fraction - 0.5) * span;

  return [
    Math.cos(nodeAngle) * radial,
    RING_Y - ROOT_GAP - cumulativeDrop(depth),
    Math.sin(nodeAngle) * radial,
  ];
}

/**
 * BFS tree depth for the i-th atom (0-indexed sorted within shard).
 * Atom 0 → root (depth 0), atoms 1-2 → depth 1, atoms 3-6 → depth 2, etc.
 */
export function atomTreeDepth(sortedIndex: number): number {
  return Math.floor(Math.log2(sortedIndex + 1));
}

/**
 * BFS position-in-level for the i-th atom (0-indexed sorted within shard).
 * Atom 0 → pos 0 at depth 0. Atom 1 → pos 0 at depth 1. Atom 2 → pos 1 at depth 1.
 */
export function atomTreePosInLevel(sortedIndex: number): number {
  const depth = atomTreeDepth(sortedIndex);
  return sortedIndex - ((1 << depth) - 1);
}

/* ─── Layout Worker management ─── */

let layoutWorker: Worker | null = null;
let workerGeneration = 0;

function getLayoutWorker(): Worker | null {
  if (typeof window === "undefined") return null; // SSR guard
  if (layoutWorker) return layoutWorker;

  try {
    layoutWorker = new Worker(new URL("../workers/layout.worker.ts", import.meta.url));
    layoutWorker.onmessage = handleWorkerResult;
    layoutWorker.onerror = (e) => {
      console.warn("[LayoutWorker] Error:", e.message);
      layoutWorker = null; // fall back to main thread next time
    };
    return layoutWorker;
  } catch {
    console.warn("[LayoutWorker] Failed to create, using main-thread fallback");
    return null;
  }
}

function handleWorkerResult(e: MessageEvent) {
  const {
    type,
    generation,
    atomPositions,
    placeholderPositions,
    placeholderColors,
    placeholderCount,
    treeEdges,
    ringEdges,
  } = e.data;
  if (type !== "layout-result") return;

  // Discard stale results (a newer layout request was already sent)
  if (generation !== workerGeneration) return;

  // Build a position lookup from worker results
  const posMap = new Map<string, [number, number, number]>();
  for (const { key, position } of atomPositions as Array<{
    key: string;
    position: [number, number, number];
  }>) {
    posMap.set(key, position);
  }

  useMemoryStore.setState((s) => {
    const updatedAtoms = s.atoms.map((a) => {
      const pos = posMap.get(a.key);
      return pos ? { ...a, position: pos } : a;
    });
    return {
      atoms: updatedAtoms,
      atomMap: buildAtomMap(updatedAtoms),
      geometry: {
        placeholderPositions: placeholderPositions as Float32Array,
        placeholderColors: placeholderColors as Float32Array,
        placeholderCount: placeholderCount as number,
        treeEdges: treeEdges as Float32Array,
        ringEdges: ringEdges as Float32Array,
      },
    };
  });
}

/**
 * Post atom data to the layout worker for off-thread computation.
 * Falls back to main-thread layout if the worker isn't available.
 */
function requestLayout() {
  const { atoms } = useMemoryStore.getState();
  if (atoms.length === 0) return;

  workerGeneration++;
  const gen = workerGeneration;

  const worker = getLayoutWorker();
  if (worker) {
    // Serialize atoms to plain objects for the worker
    const rawAtoms = atoms.map((a) => ({
      key: a.key,
      type: a.type,
      shard: a.shard,
      index: a.index,
      hash: a.hash,
      resolved: a.resolved,
    }));
    worker.postMessage({ type: "compute-all", atoms: rawAtoms, generation: gen });
  } else {
    // Main-thread fallback (synchronous)
    const positioned = relayout(atoms);
    useMemoryStore.setState({ atoms: positioned, atomMap: buildAtomMap(positioned) });
    // No geometry pre-computation in fallback — components compute their own via useMemo
  }
}

/* ─── Debounced layout request ─── */

let layoutTimer: ReturnType<typeof setTimeout> | null = null;
const LAYOUT_DEBOUNCE_MS = 150; // batch rapid updates

function requestLayoutDebounced() {
  if (layoutTimer) clearTimeout(layoutTimer);
  layoutTimer = setTimeout(requestLayout, LAYOUT_DEBOUNCE_MS);
}

/* ─── Layout helpers (main-thread fallback) ─── */

function hashToShard(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 4) as number;
}

/**
 * Place atoms in a BFS-filled binary tree using the conical pyramid layout.
 * Atom 0 (sorted) → root, atoms 1-2 → children, atoms 3-6 → depth 2, etc.
 */
function layoutShard(
  atoms: Array<{
    key: string;
    type: AtomType;
    shard: number;
    index: number;
    hash: string;
    resolved: boolean;
    tombstoned: boolean;
  }>,
  shardId: number,
): VisualAtom[] {
  if (atoms.length === 0) return [];

  return atoms.map((a, sortedIdx) => {
    const depth = atomTreeDepth(sortedIdx);
    const posInLevel = atomTreePosInLevel(sortedIdx);

    return {
      ...a,
      position: treeNodePosition(shardId, depth, posInLevel),
      pulse: false,
    };
  });
}

function relayout(atoms: VisualAtom[]): VisualAtom[] {
  const byShard: Record<number, VisualAtom[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const a of atoms) {
    (byShard[a.shard] ?? (byShard[a.shard] = [])).push(a);
  }
  const out: VisualAtom[] = [];
  for (const sid of [0, 1, 2, 3]) {
    byShard[sid].sort((a, b) => a.index - b.index);
    out.push(...layoutShard(byShard[sid], sid));
  }
  return out;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Rebuild atomMap from atoms array — O(n), called when atoms change */
function buildAtomMap(atoms: VisualAtom[]): Map<string, VisualAtom> {
  const map = new Map<string, VisualAtom>();
  for (const a of atoms) {
    map.set(a.key, a);
  }
  return map;
}

/* ─── S16-3: SSE connection management (module-level) ─── */

let eventSource: EventSource | null = null;
let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let sseReconnectAttempts = 0;
const SSE_MAX_RECONNECT_ATTEMPTS = 3;
const SSE_RECONNECT_BASE_MS = 2000;

function cleanupSSE(resetAttempts = true): void {
  if (sseReconnectTimer) {
    clearTimeout(sseReconnectTimer);
    sseReconnectTimer = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (resetAttempts) {
    sseReconnectAttempts = 0;
  }
}

/* ─── S16-3 Step 3: SSE event processing layers ─── */

/**
 * Parsed commit event payload — typed for downstream layers.
 * This is the only place we define the wire format shape.
 */
export interface CommitEventData {
  version: number;
  root: string;
  added: Array<{ key: string; shard: number; index: number; hash: string }> | string[];
  tombstoned: string[];
  trained: string[][];
}

/**
 * Layer 1 — Event parser. Thin, ~5 lines.
 * Parses raw SSE JSON into a typed CommitEventData. Throws on malformed input.
 */
export function parseCommitEvent(raw: string): CommitEventData {
  return JSON.parse(raw) as CommitEventData;
}

/**
 * Layer 2 — State updater.
 * Updates atoms[], atomMap, treeVersion, treeHead. Schedules layout worker
 * if atoms changed. Does NOT queue animations — that's Layer 3's job.
 */
export function applyCommitToState(
  data: CommitEventData,
  set: (fn: (s: MemoryState) => Partial<MemoryState>) => void,
): void {
  set((s) => {
    let atoms = [...s.atoms];
    const treeHead = s.treeHead
      ? { ...s.treeHead, version: data.version, root: data.root }
      : s.treeHead;

    // Process added atoms — insert new VisualAtom nodes
    for (const entry of data.added) {
      const isEnriched = typeof entry === "object" && entry !== null && "key" in entry;
      const key = isEnriched ? entry.key : (entry as string);
      if (atoms.some((a) => a.key === key)) continue;

      const shard = isEnriched ? entry.shard : hashToShard(key);
      const index = isEnriched ? entry.index : atoms.filter((a) => a.shard === shard).length;
      const hash = isEnriched ? entry.hash : "";
      const resolved = isEnriched && entry.index >= 0;

      // Compute approximate BFS position inline so animations can target it
      // immediately. The layout worker will refine ~150ms later.
      const shardCount = atoms.filter((a) => a.shard === shard).length;
      const depth = atomTreeDepth(shardCount);
      const posInLevel = atomTreePosInLevel(shardCount);
      const position = treeNodePosition(shard, depth, posInLevel);

      atoms.push({
        key,
        type: parseAtomType(key),
        shard,
        index,
        hash,
        resolved,
        position,
        pulse: true,
        tombstoned: false,
      });
      schedulePulseReset(key);
    }

    // Process tombstoned atoms — mark for fade animation
    for (const key of data.tombstoned) {
      atoms = atoms.map((a) => (a.key === key ? { ...a, tombstoned: true } : a));
    }

    return {
      atoms,
      atomMap: buildAtomMap(atoms),
      treeVersion: data.version,
      treeHead,
    };
  });

  // Recompute layout for new atoms
  if (data.added.length > 0) {
    requestLayoutDebounced();
  }
}

/**
 * Layer 3 — Animation dispatcher.
 * Reads commit data, groups by shard, pushes to sseAnimations[] queue.
 * ThreeJS components consume the queue per-frame — no rendering logic here.
 */
export function dispatchCommitAnimations(data: CommitEventData, get: () => MemoryState): void {
  const { pushSseAnimation, atomMap } = get();

  // Animate added atoms — group by shard
  if (data.added.length > 0) {
    const addByShard = new Map<number, string[]>();
    for (const entry of data.added) {
      const isEnriched = typeof entry === "object" && entry !== null && "key" in entry;
      const key = isEnriched ? entry.key : (entry as string);
      const shard = isEnriched ? entry.shard : (atomMap.get(key)?.shard ?? hashToShard(key));
      if (!addByShard.has(shard)) addByShard.set(shard, []);
      addByShard.get(shard)!.push(key);
    }
    for (const [shard, keys] of addByShard) {
      pushSseAnimation("add", keys, shard);
    }
  }

  // Animate tombstoned atoms — group by shard
  if (data.tombstoned.length > 0) {
    const tombByShard = new Map<number, string[]>();
    for (const key of data.tombstoned) {
      const shard = atomMap.get(key)?.shard ?? hashToShard(key);
      if (!tombByShard.has(shard)) tombByShard.set(shard, []);
      tombByShard.get(shard)!.push(key);
    }
    for (const [shard, keys] of tombByShard) {
      pushSseAnimation("tombstone", keys, shard);
    }
  }

  // Animate trained sequences
  for (const sequence of data.trained) {
    if (sequence.length < 2) continue;
    const shard = atomMap.get(sequence[0])?.shard ?? hashToShard(sequence[0]);
    pushSseAnimation("train", sequence, shard);
  }
}

/**
 * Dispatch access animations — groups accessed atoms by shard, pulses each,
 * and pushes access animation to the queue.
 */
export function dispatchAccessEvent(data: { atoms: string[] }, get: () => MemoryState): void {
  const { pushSseAnimation, pulseAtom, atomMap } = get();
  const byShard = new Map<number, string[]>();
  for (const atomKey of data.atoms) {
    pulseAtom(atomKey);
    const shard = atomMap.get(atomKey)?.shard ?? hashToShard(atomKey);
    if (!byShard.has(shard)) byShard.set(shard, []);
    byShard.get(shard)!.push(atomKey);
  }
  for (const [shard, keys] of byShard) {
    pushSseAnimation("access", keys, shard);
  }
}

/* ─── Store ─── */
export const useMemoryStore = create<MemoryState>((set, get) => ({
  treeVersion: 0,
  atoms: [],
  atomMap: new Map(),
  atomDetails: new Map(),
  weights: new Map(),
  treeHead: null,
  metrics: null,
  healthy: false,
  resolvedCount: 0,
  positionsResolved: false,
  resolvingInProgress: false,
  geometry: null,
  errors: [],
  consecutiveFailures: 0,
  selectedAtom: null,
  hoveredAtom: null,
  isLoading: false,
  error: null,
  autoRotate: true,
  accessPath: null,
  sseStatus: "disconnected",
  sseClientCount: 0,
  sseAnimations: [],
  proofVerification: null,
  accessProofs: null,

  /* ── Phase 1: instant load — 2 requests ── */
  fetchTree: async () => {
    const { logError } = get();
    set({ isLoading: true, error: null });
    try {
      const [headRes, listRes] = await Promise.all([
        fetch(`${API_BASE}/tree-head`),
        fetch(`${API_BASE}/atoms`),
      ]);

      if (headRes.status === 429 || listRes.status === 429) {
        const failures = get().consecutiveFailures + 1;
        logError("fetchTree", `Rate limited (429). Backing off. Consecutive: ${failures}`, "warn");
        set({ isLoading: false, consecutiveFailures: failures });
        return;
      }

      if (!headRes.ok || !listRes.ok) {
        const headBody = !headRes.ok ? await headRes.text().catch(() => "") : "";
        const listBody = !listRes.ok ? await listRes.text().catch(() => "") : "";
        const detail = [headBody, listBody].filter(Boolean).join(" | ");
        const msg = `MMPM unreachable (head: ${headRes.status}, list: ${listRes.status})${detail ? ` — ${detail.slice(0, 200)}` : ""}`;
        logError("fetchTree", msg, "error");
        throw new Error(msg);
      }

      const head: TreeHeadResponse = await headRes.json();
      const list: { atoms: AtomListItem[]; treeVersion: number } = await listRes.json();

      const currentVersion = get().treeVersion;
      // BUG FIX: Use <= instead of === to prevent race condition.
      // When SSE already advanced treeVersion beyond the poll response,
      // the poll data is stale — skip instead of rebuilding from old data.
      if (head.version <= currentVersion && currentVersion > 0) {
        set({ isLoading: false, consecutiveFailures: 0 });
        return;
      }

      // Temporary layout with FNV-1a shard guess + sequential index.
      // Gets replaced progressively by fetchRealPositions.
      // Include tombstoned atoms — they render dim/ghostly in the tree.

      const byShard: Record<
        number,
        Array<{
          key: string;
          type: AtomType;
          shard: number;
          index: number;
          hash: string;
          resolved: boolean;
          tombstoned: boolean;
        }>
      > = { 0: [], 1: [], 2: [], 3: [] };

      for (const a of list.atoms) {
        const shard = hashToShard(a.atom);
        const group = byShard[shard];
        group.push({
          key: a.atom,
          type: parseAtomType(a.atom),
          shard,
          index: group.length,
          hash: "",
          resolved: false,
          tombstoned: a.status === "tombstoned",
        });
      }

      const allVisual: VisualAtom[] = [];
      for (const sid of [0, 1, 2, 3]) {
        byShard[sid].sort((a, b) => a.key.localeCompare(b.key));
        byShard[sid].forEach((a, i) => {
          a.index = i;
        });
        allVisual.push(...layoutShard(byShard[sid], sid));
      }

      set({
        treeVersion: head.version,
        treeHead: head,
        atoms: allVisual,
        atomMap: buildAtomMap(allVisual),
        healthy: true,
        isLoading: false,
        consecutiveFailures: 0,
        positionsResolved: false,
        resolvedCount: 0,
      });

      // Kick off async layout computation via worker
      requestLayout();
    } catch (err) {
      const hadData = get().treeVersion > 0;
      const failures = get().consecutiveFailures + 1;
      set({
        error: err instanceof Error ? err.message : "Failed to fetch tree",
        isLoading: false,
        healthy: hadData,
        consecutiveFailures: failures,
      });
    }
  },

  /* ── Phase 2: resolve real shard/index positions ── */
  fetchRealPositions: async () => {
    const { atoms, logError, positionsResolved, resolvingInProgress } = get();
    if (atoms.length === 0 || positionsResolved || resolvingInProgress) return;

    const unresolved = atoms.filter((a) => !a.resolved).map((a) => a.key);
    if (unresolved.length === 0) {
      set({ positionsResolved: true, resolvingInProgress: false });
      return;
    }

    set({ resolvingInProgress: true });

    /** Apply batch-access results to the atom store */
    const applyResults = (data: BatchAccessResponse) => {
      const lookup = new Map<string, { shard: number; index: number; hash: string }>();
      for (const r of data.results) {
        if (!r.ok) continue;
        lookup.set(r.currentData, {
          shard: r.shardRootProof.index,
          index: r.currentProof.index,
          hash: r.currentProof.leaf,
        });
      }
      set((s) => {
        const updated = s.atoms.map((a) => {
          const real = lookup.get(a.key);
          if (!real) return a;
          return { ...a, shard: real.shard, index: real.index, hash: real.hash, resolved: true };
        });
        const resolved = updated.filter((a) => a.resolved).length;
        return {
          atoms: updated,
          atomMap: buildAtomMap(updated),
          resolvedCount: resolved,
          positionsResolved: resolved === updated.length,
        };
      });
      requestLayoutDebounced();
    };

    try {
      // ── Fast path: try resolving ALL atoms in a single request ──
      let singleShotDone = false;
      try {
        const res = await fetch(`${API_BASE}/batch-access`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: unresolved }),
        });

        if (res.ok) {
          applyResults(await res.json());
          singleShotDone = true;
        } else if (res.status === 429) {
          logError(
            "fetchRealPositions",
            "Rate limited on single-shot. Falling back to chunks.",
            "warn",
          );
          await delay(RATE_LIMIT_PAUSE_MS);
        } else {
          logError(
            "fetchRealPositions",
            `Single-shot failed (${res.status}). Falling back to chunks.`,
            "warn",
          );
        }
      } catch (err) {
        logError(
          "fetchRealPositions",
          `Single-shot error: ${err instanceof Error ? err.message : "unknown"}. Falling back to chunks.`,
          "warn",
        );
      }

      if (singleShotDone) return;

      // ── Fallback: chunked requests ──
      const chunks: string[][] = [];
      const remaining = get()
        .atoms.filter((a) => !a.resolved)
        .map((a) => a.key);
      for (let i = 0; i < remaining.length; i += BATCH_CHUNK_SIZE) {
        chunks.push(remaining.slice(i, i + BATCH_CHUNK_SIZE));
      }

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        try {
          const res = await fetch(`${API_BASE}/batch-access`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: chunk }),
          });

          if (res.status === 429) {
            logError(
              "fetchRealPositions",
              `Rate limited at chunk ${ci + 1}/${chunks.length}. Pausing.`,
              "warn",
            );
            await delay(RATE_LIMIT_PAUSE_MS);
            ci--;
            continue;
          }

          if (!res.ok) {
            logError(
              "fetchRealPositions",
              `${res.status}: ${await res.text().catch(() => "")}`,
              "error",
            );
            break;
          }

          applyResults(await res.json());

          if (ci < chunks.length - 1) {
            await delay(CHUNK_DELAY_MS);
          }
        } catch (err) {
          logError(
            "fetchRealPositions",
            `chunk ${ci + 1}: ${err instanceof Error ? err.message : "unknown"}`,
            "error",
          );
          break;
        }
      }
    } finally {
      // Always clear the resolving flag — success or failure
      set({ resolvingInProgress: false });
    }
  },

  /* ── On-demand detail (click to inspect) ── */
  fetchAtomDetail: async (atom: string) => {
    const { logError } = get();
    // Atom keys can include descriptions (e.g. "v1.fact.foo: some desc").
    // Long keys cause nginx 400 on GET URLs, so we use batch-access (POST body) instead.
    try {
      const res = await fetch(`${API_BASE}/batch-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [atom] }),
      });
      if (res.status === 429) {
        logError("fetchAtomDetail", `Rate limited fetching ${atom}`, "warn");
        return null;
      }
      if (!res.ok) {
        logError("fetchAtomDetail", `${res.status} fetching ${atom}`, "warn");
        return null;
      }
      const batch: BatchAccessResponse = await res.json();
      const result = batch.results?.[0];
      if (!result?.ok || !result.currentProof || !result.shardRootProof) {
        logError("fetchAtomDetail", `Atom not found or incomplete proof: ${atom}`, "warn");
        return null;
      }
      // Adapt batch-access response to AtomDetailResponse (partial — no transitions)
      const detail = {
        atom: result.currentData ?? atom,
        shard: result.shardRootProof.index ?? 0,
        index: result.currentProof.index ?? 0,
        hash: result.currentProof.leaf ?? "",
        committedAtVersion: result.treeVersion ?? 0,
        outgoingTransitions: [] as {
          to: string;
          weight: number;
          effectiveWeight: number;
          lastUpdatedMs: number;
        }[],
      } as AtomDetailResponse;
      set((s) => {
        const map = new Map(s.atomDetails);
        map.set(atom, detail);
        return { atomDetails: map };
      });
      return detail;
    } catch (err) {
      logError(
        "fetchAtomDetail",
        `${atom}: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
      );
      return null;
    }
  },

  fetchWeights: async (atom: string) => {
    const { logError } = get();
    try {
      const res = await fetch(`${API_BASE}/weights/${encodeURIComponent(atom)}`);
      if (!res.ok) {
        logError("fetchWeights", `${res.status} for ${atom}`, "warn");
        return;
      }
      const data: WeightsResponse = await res.json();
      set((s) => {
        const map = new Map(s.weights);
        map.set(atom, data);
        return { weights: map };
      });
    } catch (err) {
      logError(
        "fetchWeights",
        `${atom}: ${err instanceof Error ? err.message : "unknown error"}`,
        "warn",
      );
    }
  },

  selectAtom: (atom) => set({ selectedAtom: atom }),
  hoverAtom: (atom) => set({ hoveredAtom: atom }),
  toggleAutoRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),

  pulseAtom: (atom: string) => {
    set((s) => ({
      atoms: s.atoms.map((a) => (a.key === atom ? { ...a, pulse: true } : a)),
    }));
    // Batched pulse reset — coalesces multiple resets into a single state update
    schedulePulseReset(atom);
  },

  triggerRandomAccess: () => {
    const { atoms, logError } = get();
    const active = atoms.filter((a) => !a.tombstoned);
    if (active.length === 0) return;

    // Pick a random active (non-tombstoned) atom
    const atom = active[Math.floor(Math.random() * active.length)];

    // Find sorted index within its shard
    const shardAtoms = atoms
      .filter((a) => a.shard === atom.shard)
      .sort((a, b) => a.index - b.index);
    const sortedIdx = shardAtoms.findIndex((a) => a.key === atom.key);
    if (sortedIdx < 0) return;

    // Walk up the BFS tree: parent of sorted index i is floor((i-1)/2)
    const positions: [number, number, number][] = [];
    let idx = sortedIdx;
    while (idx >= 0) {
      const depth = atomTreeDepth(idx);
      const posInLevel = atomTreePosInLevel(idx);
      positions.push(treeNodePosition(atom.shard, depth, posInLevel));
      if (idx === 0) break; // reached root
      idx = Math.floor((idx - 1) / 2);
    }

    // Final segment: root → ring position
    positions.push(shardRingPosition(atom.shard));

    // Clear previous verification, set new access path
    set({
      accessPath: {
        atomKey: atom.key,
        shardId: atom.shard,
        positions,
        startTime: performance.now(),
      },
      selectedAtom: atom.key,
      proofVerification: null,
      accessProofs: null,
    });

    // S16-4: Fire-and-forget proof fetch + client-side verification
    // Non-blocking — the animation starts immediately, badge appears when verification completes
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/batch-access`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [atom.key] }),
        });
        if (!res.ok) return;
        const batch: BatchAccessResponse = await res.json();
        const result = batch.results?.[0];
        if (!result?.ok || !result.currentProof || !result.shardRootProof) return;

        // Store raw proofs for badge hover detail
        set({ accessProofs: { current: result.currentProof, shardRoot: result.shardRootProof } });

        // Client-side SHA-256 verification (Web Crypto API)
        const verification = await verifyFullProof(result.currentProof, result.shardRootProof);
        // Only update if this atom is still the accessed one (user may have clicked again)
        if (get().accessPath?.atomKey === atom.key) {
          set({ proofVerification: verification });
        }
      } catch (err) {
        logError(
          "proofVerify",
          `Verification failed: ${err instanceof Error ? err.message : "unknown"}`,
          "warn",
        );
      }
    })();

    // Auto-clear after 4 seconds
    setTimeout(() => {
      const current = get().accessPath;
      if (current?.atomKey === atom.key) {
        set({ accessPath: null });
      }
    }, 4000);
  },

  clearAccessPath: () => set({ accessPath: null, proofVerification: null, accessProofs: null }),

  logError: (source, message, severity = "error") => {
    const entry: SceneError = { source, message, timestamp: Date.now(), severity };
    const consoleFn = severity === "warn" ? console.warn : console.error;
    consoleFn(`[Substrate:${source}]`, message);
    set((s) => ({
      errors: [...s.errors.slice(-(MAX_ERRORS - 1)), entry],
    }));
  },

  clearErrors: () => set({ errors: [] }),

  /* ── S16-7: SSE animation queue ── */
  pushSseAnimation: (type, atomKeys, shardId) => {
    const anim: SseAnimation = {
      id: `sse-${++sseAnimIdCounter}`,
      type,
      atomKeys,
      shardId,
      startTime: performance.now(),
    };
    set((s) => ({ sseAnimations: [...s.sseAnimations, anim] }));
  },

  cleanExpiredAnimations: () => {
    // Short-circuit: skip entirely if no animations to clean
    const anims = get().sseAnimations;
    if (anims.length === 0) return;
    const now = performance.now();
    // Quick check: if the oldest animation hasn't expired yet, nothing to do
    if (now - anims[0].startTime < MAX_ANIM_DURATION_MS) return;
    set((s) => {
      const live = s.sseAnimations.filter((a) => now - a.startTime < MAX_ANIM_DURATION_MS);
      return live.length < s.sseAnimations.length ? { sseAnimations: live } : {};
    });
  },

  /* ── S16-3: SSE real-time updates ── */
  connectSSE: () => {
    if (typeof window === "undefined") return; // SSR guard
    if (eventSource) return; // Already connected
    // Don't retry if we already gave up — stay in fallback/poll mode
    if (get().sseStatus === "fallback") return;

    const { logError } = get();
    set({ sseStatus: "connecting" });

    const es = new EventSource(`${API_BASE}/events`);
    eventSource = es;

    es.addEventListener("connected", (e) => {
      try {
        const data = JSON.parse(e.data);
        set({
          sseStatus: "connected",
          sseClientCount: data.clientCount ?? 0,
        });
        sseReconnectAttempts = 0;
        console.log("[SSE] Connected:", data.clientId);
      } catch {
        set({ sseStatus: "connected" });
      }
    });

    es.addEventListener("commit", (e) => {
      try {
        const data = parseCommitEvent(e.data);
        applyCommitToState(data, set);
        dispatchCommitAnimations(data, get);
      } catch (err) {
        logError(
          "SSE:commit",
          `Failed to process commit event: ${err instanceof Error ? err.message : "unknown"}`,
          "warn",
        );
      }
    });

    es.addEventListener("access", (e) => {
      try {
        const data = JSON.parse(e.data) as { atoms: string[] };
        dispatchAccessEvent(data, get);
      } catch {
        // Ignore malformed access events
      }
    });

    es.addEventListener("clients", (e) => {
      try {
        const data = JSON.parse(e.data) as { count: number };
        set({ sseClientCount: data.count });
      } catch {
        // Ignore
      }
    });

    es.onerror = () => {
      // EventSource auto-reconnects, but if it fails repeatedly, fall back to polling
      sseReconnectAttempts++;
      if (sseReconnectAttempts >= SSE_MAX_RECONNECT_ATTEMPTS) {
        logError("SSE", "SSE connection failed — falling back to poll mode", "warn");
        // Don't reset attempts — keeps fallback sticky until page reload
        cleanupSSE(false);
        set({ sseStatus: "fallback", sseClientCount: 0 });
        return;
      }

      set({ sseStatus: "connecting" });
      // EventSource handles its own reconnection, but if it closes entirely:
      if (es.readyState === EventSource.CLOSED) {
        // Don't reset attempts — preserve the counter for backoff
        cleanupSSE(false);
        const backoff = SSE_RECONNECT_BASE_MS * Math.pow(2, sseReconnectAttempts - 1);
        logError("SSE", `Reconnecting in ${backoff}ms (attempt ${sseReconnectAttempts})`, "warn");
        sseReconnectTimer = setTimeout(() => {
          get().connectSSE();
        }, backoff);
      }
    };
  },

  disconnectSSE: () => {
    cleanupSSE();
    set({ sseStatus: "disconnected", sseClientCount: 0 });
  },

  dispose: () => {
    // ─── SSE ───
    cleanupSSE();
    set({ sseStatus: "disconnected", sseClientCount: 0, sseAnimations: [] });

    // ─── Layout worker ───
    if (layoutWorker) {
      layoutWorker.terminate();
      layoutWorker = null;
    }
    if (layoutTimer) {
      clearTimeout(layoutTimer);
      layoutTimer = null;
    }

    // ─── Pulse reset batch timer ───
    if (_pulseResetTimer) {
      clearTimeout(_pulseResetTimer);
      _pulseResetTimer = null;
      _pulseResetKeys.clear();
    }
  },
}));
