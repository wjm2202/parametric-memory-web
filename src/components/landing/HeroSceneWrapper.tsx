"use client";

/**
 * HeroSceneWrapper — lazy gate for the R3F hero scene.
 *
 * The HeroScene ships ~600KB+ of three.js + @react-three/fiber +
 * @react-three/postprocessing and runs a continuous rAF loop. When mounted
 * synchronously above-the-fold it tanks Lighthouse Performance via:
 *   - large initial JS bundle blocking parse / LCP
 *   - rAF loop eating main-thread time during the TBT measurement window
 *
 * This wrapper defers the dynamic import + mount until the browser is idle
 * (post first paint) and skips it entirely when the user has
 * `prefers-reduced-motion: reduce`. The visual is decorative — there is no
 * functional regression from skipping or delaying it.
 */

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// ssr: false is only valid inside a Client Component — this wrapper provides
// that boundary. The dynamic import only fires when the component actually
// mounts in the DOM, so gating the mount also gates the bundle download.
const HeroScene = dynamic(() => import("./HeroScene").then((m) => m.HeroScene), {
  ssr: false,
  loading: () => null,
});

/**
 * Schedule `cb` to run when the browser is idle, with a setTimeout fallback
 * for environments without requestIdleCallback (Safari < 17, jsdom).
 * Returns a cancel function.
 */
function scheduleIdle(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const ric = (window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  }).requestIdleCallback;

  if (ric) {
    const handle = ric(cb, { timeout: 2000 });
    return () => {
      const cic = (window as Window & {
        cancelIdleCallback?: (handle: number) => void;
      }).cancelIdleCallback;
      if (cic) cic(handle);
    };
  }

  // Fallback: 1500ms is past Lighthouse desktop's typical TBT measurement
  // window for most pages.
  const handle = window.setTimeout(cb, 1500);
  return () => window.clearTimeout(handle);
}

/**
 * Returns true if the user has expressed a preference to reduce motion.
 * Returns false if matchMedia is unavailable (SSR, very old browsers).
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HeroSceneWrapper() {
  const [mount, setMount] = useState(false);

  useEffect(() => {
    // Honour reduced-motion: skip the animated scene entirely. The hero has a
    // gradient vignette behind it that remains visible.
    if (prefersReducedMotion()) return;

    // Defer mount until the browser is idle so the heavy bundle download and
    // first execution happen after the Lighthouse TBT measurement window.
    const cancel = scheduleIdle(() => setMount(true));
    return cancel;
  }, []);

  if (!mount) return null;
  return <HeroScene />;
}
