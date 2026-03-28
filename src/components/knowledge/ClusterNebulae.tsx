"use client";

/**
 * ClusterNebulae — soft glowing clouds anchored to hub atoms.
 *
 * Visual concept: each semantic cluster (hub_mmpm_core, hub_corrections, etc.)
 * appears as a nebula — a diffuse, volumetric fog of colour that the member
 * atoms float inside. Hub atoms sit at the densest point of their cloud.
 * Clusters overlap at their boundaries, producing interference blends.
 *
 * Implementation:
 *   - One THREE.Sprite per hub node. Sprites always face the camera.
 *   - Texture: canvas-generated radial gradient, transparent at edge.
 *   - Blending: AdditiveBlending — nebulae add light, never occlude stars or nodes.
 *   - Positions updated imperatively in useFrame to track d3 simulation.
 *   - Scale grows with √(cluster size) so larger clusters occupy more visual space.
 *   - renderOrder -3: drawn before everything else in the scene.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useKnowledgeStore } from "@/stores/knowledge-store";
import type { ForceGraphHandle } from "./useForceGraph";
import type { KGNode, KGEdge } from "@/stores/knowledge-store";

/* ─── Hub colour palette ─────────────────────────────────────────────────── */
// Colours intentionally echo the Markov arc / structural edge palette so the
// nebula blends with its own cluster's edges.

const HUB_COLORS: Record<string, string> = {
  hub_mmpm_core:         "#22d3ee", // cyan   — matches Markov strong arc
  hub_mmpm_compute:      "#f97316", // amber  — matches depends_on edge
  hub_mmpm_testing:      "#2dd4bf", // teal   — matches derived_from edge
  hub_memory_procedures: "#a855f7", // purple — matches supersedes edge
  hub_sprint_state:      "#fbbf24", // gold   — matches cross-domain bridge arc
  hub_corrections:       "#ef4444", // red    — matches constrains edge
  hub_visualization:     "#38bdf8", // sky blue — matches references edge
};
const DEFAULT_HUB_COLOR = "#94a3b8"; // slate — unknown hubs

/** Return the nebula colour for a hub key, matching known suffixes */
function hubColor(key: string): string {
  for (const [suffix, color] of Object.entries(HUB_COLORS)) {
    if (key.includes(suffix)) return color;
  }
  return DEFAULT_HUB_COLOR;
}

/* ─── Texture factory ────────────────────────────────────────────────────── */

/**
 * Build a soft radial gradient canvas texture for a given hex colour.
 * The gradient: full alpha at centre → fully transparent at edge.
 * Cached by colour so we never create duplicate textures.
 */
function makeNebulaTex(hexColor: string): THREE.CanvasTexture {
  const SIZE = 256;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  const c = new THREE.Color(hexColor);
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);

  const half = SIZE / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  // Dense core → diffuse mid-cloud → invisible edge
  grad.addColorStop(0.00, `rgba(${r},${g},${b},0.30)`);
  grad.addColorStop(0.25, `rgba(${r},${g},${b},0.16)`);
  grad.addColorStop(0.55, `rgba(${r},${g},${b},0.06)`);
  grad.addColorStop(0.80, `rgba(${r},${g},${b},0.02)`);
  grad.addColorStop(1.00, `rgba(${r},${g},${b},0.00)`);

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

/** Base nebula radius in world units — ~3× the force graph link distance (18) */
const NEBULA_BASE_SCALE = 52;

/** Each additional cluster member adds √n × this to the nebula radius */
const NEBULA_GROWTH = 5.5;

/* ─── Component ─────────────────────────────────────────────────────────── */

interface ClusterNebulaeProps {
  handle: ForceGraphHandle;
}

export default function ClusterNebulae({ handle }: ClusterNebulaeProps) {
  const { simNodes, simEdges, isSettled } = handle;

  // Holds the THREE.Group that contains all sprite children
  const groupRef = useRef<THREE.Group>(null);

  // hub key → THREE.Sprite (created lazily as hubs appear in the sim)
  const spritesRef = useRef<Map<string, THREE.Sprite>>(new Map());

  // Texture cache — one texture per colour string, shared across sprites
  const texCacheRef = useRef<Map<string, THREE.CanvasTexture>>(new Map());

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    // ── Hide everything during an active search ─────────────────────────
    // The search view strips back to the focused connection graph — nebulae
    // add background noise that competes with the highlighted result set.
    const { visibleAtoms } = useKnowledgeStore.getState();
    if (visibleAtoms !== null) {
      for (const sprite of spritesRef.current.values()) sprite.visible = false;
      return;
    }

    const nodes = simNodes.current as KGNode[];
    const edges = simEdges.current as KGEdge[];

    // ── Identify hub nodes ──────────────────────────────────────────────
    const hubNodes = nodes.filter((n) => n.key?.includes("hub_"));

    // ── Compute cluster sizes from member_of edges ──────────────────────
    // Count how many edges point TO each hub (i.e. how many atoms belong to it).
    const clusterSize = new Map<string, number>();
    for (const hub of hubNodes) clusterSize.set(hub.key, 0);

    for (const e of edges) {
      // d3 resolves target from string → object after first tick
      const tgtKey =
        typeof e.target === "string" ? e.target : (e.target as KGNode).key;
      if (clusterSize.has(tgtKey)) {
        clusterSize.set(tgtKey, (clusterSize.get(tgtKey) ?? 0) + 1);
      }
    }

    // ── Create / update sprites ─────────────────────────────────────────
    const seenKeys = new Set<string>();

    for (const hub of hubNodes) {
      seenKeys.add(hub.key);

      let sprite = spritesRef.current.get(hub.key);

      if (!sprite) {
        // First time we've seen this hub — create its nebula sprite
        const color = hubColor(hub.key);

        // Lazy-create and cache the texture
        let tex = texCacheRef.current.get(color);
        if (!tex) {
          tex = makeNebulaTex(color);
          texCacheRef.current.set(color, tex);
        }

        const mat = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });

        sprite = new THREE.Sprite(mat);
        sprite.renderOrder = -3; // behind glow (-2) and main edge layer (-1)
        group.add(sprite);
        spritesRef.current.set(hub.key, sprite);
      }

      // Track hub position (d3 mutates x/y/z directly on the node object)
      sprite.position.set(hub.x ?? 0, hub.y ?? 0, hub.z ?? 0);

      // Scale nebula with cluster population — √n growth keeps large clusters
      // from overwhelming the canvas while still visually differentiating them.
      const members = clusterSize.get(hub.key) ?? 0;
      const scale = NEBULA_BASE_SCALE + Math.sqrt(members) * NEBULA_GROWTH;
      sprite.scale.set(scale, scale, 1);
      sprite.visible = true;
    }

    // ── Hide sprites for hubs that have left the sim ────────────────────
    for (const [key, sprite] of spritesRef.current) {
      if (!seenKeys.has(key)) sprite.visible = false;
    }
  });

  return <group ref={groupRef} />;
}
