"use client";

/**
 * ViewToggle — Sprint 5.5: Switch between semantic and provenance layout modes.
 *
 * "Semantic" (default): Poincaré-derived layout — atoms positioned by embedding
 * similarity within domain angular sectors. Colour from Poincaré hue.
 *
 * "Provenance": Tree layout — strong attraction along member_of and produced_by
 * edges. Atoms cluster around their task, tasks around their domain.
 * Cross-domain bridges visible as long arcs.
 *
 * Both views use the same data. The toggle only changes the force configuration
 * and initial positions. No additional API calls.
 */

import { useKnowledgeStore, type LayoutMode } from "@/stores/knowledge-store";

const modes: { value: LayoutMode; label: string; icon: string }[] = [
  { value: "semantic", label: "Semantic", icon: "◎" },
  { value: "provenance", label: "Provenance", icon: "⊞" },
];

export default function ViewToggle() {
  const layoutMode = useKnowledgeStore((s) => s.layoutMode);
  const setLayoutMode = useKnowledgeStore((s) => s.setLayoutMode);

  return (
    <div className="flex items-center gap-1 rounded-lg bg-slate-900/80 p-1 ring-1 ring-white/10 backdrop-blur-sm">
      {modes.map((mode) => (
        <button
          key={mode.value}
          onClick={() => setLayoutMode(mode.value)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs transition-all ${
            layoutMode === mode.value
              ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <span className="text-sm">{mode.icon}</span>
          {mode.label}
        </button>
      ))}
    </div>
  );
}
