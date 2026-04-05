/**
 * SubstrateNetwork — animated particle network that mimics the MMPM
 * knowledge graph visualiser. Runs as a Canvas element inside Remotion.
 *
 * Uses useCurrentFrame() for deterministic rendering (required for video).
 * All randomness is seeded so every frame renders identically on re-render.
 */
import React, { useMemo } from "react";
import { useCurrentFrame } from "remotion";
import { AbsoluteFill } from "remotion";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  r: number;
  g: number;
  b: number;
  opacity: number;
  pulseOffset: number;
  pulseSpeed: number;
}

// Deterministic pseudo-random seeded with index
function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

const PARTICLE_COUNT = 260;
const MAX_DIST = 140;

const COLOR_PALETTES = [
  [54, 170, 245],   // brand blue
  [54, 170, 245],
  [54, 170, 245],
  [34, 211, 238],   // cyan
  [34, 211, 238],
  [245, 158, 11],   // amber
  [16, 185, 129],   // green
  [255, 255, 255],  // white
];

export const SubstrateNetwork: React.FC<{ brightness: number }> = ({ brightness }) => {
  const frame = useCurrentFrame();

  // Generate stable particle initial positions
  const initialParticles = useMemo<Particle[]>(() => {
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const colorIdx = Math.floor(seededRand(i * 7 + 1) * COLOR_PALETTES.length);
      const [r, g, b] = COLOR_PALETTES[colorIdx];
      return {
        x: seededRand(i * 13 + 2) * 1920,
        y: seededRand(i * 17 + 3) * 1080,
        vx: (seededRand(i * 19 + 4) - 0.5) * 0.4,
        vy: (seededRand(i * 23 + 5) - 0.5) * 0.4,
        size: seededRand(i * 29 + 6) * 2.5 + 0.8,
        r, g, b,
        opacity: seededRand(i * 31 + 7) * 0.5 + 0.3,
        pulseOffset: seededRand(i * 37 + 8) * Math.PI * 2,
        pulseSpeed: 0.015 + seededRand(i * 41 + 9) * 0.02,
      };
    });
  }, []);

  // Advance particle positions by frame
  const particles = useMemo(() => {
    return initialParticles.map((p) => {
      let x = (p.x + p.vx * frame) % 1920;
      let y = (p.y + p.vy * frame) % 1080;
      if (x < 0) x += 1920;
      if (y < 0) y += 1080;
      return { ...p, x, y };
    });
  }, [frame, initialParticles]);

  // Draw to canvas
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, 1920, 1080);

    // Edges
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_DIST) {
          const alpha = (1 - dist / MAX_DIST) * 0.32 * brightness;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(16,185,129,${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    // Nodes
    for (const p of particles) {
      const pulse = Math.sin(frame * p.pulseSpeed + p.pulseOffset) * 0.25 + 0.75;
      const alpha = p.opacity * pulse * brightness;

      // Glow
      if (alpha > 0.4 && p.size > 1.8) {
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
        grd.addColorStop(0, `rgba(${p.r},${p.g},${p.b},${alpha * 0.15})`);
        grd.addColorStop(1, `rgba(${p.r},${p.g},${p.b},0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
      }

      // Core
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha})`;
      ctx.fill();
    }
  });

  return (
    <AbsoluteFill>
      <canvas
        ref={canvasRef}
        width={1920}
        height={1080}
        style={{ width: "100%", height: "100%" }}
      />
    </AbsoluteFill>
  );
};
