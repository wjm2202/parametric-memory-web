/**
 * Knowledge Graph store — manages the ego-graph exploration state.
 *
 * Separate from memory-store (Substrate Viewer) intentionally.
 * The two pages share memory.ts types but have independent state trees.
 *
 * Key design rule: node positions (x, y, z) live on KGNode objects and
 * are mutated in place by d3-force-3d. Zustand is NOT notified on every
 * position change — that would cause re-renders every frame. Position
 * reads happen directly from node objects inside useFrame.
 */
import { create } from "zustand";
import type { AtomType, AtomDetailResponse } from "@/types/memory";
import { parseAtomType } from "@/types/memory";
import * as THREE from "three";

/* ─── KG-12: Module-level reusable Vector3 — zero allocation per node add ── */

const _tmpVec3 = new THREE.Vector3();

/* ─── Node ─────────────────────────────────────────────────────────────── */

export interface KGNode {
  key: string;
  /** Short label: strips "v1.<type>." prefix for display */
  label: string;
  type: AtomType;
  status: "loading" | "loaded" | "error";
  /** Mutable position — d3-force-3d writes x/y/z/vx/vy/vz directly */
  x: number;
  y: number;
  z: number;
  /** Allow d3-force-3d to attach vx, vy, vz, fx, fy, fz */
  [key: string]: unknown;
}

/** Parse the display label from atom name. e.g. "v1.fact.deploy_strategy" → "deploy_strategy" */
export function parseLabel(atom: string): string {
  const parts = atom.split(".");
  // v1.<type>.<label...> — join everything after the type
  if (parts.length >= 3) return parts.slice(2).join(".");
  return atom;
}

/**
 * Seed a node at a random position within a sphere of given radius.
 * KG-12: Reuses module-level _tmpVec3 — no allocation per call.
 */
export function randomPosition(radius = 80): { x: number; y: number; z: number } {
  _tmpVec3.randomDirection().multiplyScalar(Math.random() * radius);
  return { x: _tmpVec3.x, y: _tmpVec3.y, z: _tmpVec3.z };
}

/**
 * Seed a node near an existing position (for expand-neighbours).
 * KG-12: Reuses module-level _tmpVec3 — no allocation per call.
 */
export function nearPosition(
  anchor: { x: number; y: number; z: number },
  radius = 5,
): { x: number; y: number; z: number } {
  _tmpVec3.randomDirection().multiplyScalar(Math.random() * radius);
  return { x: anchor.x + _tmpVec3.x, y: anchor.y + _tmpVec3.y, z: anchor.z + _tmpVec3.z };
}

/* ─── Edge ─────────────────────────────────────────────────────────────── */

export interface KGEdge {
  /** Atom key of the source (the atom that has the trained transition) */
  source: string;
  /** Atom key of the target (the atom it predicts) */
  target: string;
  weight: number;
  effectiveWeight: number;
}

/* ─── Store ─────────────────────────────────────────────────────────────── */

interface KnowledgeState {
  /** All nodes in the graph. Positions are mutated by the force sim. */
  nodes: Map<string, KGNode>;
  /** All directed Markov edges */
  edges: KGEdge[];
  /**
   * KG-03: Persistent deduplication index — avoids rebuilding a Set from
   * the full edges array on every addEdges call. Updated atomically with edges.
   */
  edgeKeys: Set<string>;
  /** Atoms that have had their neighbours fully fetched */
  expandedAtoms: Set<string>;
  /** Atoms currently waiting on a network fetch */
  loadingAtoms: Set<string>;
  /** Currently selected atom (side panel) */
  selectedAtom: string | null;
  /** Currently hovered atom (label) */
  hoveredAtom: string | null;
  /** Last search query string */
  searchQuery: string;
  /** Cached full atom details (avoids re-fetching on re-select) */
  cachedDetails: Map<string, AtomDetailResponse>;
  /**
   * Atoms that were direct matches in the last search query.
   * Used by GraphNodes to highlight seed atoms with a distinct colour + pulse.
   * Cleared when the user resets the graph or runs a new search.
   */
  searchHits: Set<string>;
  /**
   * When non-null, GraphNodes hides (scale=0) any atom NOT in this set.
   * Set to the union of seed atoms + their Markov neighbours after a search.
   * null means "show everything" (default / after reset).
   * Hiding is purely visual — nodes stay in the force sim so the layout
   * is preserved and no sim restart is triggered.
   */
  visibleAtoms: Set<string> | null;

