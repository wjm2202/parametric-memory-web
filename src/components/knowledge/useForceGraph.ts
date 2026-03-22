"use client";

/**
 * useForceGraph — 3D force-directed simulation hook.
 *
 * Owns the d3-force-3d simulation lifecycle. Syncs store nodes/edges into
 * the sim when the graph changes, and ticks the sim inside useFrame so
 * positions update in lockstep with the render loop.
 *
 * CRITICAL RULES (from sprint plan):
 *   1. Sim lives in a useRef — it is imperative, never in state.
 *   2. Tick inside useFrame — never setInterval/setTimeout.
 *   3. New nodes MUST be seeded near the clicked node, not at origin.
 *   4. Call simulation.alpha(n) after adding nodes — do NOT call .restart().
 *   5. Position buffer reads happen from simNodes.current, not from Zustand.
 */

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
} from "d3-force-3d";
import type { Simulation, LinkForce, SimLink } from "d3-force-3d";
import { useKnowledgeStore, type KGNode, type KGEdge } from "@/stores/knowledge-store";

/* ─── Return type ───────────────────────────────────────────────────────── */

export interface ForceGraphHandle {
  /**
   * Live reference to the node array the simulation is operating on.
   * Positions (x, y, z) are mutated in place every tick.
   * Read these in useFrame — do NOT read from Zustand.
   */
  simNodes: React.MutableRefObject<KGNode[]>;
  /**
   * Live reference to the resolved edge array.
   * source/target are node object references after the sim initialises.
   */
  simEdges: React.MutableRefObject<KGEdge[]>;
  /** True once alpha drops below alphaMin (graph has settled) */
  isSettled: React.MutableRefObject<boolean>;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

const ALPHA_MIN = 0.005;
const ALPHA_DECAY = 0.015;       // slower decay → more time to settle
const VELOCITY_DECAY = 0.35;     // slightly less damping for smoother spread
/**
 * Charge: -30 with distanceMax=120 avoids O(n²) blowup from distant
 * nodes while still giving enough repulsion for 500-1000 atom graphs.
 * The distanceMax is critical — without it, charge on 800+ nodes is O(n²)
 * and either too weak (small value) or explodes the graph (large value).
 */
const CHARGE_STRENGTH = -30;
const CHARGE_DISTANCE_MAX = 120;
const LINK_DISTANCE = 18;

/* ─── Hook ───────────────────────────────────────────────────────────────── */

export function useForceGraph(): ForceGraphHandle {
  const simNodes = useRef<KGNode[]>([]);
  const simEdges = useRef<KGEdge[]>([]);
  const isSettled = useRef<boolean>(false);

  // Typed refs for the simulation and link force
  const simRef = useRef<Simulation<KGNode> | null>(null);
  const linkForceRef = useRef<LinkForce<KGNode> | null>(null);

  // Track store collection sizes to detect when to re-sync the sim
  const nodeCount = useKnowledgeStore((s) => s.nodes.size);
  const edgeCount = useKnowledgeStore((s) => s.edges.length);

  /* ── Initialise simulation once ─────────────────────────────────────── */
  useEffect(() => {
    const lf = forceLink<KGNode>([])
      .id((d) => d.key)
      .distance(LINK_DISTANCE)
      .strength((link) => {
        const ew = (link as unknown as KGEdge).effectiveWeight ?? 0.5;
        return Math.min(ew * 2, 1.0);
      });

    const sim = forceSimulation<KGNode>([])
      .numDimensions(3)
      .force("link", lf)
      .force("charge", forceManyBody().strength(CHARGE_STRENGTH).distanceMax(CHARGE_DISTANCE_MAX))
      .force("center", forceCenter(0, 0, 0))
      .alphaMin(ALPHA_MIN)
      .alphaDecay(ALPHA_DECAY)
      .velocityDecay(VELOCITY_DECAY)
      .stop(); // we tick manually in useFrame

    simRef.current = sim;
    linkForceRef.current = lf;

    return () => {
      sim.stop();
    };
  }, []); // only runs once

  /* ── Sync store → simulation when graph changes ─────────────────────── */
  useEffect(() => {
    const sim = simRef.current;
    const lf = linkForceRef.current;
    if (!sim || !lf) return;

    const storeState = useKnowledgeStore.getState();
    const nodeArray = Array.from(storeState.nodes.values());
    const edgeArray = storeState.edges;

    // CRITICAL: Preserve d3's computed positions on new node objects.
    // When updateNodeStatus/addEdges triggers a re-sync, the store
    // returns fresh spread copies that have the ORIGINAL random positions.
    // We must copy d3's mutated x/y/z/vx/vy/vz onto the new objects
    // so the sim doesn't reset to initial positions on every edge add.
    const prevNodes = simNodes.current;
    if (prevNodes.length > 0) {
      const prevByKey = new Map(prevNodes.map((n) => [n.key, n]));
      for (const node of nodeArray) {
        const prev = prevByKey.get(node.key);
        if (prev) {
          node.x = prev.x;
          node.y = prev.y;
          node.z = prev.z;
          if (prev.vx !== undefined) node.vx = prev.vx;
          if (prev.vy !== undefined) node.vy = prev.vy;
          if (prev.vz !== undefined) node.vz = prev.vz;
        }
      }
    }

    sim.nodes(nodeArray);

    // Link force needs plain {source, target} with the id key matching node.key
    lf.links(
      edgeArray.map((e) => ({
        source: e.source,
        target: e.target,
        effectiveWeight: e.effectiveWeight,
        weight: e.weight,
      })) as SimLink<KGNode>[],
    );

    simNodes.current = nodeArray;
    simEdges.current = edgeArray;

    // Reheat: gentle for edge-only changes, stronger for new nodes
    const prevCount = prevNodes.length;
    const newNodeCount = nodeArray.length - prevCount;
    const reheated = newNodeCount > 0 ? 0.5 : edgeArray.length > 0 ? 0.15 : 0;
    if (reheated > 0) {
      isSettled.current = false;
      sim.alpha(reheated);
    }
  }, [nodeCount, edgeCount]);

  /* ── Tick in render loop ────────────────────────────────────────────── */
  // Priority -1: runs BEFORE GraphNodes/GraphEdges (priority 0) so
  // positions are fresh when rendering reads them.
  useFrame(() => {
    const sim = simRef.current;
    if (!sim || isSettled.current) return;

    sim.tick();

    if (sim.alpha() < ALPHA_MIN) {
      isSettled.current = true;
    }
  }, -1);

  return { simNodes, simEdges, isSettled };
}
