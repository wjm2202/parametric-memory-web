/**
 * Knowledge Graph API utilities.
 *
 * All calls proxy through /api/memory/* — the same routes used by the
 * Substrate Viewer. No new server endpoints needed.
 *
 * Four endpoints used:
 *   GET  /api/memory/atoms            → full atom list (same as Substrate Viewer bootstrap)
 *   POST /api/memory/search           → seed the ego graph from a query
 *   GET  /api/memory/weights/:atom    → Markov arc weights (effectiveWeight)
 *   GET  /api/memory/atoms/:atom      → full detail for side panel
 *
 * KG-14: All fetch calls include AbortSignal.timeout(10_000) — 10s max wait.
 *        Prevents infinite loading skeleton on server hang or network degradation.
 * KG-13: fetchAtomGraph uses next: { revalidate: 30 } — 30s stale-while-revalidate.
 *        The graph changes only on checkpoint; no need to hit origin on every page load.
 */

import type {
  SearchResponse,
  WeightsResponse,
  AtomDetailResponse,
  AtomListItem,
  AtomWithEdges,
  AtomGraphResponse,
} from "@/types/memory";

/* ─── Constants ─────────────────────────────────────────────────────────── */

/** KG-14: Hard timeout for all MMPM API calls */
const REQUEST_TIMEOUT_MS = 10_000;

/* ─── Key extraction ─────────────────────────────────────────────────────── */

/**
 * MMPM search returns full atom strings: "v1.fact.key=value" or "v1.fact.key = value".
 * The atoms list and weights endpoint use only the key: "v1.fact.key".
 *
 * This function extracts the key portion (everything before the first `=`, trimmed).
 * If there is no `=`, the string is already a key and is returned as-is.
 */
export function extractAtomKey(fullAtom: string): string {
  const eqIdx = fullAtom.indexOf("=");
  if (eqIdx === -1) return fullAtom.trim();
  return fullAtom.slice(0, eqIdx).trim();
}

/* ─── Full atom list ────────────────────────────────────────────────────── */

/**
 * Fetch the complete atom list — same as the Substrate Viewer's bootstrap.
 * Returns every atom in the memory system with its active/tombstoned status.
 */
export async function fetchAllAtoms(): Promise<AtomListItem[]> {
  const res = await fetch("/api/memory/atoms", {
    method: "GET",
    cache: "no-store",
    // KG-14: timeout guard
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Atom list fetch failed: ${res.status}`);
  }

  const data: { atoms: AtomListItem[]; treeVersion: number } = await res.json();
  return data.atoms;
}

/* ─── Full graph (atoms + edges) ────────────────────────────────────────── */

/**
 * Fetch the complete atom graph — atoms AND their outgoing Markov edges —
 * in a single HTTP request.
 *
 * Uses GET /atoms?includeWeights=true which enriches each atom entry with
 * an `edges` array of outgoing transitions (to, weight, effectiveWeight).
 *
 * This replaces the previous N+1 loading pattern:
 *   1× GET /atoms  +  N× GET /weights/:atom
 * with:
 *   1× GET /atoms?includeWeights=true
 *
 * For 833 atoms this eliminates ~833 HTTP round trips, reducing total load
 * time from ~35 seconds (progressive batch) to ~1 second (single request).
 * Critical for mobile where per-request overhead dominates.
 *
 * Only active (effectiveWeight > 0) transitions are included server-side
 * to keep payload size reasonable.
 *
 * KG-13: Uses next: { revalidate: 30 } instead of cache: 'no-store'.
 *   The atom graph only changes when a checkpoint runs — serving a cached
 *   response to concurrent visitors eliminates redundant origin hits.
 *   A 30s stale window is invisible to users but critical at scale.
 *
 * KG-14: Combines caller's AbortSignal with a 10s timeout signal.
 *   If the MMPM server hangs, the fetch aborts after 10s rather than
 *   leaving the page stuck on the loading skeleton indefinitely.
 */
export async function fetchAtomGraph(
  signal?: AbortSignal,
): Promise<{ atoms: AtomWithEdges[]; treeVersion: number }> {
  // KG-14: Combine caller abort + hard timeout
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const res = await fetch("/api/memory/atoms?includeWeights=true", {
    method: "GET",
    // KG-13: 30s revalidation — one origin request serves many concurrent visitors.
    // Keep no-store on interactive/user-specific endpoints below.
    next: { revalidate: 30 },
    signal: combinedSignal,
  });

  if (!res.ok) {
    throw new Error(`Atom graph fetch failed: ${res.status}`);
  }

  const data: AtomGraphResponse = await res.json();
  return data;
}

/* ─── Search ────────────────────────────────────────────────────────────── */

export interface SearchHit {
  atom: string;
  similarity: number;
}

/**
 * Semantic search — returns top N atom keys ranked by similarity.
 * Used to seed the ego graph from a user query.
 *
 * NOTE: MMPM search returns full atom strings ("v1.fact.key=value").
 * We extract just the key since that's what weights/atoms endpoints accept.
 */
export async function searchAtoms(query: string, limit = 5): Promise<SearchHit[]> {
  const res = await fetch("/api/memory/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit }),
    cache: "no-store",
    // KG-14: timeout guard — search is interactive, user is waiting
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Search failed: ${res.status}`);
  }

  const data: SearchResponse = await res.json();
  return data.results.slice(0, limit).map((r) => ({
    atom: extractAtomKey(r.atom),
    similarity: r.similarity,
  }));
}