  // ── Actions ──────────────────────────────────────────────────────────────

  /**
   * Add a single node if it doesn't already exist.
   * anchor: position to seed near (defaults to random within sphere 15)
   */
  addNode: (key: string, anchor?: { x: number; y: number; z: number }) => void;

  /**
   * Add multiple nodes in one store update (one re-render instead of N).
   * Skips keys that already exist.
   */
  addNodes: (keys: string[], anchor?: { x: number; y: number; z: number }) => void;

  /**
   * Batch add nodes already marked as "loaded" — single store update.
   * Avoids the N× updateNodeStatus anti-pattern.
   */
  addNodesLoaded: (keys: string[], anchor?: { x: number; y: number; z: number }) => void;

  /** Update a node's status after a fetch completes or fails */
  updateNodeStatus: (key: string, status: KGNode["status"]) => void;

  /**
   * Merge new edges. Deduplicates using the persistent edgeKeys index — O(k)
   * per call where k = new edges, not O(n) total edges.
   * Must be called after the target node exists in the map.
   */
  addEdges: (edges: KGEdge[]) => void;

  /** Mark an atom as fully expanded (neighbours fetched) */
  markExpanded: (key: string) => void;

  /**
   * KG-01: Batch mark atoms as expanded — single store update.
   * Replaces the N× markExpanded anti-pattern in useAutoSeed.
   */
  markExpandedBatch: (keys: string[]) => void;

  /** Toggle loading state for an atom */
  markLoading: (key: string, loading: boolean) => void;

  /** Toggle loading state for multiple atoms in one update */
  markLoadingBatch: (keys: string[], loading: boolean) => void;

  /** Select an atom for the side panel. null deselects. */
  selectAtom: (key: string | null) => void;

  /** Hover an atom for the floating label. null clears. */
  hoverAtom: (key: string | null) => void;

  /** Update the current search query */
  setSearchQuery: (q: string) => void;

  /**
   * Replace the searchHits set with the latest seed keys.
   * Called after a successful search — highlights the matched atoms in
   * GraphNodes with the SEARCH_HIT_COLOR + scale pulse.
   */
  setSearchHits: (keys: string[]) => void;

  /**
   * Set the visibility filter. Pass an array to show only those atoms;
   * pass null to show everything (clears the filter).
   * Called by SearchBar after a successful search, cleared on reset.
   */
  setVisibleAtoms: (keys: string[] | null) => void;

  /** Store a fetched AtomDetailResponse for the side panel */
  cacheDetail: (key: string, detail: AtomDetailResponse) => void;

  /** Hard reset — clears all nodes, edges, and state */
  reset: () => void;
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  nodes: new Map(),
  edges: [],
  edgeKeys: new Set(), // KG-03
  expandedAtoms: new Set(),
  loadingAtoms: new Set(),
  selectedAtom: null,
  hoveredAtom: null,
  searchQuery: "",
  cachedDetails: new Map(),
  searchHits: new Set(),
  visibleAtoms: null,

  addNode: (key, anchor) => {
    const { nodes } = get();
    if (nodes.has(key)) return; // idempotent

    const pos = anchor ? nearPosition(anchor) : randomPosition();
    const newNode: KGNode = {
      key,
      label: parseLabel(key),
      type: parseAtomType(key),
      status: "loading",
      ...pos,
    };

    set((s) => {
      const next = new Map(s.nodes);
      next.set(key, newNode);
      return { nodes: next };
    });
  },

