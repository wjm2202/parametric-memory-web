/**
 * L2CacheInfographic
 *
 * Animated, self-contained inline-SVG diagram for the landing hero.
 * Tells one 9-second loop:
 *
 *   1. A prompt arrives at the AI model.
 *   2. The model's own weights (L1) only give a generic answer.
 *   3. The MMPM substrate (L2) is consulted — domain atoms light up,
 *      the Merkle root verifies, atoms flow into the context window.
 *   4. A grounded answer returns to the user.
 *   5. A checkpoint writes back — the substrate grows (memory compounds).
 *
 * Zero JS at runtime: motion is CSS keyframes + CSS Motion Path
 * (`offset-path`) on SVG groups. Under `prefers-reduced-motion` the
 * component renders a composed static frame instead of animating.
 *
 * All timing is expressed as percentages of one CYCLE so the loop
 * length can be tuned in one place.
 */

export const L2_CYCLE_S = 9;

/** Caption shown for each phase (also used by tests). */
export const L2_CAPTIONS = [
  "Prompt arrives",
  "Weights alone (L1): a generic answer",
  "L2 hit: context primed from the prompt · 4 atoms · a few hundred tokens",
  "Answer grounded in your domain",
  "Checkpoint: memory compounds for next time",
] as const;

export const L2_STATIC_CAPTION =
  "Prompt → L1 weights → L2 substrate recall (verified) → grounded answer → checkpoint";

// ── Geometry ───────────────────────────────────────────────────────────────

const P_PROMPT = "M 96 200 L 200 200";
const P_ANSWER = "M 200 200 L 96 200";
const P_RECALL = "M 400 180 L 440 180";
const P_RETURN = "M 440 215 L 400 215";

/** Atom grid inside the substrate box. Index 11 is the "new" atom. */
const ATOMS: ReadonlyArray<readonly [number, number]> = [
  [480, 130],
  [530, 130],
  [580, 130],
  [480, 175],
  [530, 175],
  [580, 175],
  [480, 220],
  [530, 220],
  [580, 220],
  [480, 265],
  [530, 265],
  [580, 265], // new atom — appears on checkpoint
];
const HIT = new Set([0, 4, 5, 9]); // atoms recalled on the L2 hit
const NEW_ATOM = 11;

const EDGES: ReadonlyArray<readonly [number, number, boolean]> = [
  // [from, to, isHitEdge]
  [0, 4, true],
  [4, 5, true],
  [4, 9, true],
  [1, 2, false],
  [3, 6, false],
  [2, 5, false],
  [7, 10, false],
  [6, 7, false],
  [8, 5, false],
];
const NEW_EDGE: readonly [number, number] = [5, NEW_ATOM];

// ── Styles ─────────────────────────────────────────────────────────────────

