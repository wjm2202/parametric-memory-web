/**
 * useHasHydrated — unit tests.
 *
 * Coverage:
 *   1. Server-side rendering via react-dom/server.renderToString sees the
 *      hook resolve to `false`. This is the byte that goes over the wire
 *      and ends up in the SSR HTML — if it ever flips to `true`,
 *      hydration-safe consumers (FormattedDate, FormattedNumber) would
 *      emit a localised string server-side and re-introduce React error
 *      #418 in non-en-US browsers.
 *   2. Client-side rendering with @testing-library/react sees `true` once
 *      the hook commits. jsdom mounts behave like a hydrated browser, so
 *      after the first `act()` flush the snapshot returns `true`.
 *   3. The hook returns a stable `boolean` (never `undefined`,
 *      `null`, or a non-primitive). Sanity guard so a future refactor
 *      can't quietly change the contract callers depend on.
 *
 * We do NOT attempt to test the SSR → hydration transition in a single
 * jsdom run because @testing-library/react's `render` does a fresh
 * client-only mount; it doesn't drive `hydrateRoot`. The transition is
 * exercised indirectly via the FormattedDate / FormattedNumber tests,
 * which assert the *visible* contract (`<time dateTime>` is stable,
 * post-paint text contains the expected year, etc.).
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { renderHook } from "@testing-library/react";
import { useHasHydrated } from "./useHasHydrated";

describe("useHasHydrated", () => {
  it("returns false during server-side rendering", () => {
    // Render a tiny probe component on the server. The hook's value is
    // serialised into the SSR HTML — if it's anything other than 'false'
    // the SSR/CSR text would diverge in hydration-safe consumers.
    function Probe() {
      return createElement("span", null, String(useHasHydrated()));
    }
    const html = renderToString(createElement(Probe));
    expect(html).toBe("<span>false</span>");
  });

  it("returns true once mounted on the client", () => {
    const { result } = renderHook(() => useHasHydrated());
    expect(result.current).toBe(true);
  });

  it("returns a primitive boolean (never null/undefined/object)", () => {
    const { result } = renderHook(() => useHasHydrated());
    expect(typeof result.current).toBe("boolean");
  });

  it("is stable across re-renders on the client", () => {
    const { result, rerender } = renderHook(() => useHasHydrated());
    const first = result.current;
    rerender();
    rerender();
    rerender();
    expect(result.current).toBe(first);
    expect(result.current).toBe(true);
  });
});
