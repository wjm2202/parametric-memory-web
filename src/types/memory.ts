/** Response types matching the MMPM REST API */

export interface TreeHeadResponse {
  version: number;
  root: string;
  timestamp: number;
  checkedAt: number;
}

export interface AtomListItem {
  atom: string;
  status: "active" | "tombstoned";
}

/**
 * Edge summary returned when `?includeWeights=true` is passed to GET /atoms.
 * Lighter than full WeightsResponse — omits lastUpdatedMs and response metadata.
 */
export interface AtomEdgeSummary {
  to: string;
  weight: number;
  effectiveWeight: number;
}

/**
 * Atom entry enriched with outgoing Markov edges.
 * Returned by GET /atoms?includeWeights=true.
 */
export interface AtomWithEdges extends AtomListItem {
  edges: AtomEdgeSummary[];
  /** Sprint 4: Poincaré disk [x, y] from server. Null if projection not yet run. */
  poincare?: [number, number] | null;
}

export interface AtomListResponse {
  atoms: AtomListItem[];
  treeVersion: number;
}

/**
 * Response shape when GET /atoms?includeWeights=true is used.
 * Each atom entry includes an `edges` array of outgoing Markov transitions.
 * This collapses N+1 HTTP round trips into a single request — critical for
 * the Knowledge Graph page, especially on mobile.
 */
export interface AtomGraphResponse {
  atoms: AtomWithEdges[];
  treeVersion: number;
}

/* ─── Structural (knowledge-graph) edge types ─────────────────────────────── */

/** The seven structural edge types — mirrors EDGE_TYPES from the substrate */
export type StructuralEdgeType =
  | "references"
  | "depends_on"
  | "supersedes"
  | "constrains"
  | "member_of"
  | "derived_from"
  | "produced_by";

/** A structural edge between two atoms (full detail, returned by GET /edges/:atom) */
export interface StructuralEdge {
  source: string;
  target: string;
  type: StructuralEdgeType;
  confidence: number;
  createdAtMs?: number;
}

/** Lightweight structural edge ref — used in SSE commit payloads */
export interface StructuralEdgeRef {
  source: string;
  target: string;
  type: string;
}

export interface MerkleProof {
  leaf: string;
  root: string;
  auditPath: string[];
  index: number;
}

export interface AtomDetailResponse {
  atom: string;
  shard: number;
  index: number;
  status: "active" | "tombstoned";
  hash: string;
  committed: boolean;
  createdAtMs: number;
  committedAtVersion: number;
  treeVersion: number;
  outgoingTransitions: TransitionEdge[];
  proof: MerkleProof;
  ttl: number | null;
  contradiction: {
    hasConflict: boolean;
    conflictKey: string;
    competingClaims: Array<{
      atom: string;
      claim: string;
      source: string | null;
      confidence: number | null;
      createdAtMs: number;
    }>;
  };
}

export interface TransitionEdge {
  to: string;
  weight: number;
  effectiveWeight: number;
  lastUpdatedMs: number;
}

export interface WeightsResponse {
  atom: string;
  transitions: TransitionEdge[];
  totalWeight: number;
  totalEffectiveWeight: number;
  dominantNext: string | null;
  dominanceRatio: number;
}

export interface SearchResult {
  atom: string;
  similarity: number;
  rank: number;
  shardId: number;
  proof: MerkleProof;
}

export interface SearchResponse {
  mode: string;
  query: string;
  results: SearchResult[];
  searchTimeMs: number;
  treeVersion: number;
}

export interface AccessResponse {
  atom: string;
  prediction: {
    next: string | null;
    confidence: number;
  } | null;
  proof: MerkleProof;
}

/** Single result from POST /batch-access */
export interface BatchAccessResult {
  ok: boolean;
  currentData: string; // atom name
  currentProof: MerkleProof; // .index = leaf index within shard
  shardRootProof: MerkleProof; // .index = shard number (0-3)
  predictedNext: string | null;
  predictedProof: MerkleProof | null;
  latencyMs: number;
  treeVersion: number;
}

export interface BatchAccessResponse {
  results: BatchAccessResult[];
}

export interface VerifyResponse {
  valid: boolean;
  atom: string;
  checkedAt: number;
}

export interface HealthResponse {
  status: string;
  uptime?: number;
}

/** Atom type derived from naming convention */
export type AtomType =
  | "fact"
  | "state"
  | "event"
  | "relation"
  | "procedure"
  | "domain"
  | "task"
  | "other";

/** Parse atom type from atom name (e.g. "v1.fact.xxx" → "fact") */
export function parseAtomType(atom: string): AtomType {
  const parts = atom.split(".");
  if (parts.length >= 2) {
    const type = parts[1];
    if (["fact", "state", "event", "relation", "procedure", "domain", "task"].includes(type)) {
      return type as AtomType;
    }
  }
  return "other";
}

/** Colour mapping for atom types (fallback when Poincaré colour is unavailable) */
export const ATOM_COLORS: Record<AtomType, string> = {
  fact: "#22d3ee", // cyan-400
  state: "#fbbf24", // amber-400
  event: "#34d399", // emerald-400
  procedure: "#a78bfa", // violet-400
  relation: "#f472b6", // pink-400
  domain: "#f97316", // orange-500 — anchor nodes
  task: "#38bdf8", // sky-400 — mid-hierarchy
  other: "#94a3b8", // slate-400
};

/** Hex to [r, g, b] normalized (0–1) */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}
