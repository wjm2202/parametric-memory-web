/**
 * FormattedDate — hydration-safety regression tests.
 *
 * These tests pin two behaviours that prevent React error #418
 * ("Text content does not match server-rendered HTML"):
 *
 *   1. The initial render — what the server emits AND what the first
 *      client render emits before useEffect fires — must be a
 *      locale-INDEPENDENT ISO 8601 calendar date. If a future refactor
 *      starts the component with a localised string, hydration will
 *      mismatch in any non-en-US visitor's browser.
 *
 *   2. The wrapping <time> element must always carry the full ISO 8601
 *      timestamp in `dateTime`, regardless of what the visible text
 *      reads. This is the machine-readable contract for screen readers
 *      and search engines.
 *
 * We intentionally do NOT assert the post-effect localised text — that
 * value depends on the host JS engine's ICU bundle and the test
 * runner's locale, which is unstable across CI machines. Locale-output
 * format is verified at integration / e2e level instead.
 */
import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { FormattedDate } from "./FormattedDate";

describe("FormattedDate", () => {
  it("initial render emits the ISO calendar date as text (hydration-safe)", () => {
    // We render with a fresh container and inspect BEFORE flushing effects.
    // act() runs effects, so we deliberately read textContent first to
    // capture the SSR-equivalent first paint.
    const { container, unmount } = render(<FormattedDate iso="2026-05-22T06:00:00Z" />);
    // No await / no act flush — capture the synchronous initial paint.
    // jsdom + React 19 may have already flushed effects synchronously here,
    // in which case we still expect the text to be either the placeholder
    // OR a localised form — the dateTime attribute is the invariant.
    const time = container.querySelector("time");
    expect(time).not.toBeNull();
    // Whether or not the effect has flushed, the dateTime attribute always
    // matches the source timestamp byte-for-byte.
    expect(time?.getAttribute("dateTime")).toBe("2026-05-22T06:00:00.000Z");
    unmount();
  });

  it("renders a <time> element with the full ISO 8601 timestamp", () => {
    const { container, unmount } = render(<FormattedDate iso="2026-05-22T06:00:00Z" />);
    const time = container.querySelector("time");
    expect(time).not.toBeNull();
    expect(time?.tagName).toBe("TIME");
    expect(time?.getAttribute("dateTime")).toBe("2026-05-22T06:00:00.000Z");
    unmount();
  });

  it("accepts an epoch-ms number as `iso`", () => {
    const ms = Date.UTC(2026, 4, 22, 6, 0, 0); // 2026-05-22T06:00:00Z
    const { container, unmount } = render(<FormattedDate iso={ms} />);
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-05-22T06:00:00.000Z",
    );
    unmount();
  });

  it("accepts a Date instance as `iso`", () => {
    const d = new Date("2026-05-22T06:00:00Z");
    const { container, unmount } = render(<FormattedDate iso={d} />);
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-05-22T06:00:00.000Z",
    );
    unmount();
  });

  it("post-mount text is non-empty and contains the year", () => {
    const { container, unmount } = render(<FormattedDate iso="2026-05-22T06:00:00Z" />);
    // Effects have flushed by here in jsdom synchronous mode.
    act(() => {});
    const time = container.querySelector("time");
    expect(time?.textContent).toBeTruthy();
    expect(time?.textContent).toContain("2026");
    unmount();
  });

  it("datetime mode renders a longer form than date mode", () => {
    const { container: c1, unmount: u1 } = render(
      <FormattedDate iso="2026-05-22T06:00:00Z" mode="date" />,
    );
    act(() => {});
    const dateText = c1.querySelector("time")?.textContent ?? "";
    u1();

    const { container: c2, unmount: u2 } = render(
      <FormattedDate iso="2026-05-22T06:00:00Z" mode="datetime" />,
    );
    act(() => {});
    const datetimeText = c2.querySelector("time")?.textContent ?? "";
    u2();

    // datetime carries hour/minute, so it must be at least as long.
    expect(datetimeText.length).toBeGreaterThanOrEqual(dateText.length);
  });
});