  addNodes: (keys, anchor) => {
    set((s) => {
      const next = new Map(s.nodes);
      let changed = false;
      for (const key of keys) {
        if (next.has(key)) continue;
        const pos = anchor ? nearPosition(anchor) : randomPosition();
        next.set(key, {
          key,
          label: parseLabel(key),
          type: parseAtomType(key),
          status: "loading",
          ...pos,
        });
        changed = true;
      }
      return changed ? { nodes: next } : {};
    });
  },

  /**
   * Batch add nodes already marked as "loaded". Single store update.
   * Avoids the 833× updateNodeStatus pattern that creates 833 Map copies.
   */
  addNodesLoaded: (keys, anchor) => {
    set((s) => {
      const next = new Map(s.nodes);
      let changed = false;
      for (const key of keys) {
        if (next.has(key)) continue;
        const pos = anchor ? nearPosition(anchor) : randomPosition();
        next.set(key, {
          key,
          label: parseLabel(key),
          type: parseAtomType(key),
          status: "loaded",
          ...pos,
        });
        changed = true;
      }
      return changed ? { nodes: next } : {};
    });
  },

  updateNodeStatus: (key, status) => {
    set((s) => {
      const node = s.nodes.get(key);
      if (!node) return {};
      const next = new Map(s.nodes);
      next.set(key, { ...node, status });
      return { nodes: next };
    });
  },

  /**
   * KG-03: O(k) deduplication using the persistent edgeKeys index.
   * Previously rebuilt a full Set from s.edges on every call — O(n).
   * Now checks against s.edgeKeys directly and updates both atomically.
   */
  addEdges: (newEdges) => {
    set((s) => {
      const toAdd = newEdges.filter((e) => !s.edgeKeys.has(`${e.source}→${e.target}`));
      if (toAdd.length === 0) return {};
      const nextKeys = new Set(s.edgeKeys);
      for (const e of toAdd) nextKeys.add(`${e.source}→${e.target}`);
      return { edges: [...s.edges, ...toAdd], edgeKeys: nextKeys };
    });
  },

  markExpanded: (key) => {
    set((s) => {
      const next = new Set(s.expandedAtoms);
      next.add(key);
      return { expandedAtoms: next };
    });
  },

  /**
   * KG-01: Batch expand — ONE Set clone instead of N.
   * Use this instead of calling markExpanded in a loop.
   */
  markExpandedBatch: (keys) => {
    set((s) => {
      const next = new Set(s.expandedAtoms);
      for (const key of keys) next.add(key);
      return { expandedAtoms: next };
    });
  },

  markLoading: (key, loading) => {
    set((s) => {
      const next = new Set(s.loadingAtoms);
      if (loading) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return { loadingAtoms: next };
    });
  },

  markLoadingBatch: (keys, loading) => {
    set((s) => {
      const next = new Set(s.loadingAtoms);
      for (const key of keys) {
        if (loading) {
          next.add(key);
        } else {
          next.delete(key);
        }
      }
      return { loadingAtoms: next };
    });
  },

  selectAtom: (key) => set({ selectedAtom: key }),

  hoverAtom: (key) => set({ hoveredAtom: key }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  setSearchHits: (keys) => set({ searchHits: new Set(keys) }),

  setVisibleAtoms: (keys) => set({ visibleAtoms: keys === null ? null : new Set(keys) }),

  /**
   * KG-16: LRU cap at 50 entries — evicts oldest on overflow.
   * Prevents unbounded Map growth from side-panel atom clicks.
   */
  cacheDetail: (key, detail) => {
    set((s) => {
      const next = new Map(s.cachedDetails);
      next.set(key, detail);
      if (next.size > 50) {
        const firstKey = next.keys().next().value;
        if (firstKey !== undefined) next.delete(firstKey);
      }
      return { cachedDetails: next };
    });
  },

  reset: () =>
    set({
      nodes: new Map(),
      edges: [],
      edgeKeys: new Set(), // KG-03
      expandedAtoms: new Set(),
      loadingAtoms: new Set(),
      selectedAtom: null,
      hoveredAtom: null,
      searchQuery: "",
      cachedDetails: new Map(),
      searchHits: new Set(),
      visibleAtoms: null,
    }),
}));
