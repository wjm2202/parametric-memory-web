/**
 * Tests for HeroSceneWrapper — Lighthouse perf gate (sprint 2026-W17).
 *
 * Why this exists. The wrapper defers mounting the heavy R3F HeroScene
 * (~600KB three.js bundle + continuous rAF loop) until the browser is idle,
 * and skips it entirely when prefers-reduced-motion is set. Both behaviours
 * are required to keep Lighthouse Performance >= 0.85 on the landing page
 * and to respect user accessibility preferences.
 *
 * The HeroScene module itself is mocked here — we don't want the real R3F
 * Canvas instantiating WebGL inside jsdom.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { HeroSceneWrapper } from "./HeroSceneWrapper";

// Replace the real HeroScene with a marker the test can assert on. The
// dynamic import resolves via Next's `next/dynamic` which calls this module
// loader; we provide a synchronous stub.
vi.mock("./HeroScene", () => ({
  HeroScene: () => <div data-testid="hero-scene-mounted" />,
}));

interface MockWindow extends Window {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}

const originalRIC = (window as MockWindow).requestIdleCallback;
const originalCIC = (window as MockWindow).cancelIdleCallback;
const originalMatchMedia = window.matchMedia;

function mockMatchMedia(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" ? reduced : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  mockMatchMedia(false);
});

afterEach(() => {
  (window as MockWindow).requestIdleCallback = originalRIC;
  (window as MockWindow).cancelIdleCallback = originalCIC;
  window.matchMedia = originalMatchMedia;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("HeroSceneWrapper — defer mount until idle", () => {
  it("renders nothing on initial render (before idle callback fires)", () => {
    // requestIdleCallback present but never invoked here — just verifying the
    // wrapper doesn't synchronously mount the heavy scene.
    let _scheduled: (() => void) | null = null;
    (window as MockWindow).requestIdleCallback = vi.fn((cb: () => void) => {
      _scheduled = cb;
      return 1;
    });
    (window as MockWindow).cancelIdleCallback = vi.fn();

    const { queryByTestId } = render(<HeroSceneWrapper />);
    expect(queryByTestId("hero-scene-mounted")).toBeNull();
    expect((window as MockWindow).requestIdleCallback).toHaveBeenCalledTimes(1);
    void _scheduled; // satisfy unused-binding lint without firing it
  });

  it("mounts the HeroScene once the idle callback fires", async () => {
    let scheduled: (() => void) | null = null;
    (window as MockWindow).requestIdleCallback = vi.fn((cb: () => void) => {
      scheduled = cb;
      return 1;
    });
    (window as MockWindow).cancelIdleCallback = vi.fn();

    const { findByTestId, queryByTestId } = render(<HeroSceneWrapper />);
    expect(queryByTestId("hero-scene-mounted")).toBeNull();

    // Simulate the browser becoming idle.
    await act(async () => {
      scheduled!();
    });

    // findByTestId waits for the dynamic import stub to resolve.
    expect(await findByTestId("hero-scene-mounted")).toBeTruthy();
  });

  it("uses setTimeout fallback when requestIdleCallback is unavailable", async () => {
    vi.useFakeTimers();
    (window as MockWindow).requestIdleCallback = undefined;
    (window as MockWindow).cancelIdleCallback = undefined;

    const { findByTestId, queryByTestId } = render(<HeroSceneWrapper />);
    expect(queryByTestId("hero-scene-mounted")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    vi.useRealTimers();

    expect(await findByTestId("hero-scene-mounted")).toBeTruthy();
  });
});

describe("HeroSceneWrapper — prefers-reduced-motion", () => {
  it("does NOT mount HeroScene when prefers-reduced-motion: reduce is set", () => {
    mockMatchMedia(true);

    const ricSpy = vi.fn();
    (window as MockWindow).requestIdleCallback = ricSpy as unknown as MockWindow["requestIdleCallback"];

    const { queryByTestId } = render(<HeroSceneWrapper />);
    expect(queryByTestId("hero-scene-mounted")).toBeNull();
    // Idle callback should never even be scheduled when reduced-motion is on.
    expect(ricSpy).not.toHaveBeenCalled();
  });
});

describe("HeroSceneWrapper — cleanup", () => {
  it("cancels the pending idle callback on unmount", () => {
    const cancelSpy = vi.fn();
    (window as MockWindow).requestIdleCallback = vi.fn(() => 42);
    (window as MockWindow).cancelIdleCallback = cancelSpy;

    const { unmount } = render(<HeroSceneWrapper />);
    unmount();
    expect(cancelSpy).toHaveBeenCalledWith(42);
  });

  it("clears the setTimeout fallback on unmount", () => {
    vi.useFakeTimers();
    (window as MockWindow).requestIdleCallback = undefined;
    (window as MockWindow).cancelIdleCallback = undefined;
    const clearSpy = vi.spyOn(window, "clearTimeout");

    const { unmount } = render(<HeroSceneWrapper />);
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
