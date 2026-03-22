"use client";

/**
 * HeroScene — Memory Crystallisation
 *
 * Particles begin in chaotic brownian motion, then coalesce into the MMPM
 * hash ring: 4 shard nodes at cardinal positions, Merkle root at center,
 * Markov arcs tracing transitions. Loops continuously.
 *
 * Phases (total: ~14s loop):
 *   CHAOS    (0–3s)   Particles drift randomly
 *   ATTRACT  (3–6s)   Particles pulled toward shard clusters
 *   SETTLE   (6–9s)   Ring solidifies, shard nodes glow, arcs appear
 *   PULSE    (9–12s)  Markov arcs trace between shards, root pulses
 *   DISSOLVE (12–14s) Particles drift back to chaos → loop
 */

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

// ── Constants ────────────────────────────────────────────────────────────────

const PARTICLE_COUNT = 220;
const RING_RADIUS = 5.5;
const SHARD_COUNT = 4;

/** Shard angles: N, E, S, W (cardinal ring positions) */
const SHARD_ANGLES = [
  -Math.PI / 2, // top
  0, // right
  Math.PI / 2, // bottom
  Math.PI, // left
];

/** Phase durations in seconds */
const PHASE = { CHAOS: 3, ATTRACT: 3, SETTLE: 3, PULSE: 4, DISSOLVE: 2 };
const TOTAL_DURATION = PHASE.CHAOS + PHASE.ATTRACT + PHASE.SETTLE + PHASE.PULSE + PHASE.DISSOLVE;

const BLUE = new THREE.Color("#36aaf5");
const AMBER = new THREE.Color("#f59e0b");
const CYAN = new THREE.Color("#22d3ee");
const WHITE = new THREE.Color("#ffffff");
const DIM = new THREE.Color("#1e293b");

// ── Particle system ───────────────────────────────────────────────────────────

interface ParticleState {
  /** Current world position */
  pos: THREE.Vector3;
  /** Drift velocity for chaos phase */
  vel: THREE.Vector3;
  /** Which shard cluster this particle belongs to */
  shardId: number;
  /** Random offset for jitter within shard cluster */
  jitter: THREE.Vector3;
  /** Stagger delay 0–1 for attract phase */
  delay: number;
}

function initParticles(): ParticleState[] {
  const particles: ParticleState[] = [];
  const rng = () => (Math.random() - 0.5) * 2;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 2 + Math.random() * 6;

    particles.push({
      pos: new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta) * 0.4,
        r * Math.cos(phi),
      ),
      vel: new THREE.Vector3(rng() * 0.4, rng() * 0.08, rng() * 0.4),
      shardId: i % SHARD_COUNT,
      jitter: new THREE.Vector3(rng() * 0.6, rng() * 0.2, rng() * 0.6),
      delay: Math.random(),
    });
  }
  return particles;
}

// ── Easing utilities ─────────────────────────────────────────────────────────

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ── Main scene component ──────────────────────────────────────────────────────

