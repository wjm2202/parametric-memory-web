/**
 * Unit tests for CapReachedCard (SM-MULTI-1).
 *
 * The card replaces the dead-end "substrate_cap_reached" error text with an
 * actionable migrate path. These tests pin: the explanation reflects the
 * account tier + counts; the upgrade CTA names the next tier up and links to
 * the dashboard; the "add second instance" CTA stays hidden while the
 * cap-model rework (SM-MULTI-3) is unshipped; and the top-tier case degrades
 * gracefully.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// next/link → plain anchor (mirrors the sibling pricing tests).
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { CapReachedCard } from "./CapReachedCard";

describe("CapReachedCard", () => {
  it("explains the Starter single-instance limit and offers an upgrade to Solo", () => {
    render(<CapReachedCard tier="starter" activeCount={1} ceiling={1} />);

    const card = screen.getByTestId("cap-reached-card");
    // Names the tier, the ceiling, and the current usage.
    expect(card.textContent).toContain("Starter");
    expect(card.textContent).toContain("1 memory instance");
    expect(card.textContent).toContain("running 1");

    // Primary CTA points at the dashboard and names the next tier up (Solo).
    const cta = screen.getByTestId("cap-reached-upgrade-cta");
    expect(cta.getAttribute("href")).toBe("/dashboard");
    expect(cta.textContent).toContain("Solo");
  });

  it("pluralises the instance word and names the next tier for a Solo account", () => {
    render(<CapReachedCard tier="indie" activeCount={2} ceiling={2} />);
    const card = screen.getByTestId("cap-reached-card");
    expect(card.textContent).toContain("Solo");
    expect(card.textContent).toContain("2 memory instances");
    // indie → pro = "Professional"
    expect(screen.getByTestId("cap-reached-upgrade-cta").textContent).toContain("Professional");
  });

  it("degrades gracefully on the top tier (no next tier to upgrade to)", () => {
    render(<CapReachedCard tier="team" activeCount={5} ceiling={5} />);
    const card = screen.getByTestId("cap-reached-card");
    expect(card.textContent).toContain("highest tier");
    // CTA falls back to a neutral manage label, still linking to the dashboard.
    const cta = screen.getByTestId("cap-reached-upgrade-cta");
    expect(cta.textContent).toContain("Manage my plan");
    expect(cta.getAttribute("href")).toBe("/dashboard");
  });

  it("does NOT render an 'add a second instance' CTA (at true ceiling, only upgrade/deprovision apply)", () => {
    render(<CapReachedCard tier="starter" activeCount={1} ceiling={1} />);
    expect(screen.queryByTestId("cap-reached-add-cta")).toBeNull();
  });

  it("renders a Close button only when onClose is provided (drawer context)", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <CapReachedCard tier="starter" activeCount={1} ceiling={1} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<CapReachedCard tier="starter" activeCount={1} ceiling={1} />);
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
  });
});