const css = `
.l2 { --l2-cycle: ${L2_CYCLE_S}s; --l2-blue:#36aaf5; --l2-cyan:#22d3ee; --l2-amber:#f59e0b; }
.l2 svg { width:100%; height:auto; display:block; overflow:visible; }
.l2 .l2-mono { font-family: var(--font-mono, ui-monospace, monospace); }

/* packets ----------------------------------------------------------------- */
.l2 .l2-pk { opacity:0; offset-rotate:0deg; animation: var(--l2-cycle) linear infinite; }
.l2 .l2-pk-q   { offset-path: path("${P_PROMPT}"); animation-name: l2-pk-q; }
.l2 .l2-pk-req { offset-path: path("${P_RECALL}"); animation-name: l2-pk-req; }
.l2 .l2-pk-r1  { offset-path: path("${P_RETURN}"); animation-name: l2-pk-r1; }
.l2 .l2-pk-r2  { offset-path: path("${P_RETURN}"); animation-name: l2-pk-r2; }
.l2 .l2-pk-r3  { offset-path: path("${P_RETURN}"); animation-name: l2-pk-r3; }
.l2 .l2-pk-ans { offset-path: path("${P_ANSWER}"); animation-name: l2-pk-ans; }
.l2 .l2-pk-cp  { offset-path: path("${P_RECALL}"); animation-name: l2-pk-cp; }

@keyframes l2-pk-q   { 0%{offset-distance:0%;opacity:0} 1%{opacity:1} 12%{offset-distance:100%;opacity:1} 13%,100%{offset-distance:100%;opacity:0} }
@keyframes l2-pk-req { 0%,17%{offset-distance:0%;opacity:0} 18%{opacity:1} 26%{offset-distance:100%;opacity:1} 27%,100%{offset-distance:100%;opacity:0} }
@keyframes l2-pk-r1  { 0%,41%{offset-distance:0%;opacity:0} 42%{opacity:1} 49%{offset-distance:100%;opacity:1} 50%,100%{offset-distance:100%;opacity:0} }
@keyframes l2-pk-r2  { 0%,43%{offset-distance:0%;opacity:0} 44%{opacity:1} 51%{offset-distance:100%;opacity:1} 52%,100%{offset-distance:100%;opacity:0} }
@keyframes l2-pk-r3  { 0%,45%{offset-distance:0%;opacity:0} 46%{opacity:1} 53%{offset-distance:100%;opacity:1} 54%,100%{offset-distance:100%;opacity:0} }
@keyframes l2-pk-ans { 0%,54%{offset-distance:0%;opacity:0} 55%{opacity:1} 66%{offset-distance:100%;opacity:1} 67%,100%{offset-distance:100%;opacity:0} }
@keyframes l2-pk-cp  { 0%,69%{offset-distance:0%;opacity:0} 70%{opacity:1} 78%{offset-distance:100%;opacity:1} 79%,100%{offset-distance:100%;opacity:0} }

/* model: L1 pulse + context window fill ------------------------------------ */
.l2 .l2-l1-pulse { opacity:0; animation: l2-l1 var(--l2-cycle) linear infinite; }
@keyframes l2-l1 { 0%,13%{opacity:0} 15%{opacity:1} 19%{opacity:.35} 22%{opacity:1} 27%,100%{opacity:0} }
/* recall PRIMES the context: a thin bright sliver on a long, mostly-empty track */
.l2 .l2-ctx { transform-origin: 228px 242px; transform: scaleX(1); animation: l2-ctx var(--l2-cycle) linear infinite; }
@keyframes l2-ctx { 0%,45%{transform:scaleX(0)} 49%,95%{transform:scaleX(1)} 100%{transform:scaleX(0)} }
.l2 .l2-primed { opacity:1; animation: l2-primed var(--l2-cycle) linear infinite; }
@keyframes l2-primed { 0%,48%{opacity:0} 50%,95%{opacity:1} 100%{opacity:0} }

/* substrate: atoms, edges, root -------------------------------------------- */
.l2 .l2-atom { opacity:.35; }
.l2 .l2-hit  { opacity:1; animation: var(--l2-cycle) linear infinite; }
.l2 .l2-hit-0 { animation-name: l2-hit-0 } .l2 .l2-hit-1 { animation-name: l2-hit-1 }
.l2 .l2-hit-2 { animation-name: l2-hit-2 } .l2 .l2-hit-3 { animation-name: l2-hit-3 }
@keyframes l2-hit-0 { 0%,28%{opacity:.35} 30%,95%{opacity:1} 100%{opacity:.35} }
@keyframes l2-hit-1 { 0%,31%{opacity:.35} 33%,95%{opacity:1} 100%{opacity:.35} }
@keyframes l2-hit-2 { 0%,34%{opacity:.35} 36%,95%{opacity:1} 100%{opacity:.35} }
@keyframes l2-hit-3 { 0%,37%{opacity:.35} 39%,95%{opacity:1} 100%{opacity:.35} }
.l2 .l2-edge { opacity:.18; }
.l2 .l2-edge-hit { opacity:1; animation: l2-edge-hit var(--l2-cycle) linear infinite; }
@keyframes l2-edge-hit { 0%,30%{opacity:.18} 39%,95%{opacity:1} 100%{opacity:.18} }
.l2 .l2-root { opacity:1; animation: l2-root var(--l2-cycle) linear infinite; }
@keyframes l2-root { 0%,39%{opacity:.3} 41%,95%{opacity:1} 100%{opacity:.3} }
.l2 .l2-new { transform-box: fill-box; transform-origin: center; opacity:1; animation: l2-new var(--l2-cycle) linear infinite; }
@keyframes l2-new { 0%,79%{opacity:0;transform:scale(0)} 81%{opacity:1;transform:scale(1.4)} 83%,95%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(0)} }

/* user glow on grounded answer --------------------------------------------- */
.l2 .l2-user-glow { opacity:1; animation: l2-user var(--l2-cycle) linear infinite; }
@keyframes l2-user { 0%,65%{opacity:0} 67%,95%{opacity:1} 100%{opacity:0} }

/* captions (HTML, below the SVG) ------------------------------------------- */
.l2 .l2-caps { position:relative; height:1.6em; }
.l2 .l2-cap { position:absolute; inset:0; opacity:0; animation: var(--l2-cycle) linear infinite; }
.l2 .l2-cap-0 { animation-name:l2-cap-0 } .l2 .l2-cap-1 { animation-name:l2-cap-1 }
.l2 .l2-cap-2 { animation-name:l2-cap-2 } .l2 .l2-cap-3 { animation-name:l2-cap-3 }
.l2 .l2-cap-4 { animation-name:l2-cap-4 }
@keyframes l2-cap-0 { 0%{opacity:0} 1%,12%{opacity:1} 13%,100%{opacity:0} }
@keyframes l2-cap-1 { 0%,13%{opacity:0} 14%,26%{opacity:1} 27%,100%{opacity:0} }
@keyframes l2-cap-2 { 0%,27%{opacity:0} 28%,53%{opacity:1} 54%,100%{opacity:0} }
@keyframes l2-cap-3 { 0%,54%{opacity:0} 55%,68%{opacity:1} 69%,100%{opacity:0} }
@keyframes l2-cap-4 { 0%,69%{opacity:0} 70%,94%{opacity:1} 95%,100%{opacity:0} }
.l2 .l2-cap-static { display:none; }

/* reduced motion: composed static frame ------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .l2 * { animation: none !important; }
  .l2 .l2-pk, .l2 .l2-l1-pulse, .l2 .l2-cap { display:none; }
  .l2 .l2-cap-static { display:block; }
}
`;

