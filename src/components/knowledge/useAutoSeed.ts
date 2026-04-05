"use client";

/**
 * useAutoSeed — Single-request graph loader for the knowledge graph.
 *
 * Fetches the complete graph (atoms + Markov edges) in ONE HTTP request
 * using GET /atoms?includeWeights=true.  This server-side enrichment
 * replaces the previous N+1 loading pattern:
 *
 *   Before (N+1):  1× GET /atoms  +  833× GET /weights/:atom  ≈ 35s
 *   After  (1):    1× GET /atoms?includeWeights=true            ≈ 1s
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Single request: GET /api/memory/atoms?includeWeights=true          │
 * │   → Server returns atoms + outgoing Markov edges per atom          │
 * │   → addNodesLoaded() — ONE store update for ALL nodes              │
 * │   → addEdges()       — ONE store update for ALL edges              │
 * │   → Simulation receives full graph, starts settling immediately    │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Key properties:
 *   1. Single HTTP round trip — eliminates per-request overhead on mobile
 *   2. TWO store updates total (nodes + edges) — minimal React re-renders
 *   3. Server does the heavy lifting (weights are in-memory CSR matrices)
 *   4. AbortController cancels the fetch on component unmount
 *   5. Atoms filtered to active-only; edges filtered to effectiveWeight > 0
 *
 * Payload size for ~833 atoms with sparse edges: ~80-120 KB JSON
 * (well within mobile network budgets, smaller than a typical image).
 */

import { useEffect, useRef } from "react";
import { useKnowledgeStore } from "@/stores/knowledge-store";
import {
  fetchAtomGraph,
  fetchAllStructuralEdges,
  fetchPoincareCoords,
  extractAtomKey,
} from "@/lib/knowledge-api";
import type { StructuralEdgeType } from "@/types/memory";

/* ─── Constants ──────────────────────────────────────────────────────── */

/**
 * Minimum effectiveWeight to include an edge in the graph.
 * Edges below this threshold are decayed arcs that would add visual noise
 * without conveying meaningful relationships.
 */
const MIN_EDGE_WEIGHT = 0.01;

/* ─── Hook ───────────────────────────────────────────────────────────── */

export function useAutoSeed() {
  const seeded = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const addNodesLoadedWithPoincare = useKnowledgeStore((s) => s.addNodesLoadedWithPoincare);
  const addEdges = useKnowledgeStore((s) => s.addEdges);
  // KG-01: batch action — one Set clone instead of N individual markExpanded calls
  const markExpandedBatch = useKnowledgeStore((s) => s.markExpandedBatch);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    seed(controller.signal);

    return () => {
      controller.abort();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Main seed function ────────────────────────────────────────── */

  async function seed(signal: AbortSignal) {
    try {
      // Parallel fetch: atoms + structural edges + poincaré in one round-trip batch.
      // fetchAllStructuralEdges and fetchPoincareCoords are non-fatal — failures
      // return empty results so the Markov-only graph still loads cleanly.
      const [atomResult, structEdges, poincareMap] = await Promise.all([
        fetchAtomGraph(signal),
        fetchAllStructuralEdges(),
        fetchPoincareCoords(),
      ]);

      if (signal.aborted || atomResult.atoms.length === 0) return;

      // Filter to active atoms and extract keys
      const activeAtoms = atomResult.atoms.filter((a) => a.status === "active");
      const atomKeys = activeAtoms.map((a) => extractAtomKey(a.atom));

      // Build a set of known keys for edge validation
      const knownKeys = new Set(atomKeys);

      // ── Store update 1: ALL nodes in one call ──
      // Prefer poincaré from the atoms response; fall back to the bulk poincaré
      // endpoint if the per-atom field is missing (cold embedding cache).
      const nodeItems = activeAtoms.map((a) => {
        const key = extractAtomKey(a.atom);
        const poincare = a.poincare ?? (poincareMap.has(key) ? poincareMap.get(key)! : null);
        return { key, poincare };
      });
      addNodesLoadedWithPoincare(nodeItems);

      // ── Collect Markov edges from the atoms payload ──
      const allEdges: Array<{
        source: string;
        target: string;
        weight: number;
        effectiveWeight: number;
        kind?: "markov" | "structural";
        edgeType?: StructuralEdgeType;
      }> = [];

      for (const atom of activeAtoms) {
        const sourceKey = extractAtomKey(atom.atom);

        if (atom.edges && atom.edges.length > 0) {
          for (const edge of atom.edges) {
            if (edge.effectiveWeight >= MIN_EDGE_WEIGHT && knownKeys.has(edge.to)) {
              allEdges.push({
                source: sourceKey,
                target: edge.to,
                weight: edge.weight,
                effectiveWeight: edge.effectiveWeight,
                kind: "markov",
              });
            }
          }
        }
      }

      // ── Append structural KG edges (member_of, supersedes, depends_on, etc.) ──
      // These are the authored, non-decaying edges that give the graph its structure.
      // Only include edges where both endpoints exist in the current atom set.
      for (const e of structEdges) {
        if (knownKeys.has(e.source) && knownKeys.has(e.target)) {
          allEdges.push({
            source: e.source,
            target: e.target,
            weight: 0,
            effectiveWeight: 0,
            kind: "structural",
            edgeType: e.type as StructuralEdgeType,
          });
        }
      }

      if (signal.aborted) return;

      // ── Store update 2: ALL edges in one call ──
      if (allEdges.length > 0) {
        addEdges(allEdges);
      }

      // ── KG-01: mark ALL atoms expanded in ONE store update ──
      markExpandedBatch(atomKeys);

      const markovCount = allEdges.filter((e) => e.kind === "markov").length;
      const structCount = allEdges.filter((e) => e.kind === "structural").length;
      const poincareCount = nodeItems.filter((n) => n.poincare != null).length;
      console.log(
        `[useAutoSeed] Graph loaded: ${atomKeys.length} nodes, ` +
          `${markovCount} Markov arcs, ${structCount} structural edges, ` +
          `${poincareCount} poincaré coords (single parallel request)`,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("[useAutoSeed] Failed to seed knowledge graph:", err);
      }
    }
  }
}
