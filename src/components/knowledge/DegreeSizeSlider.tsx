"use client";

/**
 * DegreeSizeSlider — controls how strongly node connection count (degree)
 * influences atom size in the Knowledge Graph.
 *
 * At 0%: all atoms render at their base Poincaré-derived size.
 * At 100%: hub atoms (hundreds of connections) are up to 3.5× larger than
 * leaf atoms — making the root structure of each semantic cluster immediately
 * visible from across the canvas.
 *
 * Styled to match the ViewToggle / dark-glass UI language of the /knowledge page.
 */

import { useKnowledgeStore } from "@/stores/knowledge-store";

export default function DegreeSizeSlider() {
  const degreeInfluence = useKnowledgeStore((s) => s.degreeInfluence);
  const setDegreeInfluence = useKnowledgeStore((s) => s.setDegreeInfluence);

  const pct = Math.round(degreeInfluence * 100);

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-white/8 bg-black/50 px-3 py-2.5 backdrop-blur-md">
      {/* Label row */}
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-[10px] tracking-widest text-slate-400 uppercase">
          Node Weight
        </span>
        <span
          className="font-mono text-[10px] tabular-nums text-violet-300"
          aria-live="polite"
        >
          {pct}%
        </span>
      </div>

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={degreeInfluence}
        onChange={(e) => setDegreeInfluence(parseFloat(e.target.value))}
        aria-label="Node weight by connection count"
        className="
          h-1 w-40 cursor-pointer appearance-none rounded-full
          bg-white/10
          accent-violet-400
          focus:outline-none
          [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:w-3
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-violet-400
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:shadow-[0_0_6px_2px_rgba(167,139,250,0.45)]
          [&::-moz-range-thumb]:h-3
          [&::-moz-range-thumb]:w-3
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:border-0
          [&::-moz-range-thumb]:bg-violet-400
        "
      />
    </div>
  );
}
