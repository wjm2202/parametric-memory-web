/**
 * MemoryRing — static SVG hero diagram.
 *
 * Replaces the previous R3F/three.js HeroScene. Pure SVG + CSS animations:
 *   - zero client JS for the visual itself
 *   - zero TBT contribution (animations run on the GPU compositor)
 *   - automatically respects prefers-reduced-motion via @media query
 *
 * Visual semantics map directly to the product:
 *   - Center hexagon: the Merkle root (RFC 6962)
 *   - 4 cardinal hexagons: the 4 JumpHash shards
 *   - Connecting arcs: cryptographic links between root and shards
 *   - Travelling particles: Markov-chain transitions between shards
 *
 * Decorative — marked aria-hidden. The H1 in HeroAnimatedSequence carries
 * the actual semantic content for screen readers.
 *
 * IMPORTANT: this is a server component (no "use client"). Keep it that way
 * — the entire perf win comes from never shipping JS for this widget.
 */

const SHARD_HEX_POINTS = "0,-20 17.3,-10 17.3,10 0,20 -17.3,10 -17.3,-10";
const ROOT_HEX_POINTS = "0,-30 26,-15 26,15 0,30 -26,15 -26,-15";

// Inline style block — keeps this component self-contained and avoids
// polluting globals.css with hero-only animations.
const STYLES = `
  .mr-arc {
    stroke-dasharray: 260;
    stroke-dashoffset: 260;
    animation: mr-draw 900ms ease-out forwards;
  }
  .mr-arc-n { animation-delay: 200ms; }
  .mr-arc-e { animation-delay: 350ms; }
  .mr-arc-s { animation-delay: 500ms; }
  .mr-arc-w { animation-delay: 650ms; }

  .mr-shard {
    opacity: 0;
    animation: mr-fade 500ms ease-out forwards;
  }
  .mr-shard-n { animation-delay: 1000ms; }
  .mr-shard-e { animation-delay: 1150ms; }
  .mr-shard-s { animation-delay: 1300ms; }
  .mr-shard-w { animation-delay: 1450ms; }

  .mr-shard-label {
    opacity: 0;
    animation: mr-fade 400ms ease-out forwards;
    animation-delay: 1700ms;
  }

  .mr-root {
    opacity: 0;
    animation: mr-root-in 800ms ease-out 1900ms forwards,
               mr-root-pulse 6s ease-in-out 2700ms infinite;
    transform-origin: 400px 300px;
    transform-box: fill-box;
  }

  .mr-particles {
    opacity: 0;
    animation: mr-fade 600ms ease-out 2400ms forwards;
  }

  .mr-outer-ring {
    transform-origin: 400px 300px;
    transform-box: fill-box;
    animation: mr-spin 180s linear infinite;
  }

  @keyframes mr-draw {
    to { stroke-dashoffset: 0; }
  }
  @keyframes mr-fade {
    to { opacity: 1; }
  }
  @keyframes mr-root-in {
    from { opacity: 0; }
    to   { opacity: 0.95; }
  }
  @keyframes mr-root-pulse {
    0%, 100% { opacity: 0.85; }
    50%      { opacity: 1; }
  }
  @keyframes mr-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  /* Honour reduced-motion: snap straight to the settled state, no motion. */
  @media (prefers-reduced-motion: reduce) {
    .mr-arc,
    .mr-shard,
    .mr-shard-label,
    .mr-root,
    .mr-particles {
      animation: none;
      opacity: 1;
      stroke-dashoffset: 0;
    }
    .mr-outer-ring { animation: none; }
  }
`;

export function MemoryRing() {
  return (
    <svg
      data-testid="memory-ring-svg"
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      role="presentation"
    >
      <style>{STYLES}</style>

      <defs>
        {/* Subtle glow filter for the Merkle root */}
        <filter id="mr-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Paths the Markov particles travel along (root -> shard) */}
        <path id="mr-path-n" d="M400,300 L400,140" />
        <path id="mr-path-e" d="M400,300 L660,300" />
        <path id="mr-path-s" d="M400,300 L400,460" />
        <path id="mr-path-w" d="M400,300 L140,300" />
      </defs>

      {/* Outer dashed ring — slow rotation, conveys "structure" */}
      <circle
        className="mr-outer-ring"
        cx="400"
        cy="300"
        r="240"
        fill="none"
        stroke="#36aaf5"
        strokeOpacity="0.18"
        strokeWidth="0.6"
        strokeDasharray="2 8"
      />

      {/* Connecting arcs from root to each shard */}
      <g stroke="#36aaf5" strokeOpacity="0.45" strokeWidth="1.25" strokeLinecap="round" fill="none">
        <line className="mr-arc mr-arc-n" x1="400" y1="300" x2="400" y2="140" />
        <line className="mr-arc mr-arc-e" x1="400" y1="300" x2="660" y2="300" />
        <line className="mr-arc mr-arc-s" x1="400" y1="300" x2="400" y2="460" />
        <line className="mr-arc mr-arc-w" x1="400" y1="300" x2="140" y2="300" />
      </g>

      {/* 4 shard hexagons at cardinal positions */}
      <g fill="rgba(6,9,28,0.85)" stroke="#36aaf5" strokeOpacity="0.65" strokeWidth="1.5">
        <polygon
          className="mr-shard mr-shard-n"
          points={SHARD_HEX_POINTS}
          transform="translate(400 140)"
        />
        <polygon
          className="mr-shard mr-shard-e"
          points={SHARD_HEX_POINTS}
          transform="translate(660 300)"
        />
        <polygon
          className="mr-shard mr-shard-s"
          points={SHARD_HEX_POINTS}
          transform="translate(400 460)"
        />
        <polygon
          className="mr-shard mr-shard-w"
          points={SHARD_HEX_POINTS}
          transform="translate(140 300)"
        />
      </g>

      {/* Shard labels */}
      <g
        className="mr-shard-label"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="10"
        fontWeight="600"
        fill="#94a3b8"
        textAnchor="middle"
      >
        <text x="400" y="144">
          S0
        </text>
        <text x="660" y="304">
          S1
        </text>
        <text x="400" y="464">
          S2
        </text>
        <text x="140" y="304">
          S3
        </text>
      </g>

      {/* Merkle root in center */}
      <g className="mr-root" filter="url(#mr-glow)">
        <polygon
          points={ROOT_HEX_POINTS}
          fill="rgba(6,9,28,0.92)"
          stroke="#22d3ee"
          strokeWidth="1.75"
          transform="translate(400 300)"
        />
        <text
          x="400"
          y="304"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize="11"
          fontWeight="700"
          fill="#22d3ee"
          textAnchor="middle"
        >
          ROOT
        </text>
      </g>

      {/* Markov-transition particles — travel along the 4 arcs, staggered */}
      <g className="mr-particles" fill="#f59e0b">
        <circle r="2.5">
          <animateMotion dur="5s" repeatCount="indefinite" begin="0s">
            <mpath href="#mr-path-n" />
          </animateMotion>
        </circle>
        <circle r="2.5">
          <animateMotion dur="5s" repeatCount="indefinite" begin="1.25s">
            <mpath href="#mr-path-e" />
          </animateMotion>
        </circle>
        <circle r="2.5">
          <animateMotion dur="5s" repeatCount="indefinite" begin="2.5s">
            <mpath href="#mr-path-s" />
          </animateMotion>
        </circle>
        <circle r="2.5">
          <animateMotion dur="5s" repeatCount="indefinite" begin="3.75s">
            <mpath href="#mr-path-w" />
          </animateMotion>
        </circle>
      </g>
    </svg>
  );
}