// ── Component ──────────────────────────────────────────────────────────────

export function L2CacheInfographic({ className = "" }: { className?: string }) {
  const at = (i: number) => ATOMS[i];

  return (
    <div className={`l2 ${className}`} data-testid="l2-infographic">
      <style>{css}</style>

      <svg
        viewBox="0 0 640 400"
        role="img"
        aria-labelledby="l2-title l2-desc"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title id="l2-title">MMPM as an L2 cache for your AI</title>
        <desc id="l2-desc">{L2_STATIC_CAPTION}</desc>

        <defs>
          <filter id="l2-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── tracks ─────────────────────────────────────────────────── */}
        <g stroke="#1e293b" strokeWidth="2" fill="none">
          <path d={P_PROMPT} />
          <path d={P_RECALL} />
          <path d={P_RETURN} />
        </g>
        <g className="l2-mono" fontSize="9" fill="#64748b" textAnchor="middle" letterSpacing="1">
          <text x="148" y="190">
            PROMPT · ANSWER
          </text>
          <text x="420" y="170">
            RECALL
          </text>
          <text x="420" y="234">
            ATOMS
          </text>
        </g>

        {/* ── user ───────────────────────────────────────────────────── */}
        <g>
          <circle
            className="l2-user-glow"
            cx="70"
            cy="200"
            r="34"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1.5"
            filter="url(#l2-glow)"
          />
          <circle cx="70" cy="200" r="26" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
          <text
            className="l2-mono"
            x="70"
            y="205"
            fontSize="14"
            fill="#e2e8f0"
            textAnchor="middle"
            fontWeight="600"
          >
            &gt;_
          </text>
          <text
            className="l2-mono"
            x="70"
            y="250"
            fontSize="10"
            fill="#94a3b8"
            textAnchor="middle"
            letterSpacing="1.5"
          >
            YOU
          </text>
        </g>

        {/* ── AI model (L1) ──────────────────────────────────────────── */}
        <g>
          <rect
            x="200"
            y="130"
            width="200"
            height="140"
            rx="14"
            fill="#0b1220"
            stroke="#1e293b"
            strokeWidth="1.5"
          />
          <text
            className="l2-mono"
            x="300"
            y="157"
            fontSize="12"
            fill="#e2e8f0"
            textAnchor="middle"
            fontWeight="600"
          >
            AI MODEL
          </text>
          <rect x="228" y="172" width="144" height="26" rx="6" fill="#111a2e" stroke="#334155" />
          <rect
            className="l2-l1-pulse"
            x="228"
            y="172"
            width="144"
            height="26"
            rx="6"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.5"
            filter="url(#l2-glow)"
          />
          <text
            className="l2-mono"
            x="300"
            y="189"
            fontSize="11"
            fill="#94a3b8"
            textAnchor="middle"
            letterSpacing="1"
          >
            L1 · WEIGHTS
          </text>
          <text className="l2-mono" x="228" y="230" fontSize="9" fill="#64748b" letterSpacing="1">
            CONTEXT WINDOW
          </text>
          <rect x="228" y="238" width="144" height="8" rx="4" fill="#111a2e" />
          {/* the sliver: ~10% of the track — a few hundred tokens, not a document dump */}
          <rect
            className="l2-ctx"
            x="228"
            y="238"
            width="16"
            height="8"
            rx="4"
            fill="#22d3ee"
            filter="url(#l2-glow)"
            data-testid="l2-ctx"
            data-track-width="144"
          />
          <text
            className="l2-mono l2-primed"
            x="252"
            y="256"
            fontSize="9"
            fill="#22d3ee"
            letterSpacing="1"
            data-testid="l2-primed"
          >
            PRIMED FROM PROMPT
          </text>
        </g>

        {/* ── MMPM substrate (L2) ────────────────────────────────────── */}
        <g>
          <rect
            x="440"
            y="50"
            width="180"
            height="300"
            rx="14"
            fill="#0b1220"
            stroke="#36aaf5"
            strokeOpacity="0.6"
            strokeWidth="1.5"
          />
          <text
            className="l2-mono"
            x="530"
            y="78"
            fontSize="12"
            fill="#e2e8f0"
            textAnchor="middle"
            fontWeight="600"
          >
            MMPM SUBSTRATE
          </text>
          <text
            className="l2-mono"
            x="530"
            y="95"
            fontSize="10"
            fill="#7cc8fb"
            textAnchor="middle"
            letterSpacing="1"
          >
            L2 · YOUR DOMAIN
          </text>

          {/* edges */}
          <g stroke="#22d3ee" strokeWidth="1.25">
            {EDGES.map(([a, b, hit], i) => (
              <line
                key={i}
                className={hit ? "l2-edge-hit" : "l2-edge"}
                x1={at(a)[0]}
                y1={at(a)[1]}
                x2={at(b)[0]}
                y2={at(b)[1]}
              />
            ))}
            <line
              className="l2-new"
              x1={at(NEW_EDGE[0])[0]}
              y1={at(NEW_EDGE[0])[1]}
              x2={at(NEW_EDGE[1])[0]}
              y2={at(NEW_EDGE[1])[1]}
              stroke="#f59e0b"
            />
          </g>

          {/* atoms */}
          {ATOMS.map(([x, y], i) => {
            const isNew = i === NEW_ATOM;
            const hitIdx = [...HIT].indexOf(i);
            const cls = isNew ? "l2-new" : hitIdx >= 0 ? `l2-hit l2-hit-${hitIdx}` : "l2-atom";
            return (
              <circle
                key={i}
                className={cls}
                data-atom={isNew ? "new" : hitIdx >= 0 ? "hit" : "idle"}
                cx={x}
                cy={y}
                r="7"
                fill={isNew ? "#f59e0b" : "#0f172a"}
                stroke={isNew ? "#f59e0b" : "#22d3ee"}
                strokeWidth="1.5"
                filter={hitIdx >= 0 || isNew ? "url(#l2-glow)" : undefined}
              />
            );
          })}

          {/* Merkle root badge */}
          <g className="l2-root" data-testid="l2-root">
            <rect x="470" y="300" width="120" height="26" rx="13" fill="#0f172a" stroke="#334155" />
            <text
              className="l2-mono"
              x="530"
              y="317"
              fontSize="10"
              fill="#22d3ee"
              textAnchor="middle"
              letterSpacing="1"
            >
              MERKLE ROOT ✓
            </text>
          </g>
        </g>

        {/* ── packets ────────────────────────────────────────────────── */}
        <g className="l2-pk l2-pk-q">
          <circle r="10" fill="#36aaf5" opacity="0.25" />
          <circle r="5" fill="#36aaf5" />
        </g>
        <g className="l2-pk l2-pk-req">
          <circle r="10" fill="#36aaf5" opacity="0.25" />
          <circle r="5" fill="#36aaf5" />
        </g>
        {["r1", "r2", "r3"].map((k) => (
          <g key={k} className={`l2-pk l2-pk-${k}`}>
            <circle r="9" fill="#22d3ee" opacity="0.25" />
            <circle r="4" fill="#22d3ee" />
          </g>
        ))}
        <g className="l2-pk l2-pk-ans">
          <circle r="11" fill="#22d3ee" opacity="0.25" />
          <circle r="6" fill="#22d3ee" />
        </g>
        <g className="l2-pk l2-pk-cp">
          <circle r="10" fill="#f59e0b" opacity="0.25" />
          <circle r="5" fill="#f59e0b" />
        </g>
      </svg>

      {/* ── captions ───────────────────────────────────────────────────── */}
      <div
        className="l2-caps l2-mono mt-4 text-center text-[11px] tracking-widest text-cyan-300/90 uppercase sm:text-xs"
        aria-hidden="true"
      >
        {L2_CAPTIONS.map((c, i) => (
          <span key={i} className={`l2-cap l2-cap-${i}`}>
            {c}
          </span>
        ))}
        <span className="l2-cap-static">{L2_STATIC_CAPTION}</span>
      </div>
    </div>
  );
}