function CrystallisationScene() {
  const particlesRef = useRef<THREE.Points>(null);
  const ringRef = useRef<THREE.LineLoop>(null);
  const innerRingRef = useRef<THREE.LineLoop>(null);
  const shardRefs = useRef<(THREE.Mesh | null)[]>(Array(SHARD_COUNT).fill(null));
  const rootRef = useRef<THREE.Mesh>(null);
  const arcGroupRef = useRef<THREE.Group>(null);

  const timeRef = useRef(0);
  const particles = useRef<ParticleState[]>(initParticles());

  // Scratch vectors — avoid allocation in useFrame
  const _target = useMemo(() => new THREE.Vector3(), []);
  const _color = useMemo(() => new THREE.Color(), []);

  // ── Geometry: particles ──────────────────────────────────────────────────

  const particleGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles.current[i];
      positions[i * 3] = p.pos.x;
      positions[i * 3 + 1] = p.pos.y;
      positions[i * 3 + 2] = p.pos.z;
      colors[i * 3] = 0.2;
      colors[i * 3 + 1] = 0.4;
      colors[i * 3 + 2] = 0.8;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, []);

  // ── Geometry: hash ring ──────────────────────────────────────────────────

  const ringGeo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * RING_RADIUS, 0, Math.sin(a) * RING_RADIUS));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  const innerRingGeo = useMemo(() => {
    const r = RING_RADIUS * 0.82;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  // ── Markov arc Line objects (primitive, avoids JSX <line> conflict) ─────────

  const arcLines = useMemo(() => {
    return SHARD_ANGLES.map((angle, i) => {
      const nextAngle = SHARD_ANGLES[(i + 1) % SHARD_COUNT];
      const from = new THREE.Vector3(
        Math.cos(angle) * RING_RADIUS,
        0,
        Math.sin(angle) * RING_RADIUS,
      );
      const to = new THREE.Vector3(
        Math.cos(nextAngle) * RING_RADIUS,
        0,
        Math.sin(nextAngle) * RING_RADIUS,
      );
      const ctrl = new THREE.Vector3((from.x + to.x) * 0.2, 0.5, (from.z + to.z) * 0.2);
      const curve = new THREE.QuadraticBezierCurve3(from, ctrl, to);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(32));
      const mat = new THREE.LineBasicMaterial({
        color: AMBER,
        transparent: true,
        opacity: 0,
        toneMapped: false,
      });
      return new THREE.Line(geo, mat);
    });
  }, []);

  // ── Target shard world positions ─────────────────────────────────────────

  const shardTargets = useMemo(
    () =>
      SHARD_ANGLES.map(
        (angle) =>
          new THREE.Vector3(Math.cos(angle) * RING_RADIUS, 0, Math.sin(angle) * RING_RADIUS),
      ),
    [],
  );

  // ── Animation loop ───────────────────────────────────────────────────────

  useFrame((_, delta) => {
    timeRef.current = (timeRef.current + delta) % TOTAL_DURATION;
    const t = timeRef.current;

    // ── Compute phase progress ─────────────────────────────────────────────

    let attractT = 0; // 0–1 within attract phase
    let settleT = 0; // 0–1 within settle phase
    let pulseT = 0; // 0–1 within pulse phase
    let dissolveT = 0; // 0–1 within dissolve phase

    if (t < PHASE.CHAOS) {
      // chaos phase — particles drift freely, no interpolation variable needed
    } else if (t < PHASE.CHAOS + PHASE.ATTRACT) {
      attractT = (t - PHASE.CHAOS) / PHASE.ATTRACT;
    } else if (t < PHASE.CHAOS + PHASE.ATTRACT + PHASE.SETTLE) {
      settleT = (t - PHASE.CHAOS - PHASE.ATTRACT) / PHASE.SETTLE;
      attractT = 1;
    } else if (t < PHASE.CHAOS + PHASE.ATTRACT + PHASE.SETTLE + PHASE.PULSE) {
      pulseT = (t - PHASE.CHAOS - PHASE.ATTRACT - PHASE.SETTLE) / PHASE.PULSE;
      settleT = 1;
      attractT = 1;
    } else {
      dissolveT = (t - PHASE.CHAOS - PHASE.ATTRACT - PHASE.SETTLE - PHASE.PULSE) / PHASE.DISSOLVE;
      pulseT = 1;
      settleT = 1;
      attractT = 1;
    }

    // Overall "crystallised" amount — drives ring/shard visibility
    const crystallised = clamp01(easeInOut(attractT) - dissolveT * 1.5);
    const settled = clamp01(easeInOut(settleT) - dissolveT * 1.5);

    // ── Update particle positions ──────────────────────────────────────────

    const posAttr = particleGeo.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = particleGeo.getAttribute("color") as THREE.BufferAttribute;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles.current[i];

      // Chaos drift
      if (dissolveT === 0) {
        p.vel.x += (Math.random() - 0.5) * 0.01;
        p.vel.y += (Math.random() - 0.5) * 0.003;
        p.vel.z += (Math.random() - 0.5) * 0.01;
        p.vel.clampLength(0, 0.4);
      }

      // Attract force toward shard cluster
      const target = shardTargets[p.shardId];
      _target.copy(target).add(p.jitter);

      const staggeredAttract = clamp01((attractT - p.delay * 0.4) / 0.6);
      const attractForce = easeOut(staggeredAttract);
      const dissolveForce = dissolveT > 0 ? easeOut(dissolveT) : 0;

      const mixedX = p.pos.x + p.vel.x * delta * (1 - attractForce + dissolveForce * 0.3);
      const mixedY = p.pos.y + p.vel.y * delta * (1 - attractForce + dissolveForce * 0.3);
      const mixedZ = p.pos.z + p.vel.z * delta * (1 - attractForce + dissolveForce * 0.3);

      if (dissolveForce > 0) {
        // Dissolve: drift outward
        p.pos.x += (p.vel.x * 0.8 + (p.pos.x - 0) * 0.02) * delta * dissolveForce * 3;
        p.pos.y += (p.vel.y * 0.8 + (p.pos.y - 0) * 0.01) * delta * dissolveForce * 3;
        p.pos.z += (p.vel.z * 0.8 + (p.pos.z - 0) * 0.02) * delta * dissolveForce * 3;
      } else {
        p.pos.x = mixedX * (1 - attractForce) + _target.x * attractForce;
        p.pos.y = mixedY * (1 - attractForce) + _target.y * attractForce;
        p.pos.z = mixedZ * (1 - attractForce) + _target.z * attractForce;
      }

      posAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);

      // Particle colour: blue chaos → cyan crystallised → blue dissolve
      const brightness = 0.3 + crystallised * 0.7;
      if (crystallised > 0.5) {
        _color.copy(BLUE).lerp(CYAN, (crystallised - 0.5) * 2);
      } else {
        _color.copy(DIM).lerp(BLUE, crystallised * 2);
      }
      colAttr.setXYZ(i, _color.r * brightness, _color.g * brightness, _color.b * brightness);
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // ── Hash ring visibility ───────────────────────────────────────────────

    if (ringRef.current) {
      const mat = ringRef.current.material as THREE.LineBasicMaterial;
      mat.opacity = crystallised * 0.7;
    }
    if (innerRingRef.current) {
      const mat = innerRingRef.current.material as THREE.LineBasicMaterial;
      mat.opacity = crystallised * 0.25;
    }

    // ── Shard node glow ────────────────────────────────────────────────────

    for (let i = 0; i < SHARD_COUNT; i++) {
      const mesh = shardRefs.current[i];
      if (!mesh) continue;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      const pulse = settled > 0 ? 1 + Math.sin(t * 2.5 + i * 1.57) * 0.18 * settled : 0;
      mat.opacity = settled * 0.9;
      const s = 0.8 + pulse * 0.3 * settled;
      mesh.scale.setScalar(s);
      mat.color.copy(BLUE).lerp(CYAN, settled * 0.6 + Math.sin(t * 1.5 + i) * 0.1);
    }

    // ── Merkle root (amber center) ─────────────────────────────────────────

    if (rootRef.current) {
      const mat = rootRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = settled * 0.95;
      const pulse = 1 + Math.sin(t * 3.5) * 0.2 * pulseT;
      rootRef.current.scale.setScalar(pulse);
    }

    // ── Markov arcs ────────────────────────────────────────────────────────

    for (let i = 0; i < SHARD_COUNT; i++) {
      const mat = arcLines[i].material as THREE.LineBasicMaterial;
      // Stagger arcs sequentially during pulse phase
      const arcDelay = i / SHARD_COUNT;
      const arcActive = clamp01((pulseT - arcDelay) * 3);
      const arcFade = dissolveT > 0 ? 1 - easeOut(dissolveT) : 1;
      mat.opacity = easeOut(arcActive) * arcFade * 0.6;
      mat.color.copy(AMBER).lerp(WHITE, Math.sin(t * 4 + i) * 0.15 * pulseT);
    }
  });

  // ── Camera slow rotation ─────────────────────────────────────────────────

  useFrame(({ camera }) => {
    const t = timeRef.current;
    camera.position.x = Math.sin(t * 0.04) * 1.5;
    camera.position.y = 7 + Math.sin(t * 0.03) * 0.8;
    camera.lookAt(0, 0, 0);
  });

  // ── JSX ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Particle cloud */}
      <points ref={particlesRef} geometry={particleGeo}>
        <pointsMaterial
          size={0.055}
          vertexColors
          transparent
          opacity={0.85}
          depthWrite={false}
          toneMapped={false}
          sizeAttenuation
        />
      </points>

      {/* Outer hash ring */}
      <lineLoop ref={ringRef} geometry={ringGeo}>
        <lineBasicMaterial color={CYAN} transparent opacity={0} toneMapped={false} />
      </lineLoop>

      {/* Inner ring (depth) */}
      <lineLoop ref={innerRingRef} geometry={innerRingGeo}>
        <lineBasicMaterial color={BLUE} transparent opacity={0} toneMapped={false} />
      </lineLoop>

      {/* 4 Shard nodes */}
      {SHARD_ANGLES.map((angle, i) => (
        <mesh
          key={`shard-${i}`}
          ref={(el) => {
            shardRefs.current[i] = el;
          }}
          position={[Math.cos(angle) * RING_RADIUS, 0, Math.sin(angle) * RING_RADIUS]}
        >
          <sphereGeometry args={[0.22, 12, 12]} />
          <meshBasicMaterial color={BLUE} transparent opacity={0} toneMapped={false} />
        </mesh>
      ))}

      {/* Merkle root — amber center */}
      <mesh ref={rootRef} position={[0, 0, 0]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial color={AMBER} transparent opacity={0} toneMapped={false} />
      </mesh>

      {/* Markov arcs — rendered as primitives to avoid <line> JSX conflict */}
      <group ref={arcGroupRef}>
        {arcLines.map((lineObj, i) => (
          <primitive key={`arc-${i}`} object={lineObj} />
        ))}
      </group>

      {/* Ambient fog-like fill light */}
      <ambientLight intensity={0.1} />
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function HeroScene() {
  return (
    <div className="absolute inset-0 h-full w-full" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 7, 12], fov: 48 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          toneMapping: THREE.NoToneMapping,
        }}
        style={{ background: "transparent" }}
        frameloop="always"
        dpr={[1, 1.5]}
      >
        <CrystallisationScene />
        <EffectComposer>
          <Bloom intensity={1.8} luminanceThreshold={0.15} luminanceSmoothing={0.85} mipmapBlur />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
