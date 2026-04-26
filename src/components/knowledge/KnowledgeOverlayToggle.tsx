"use client";

/**
 * KnowledgeOverlayToggle — top-right control panel for the /knowledge page.
 *
 * Two checkboxes that hide/show the on-canvas overlays:
 *   - "Search"  → toggles the SearchBar (top-centre)
 *   - "Weight"  → toggles the DegreeSizeSlider + ViewToggle (bottom-left)
 *
 * Why this exists (sprint 2026-W17): the user wants a clean canvas frame
 * for recording a hero video of the substrate. Hiding the overlays mid-
 * recording is faster than scrubbing them out in post.
 *
 * Mobile fix (sprint 2026-W17 follow-up): the original two-row layout
 * with a title row was eating ~110px of vertical space on phones, pushing
 * the substrate graph down into the bottom half of the screen. Now it's
 * a single horizontal pill — title dropped, checkboxes inline, smaller
 * padding — that occupies ~36px of height. The label text drops on the
 * narrowest screens (sm:inline) so the icons-and-labels fit.
 *
 * State is owned by KnowledgeClient (parent) — keeps the overlays' visibility
 * outside the Zustand store so we don't pollute the knowledge graph state
 * machine with a UI concern.
 *
 * Styling matches DegreeSizeSlider (dark-glass + rounded-full + violet
 * accent) so the page reads as one coherent control surface.
 */

interface KnowledgeOverlayToggleProps {
  showSearch: boolean;
  showWeight: boolean;
  onToggleSearch: (next: boolean) => void;
  onToggleWeight: (next: boolean) => void;
}

interface CheckboxRowProps {
  label: string;
  testid: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

function CheckboxRow({ label, testid, checked, onChange }: CheckboxRowProps) {
  return (
    <label
      className="flex cursor-pointer items-center gap-1.5 select-none"
      data-testid={`${testid}-label`}
    >
      <input
        type="checkbox"
        data-testid={testid}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        // h-4 w-4 → 16px box; native checkbox keeps OS-level a11y/keyboard.
        // accent-violet-400 colours the tick on browsers that respect it
        // (Chromium/Firefox 92+); Safari falls back to its system tint.
        className="h-4 w-4 cursor-pointer rounded border-white/30 bg-white/5 accent-violet-400 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030712] focus-visible:outline-none"
      />
      <span className="font-mono text-[10px] tracking-widest text-slate-300 uppercase">
        {label}
      </span>
    </label>
  );
}

export default function KnowledgeOverlayToggle({
  showSearch,
  showWeight,
  onToggleSearch,
  onToggleWeight,
}: KnowledgeOverlayToggleProps) {
  return (
    <div
      data-testid="knowledge-overlay-toggle"
      // Pinned to the very top-right of the canvas. top-2 (8px) on mobile,
      // top-3 (12px) on sm+ — sits as close to the navbar as legible.
      // Horizontal pill: gap-3 between checkboxes, px-3 + py-1.5 keeps the
      // total height ~32-36px on mobile so the graph isn't pushed off-screen.
      className="absolute top-2 right-2 z-20 flex items-center gap-3 rounded-full border border-white/8 bg-black/55 px-3 py-1.5 backdrop-blur-md sm:top-3 sm:right-3 sm:gap-4"
    >
      <CheckboxRow
        label="Search"
        testid="knowledge-toggle-search"
        checked={showSearch}
        onChange={onToggleSearch}
      />
      <CheckboxRow
        label="Weight"
        testid="knowledge-toggle-weight"
        checked={showWeight}
        onChange={onToggleWeight}
      />
    </div>
  );
}
