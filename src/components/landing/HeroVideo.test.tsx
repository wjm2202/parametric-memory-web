/**
 * HeroVideo — sprint 2026-W17 contract test.
 *
 * Guards the user-visible promises of the new video hero:
 *   1. The element is muted (autoplay won't work without it on mobile).
 *   2. autoPlay/loop/playsInline are set.
 *   3. preload="auto" so the LCP-adjacent asset is fetched eagerly.
 *   4. A poster path is set so first paint isn't a black box.
 *   5. Two <source> entries — mobile (with media query) before desktop —
 *      because browsers pick the FIRST source they can play whose
 *      `media` matches.
 *   6. aria-hidden so screen readers ignore the decorative video.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroVideo } from "./HeroVideo";

describe("HeroVideo", () => {
  it("renders a <video> with the hero-video testid", () => {
    render(<HeroVideo />);
    const video = screen.getByTestId("hero-video");
    expect(video.tagName).toBe("VIDEO");
  });

  it("is muted, autoplays, loops, plays inline (mobile autoplay contract)", () => {
    render(<HeroVideo />);
    const video = screen.getByTestId("hero-video") as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(video.loop).toBe(true);
    // playsInline is reflected via the attribute on most jsdom builds.
    expect(video.getAttribute("playsinline")).not.toBeNull();
  });

  it("has preload='auto' and a poster path", () => {
    render(<HeroVideo />);
    const video = screen.getByTestId("hero-video");
    expect(video.getAttribute("preload")).toBe("auto");
    expect(video.getAttribute("poster")).toBe("/hero/hero-poster.jpg");
  });

  it("is aria-hidden (decorative — slogan is in DOM elsewhere)", () => {
    render(<HeroVideo />);
    expect(screen.getByTestId("hero-video")).toHaveAttribute("aria-hidden", "true");
  });

  it("declares mobile and desktop MP4 sources, mobile gated by media query", () => {
    render(<HeroVideo />);
    const sources = screen.getByTestId("hero-video").querySelectorAll("source");
    expect(sources).toHaveLength(2);
    // Mobile MUST be first — browsers pick the first matching source.
    expect(sources[0].getAttribute("src")).toBe("/hero/hero-mobile.mp4");
    expect(sources[0].getAttribute("media")).toBe("(max-width: 768px)");
    expect(sources[1].getAttribute("src")).toBe("/hero/hero-desktop.mp4");
    expect(sources[1].getAttribute("media")).toBeNull();
  });
});