/* ─── Weights ───────────────────────────────────────────────────────────── */

/**
 * Fetch Markov arc weights for a single atom.
 *
 * Returns outgoing transitions with effectiveWeight (decay-adjusted).
 * This is the correct call for edge data — never use atom detail for edges
 * because detail doesn't return effectiveWeight.
 *
 * Used for expand-on-click in Sprint 2 (not the initial seed — that uses fetchAtomGraph).
 */
export async function fetchAtomWeights(atom: string): Promise<WeightsResponse> {
  const res = await fetch(`/api/memory/weights/${encodeURIComponent(atom)}`, {
    method: "GET",
    cache: "no-store",
    // KG-14: timeout guard
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Weights fetch failed for ${atom}: ${res.status}`);
  }

  return res.json();
}

/* ─── Atom detail ───────────────────────────────────────────────────────── */

/**
 * Fetch full atom detail — used for the side panel only.
 *
 * Includes: contradiction info, Merkle proof, creation timestamp, status.
 * Cached in the knowledge store to avoid re-fetching on re-select.
 */
export async function fetchAtomDetail(atom: string): Promise<AtomDetailResponse> {
  const res = await fetch(`/api/memory/atoms/${encodeURIComponent(atom)}`, {
    method: "GET",
    cache: "no-store",
    // KG-14: timeout guard
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Atom detail fetch failed for ${atom}: ${res.status}`);
  }

  return res.json();
}

/* ─── Expand helper ─────────────────────────────────────────────────────── */

export interface ExpandResult {
  /** Atom names that are new to the graph (not previously known) */
  newAtoms: string[];
  /** All outgoing edges from the expanded atom */
  edges: Array<{
    source: string;
    target: string;
    weight: number;
    effectiveWeight: number;
  }>;
}

/**
 * Expand an atom — fetch its outgoing Markov arcs and return structured data
 * for the store. The caller is responsible for adding nodes and edges.
 *
 * Filters out zero-weight transitions (atoms that were trained once then decayed).
 */
export async function expandAtom(
  atom: string,
  existingKeys: Set<string>,
  minEffectiveWeight = 0.01,
): Promise<ExpandResult> {
  const weights = await fetchAtomWeights(atom);

  const edges = weights.transitions
    .filter((t) => t.effectiveWeight >= minEffectiveWeight)
    .map((t) => ({
      source: atom,
      target: t.to,
      weight: t.weight,
      effectiveWeight: t.effectiveWeight,
    }));

  const newAtoms = edges.map((e) => e.target).filter((key) => !existingKeys.has(key));

  return { newAtoms, edges };
}
