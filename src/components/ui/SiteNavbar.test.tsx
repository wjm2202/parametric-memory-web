/**
 * Tests for SiteNavbar — M5 (mobile hamburger drawer) + pre-registered testids
 * from docs/DUAL-ACCESSIBILITY.md.
 *
 * Scope:
 *   - Standard variant renders the correct nav-* testids (nav-home,
 *     nav-link-*, nav-auth-signin / nav-auth-dashboard).
 *   - Hamburger button exists with correct aria-expanded / aria-controls.
 *   - Drawer is hidden (aria-hidden=true) by default.
 *   - Clicking the hamburger opens the drawer, flipping aria-expanded and
 *     exposing nav-drawer-close + every nav-link-* inside it.
 *   - Clicking the close button returns focus to the hamburger.
 *   - ESC key closes the drawer.
 *   - Clicking the backdrop closes the drawer.
 *   - Clicking a link inside the drawer closes it.
 *   - Body scroll lock toggles with drawer state.
 *   - Immersive variant uses the separate nav-immersive-* testids and
 *     renders no hamburger / drawer.
 *   - verified=true swaps nav-auth-signin → nav-auth-dashboard everywhere.
 *
 * The test intentionally uses `within()` scoping wherever a testid is
 * duplicated between the desktop centre nav and the drawer (per
 * DUAL-ACCESSIBILITY.md the drawer reuses nav-link-* testids).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import SiteNavbar from "./SiteNavbar";

// ── next/link passthrough ──────────────────────────────────────────────────

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

// ── next/navigation mock ───────────────────────────────────────────────────

const pathState = { current: "/" };

vi.mock("next/navigation", () => ({
  usePathname: () => pathState.current,
}));

// ── fetch mock for /api/auth/me ────────────────────────────────────────────

beforeEach(() => {
  pathState.current = "/";
  // Default: never resolves in the test lifetime — useAuthState stays in its
  // initial optimistic state. Individual tests can override.
  global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
  document.body.style.overflow = "";
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.style.overflow = "";
});

// ═══════════════════════════════════════════════════════════════════════════
// Standard variant — baseline testid coverage
// ═══════════════════════════════════════════════════════════════════════════

describe("SiteNavbar standard variant — testid coverage", () => {
  it("renders the logo with nav-home and the correct aria-label", () => {
    render(<SiteNavbar isLoggedIn={false} />);
    const home = screen.getByTestId("nav-home");
    expect(home).toHaveAttribute("href", "/");
    expect(home).toHaveAttribute("aria-label", "Parametric Memory — home");
  });

  it("renders all nav-link-* testids in the desktop centre nav", () => {
    render(<SiteNavbar isLoggedIn={false} />);
    // Scope to the <nav aria-label="Primary">
    const primary = screen.getByRole("navigation", { name: "Primary" });
    const expected = [
      ["nav-link-docs", "/docs"],
      ["nav-link-about", "/about"],
      ["nav-link-blog", "/blog"],
      ["nav-link-pricing", "/pricing"],
      ["nav-link-faq", "/faq"],
      ["nav-link-legal", "/terms"],
      ["nav-link-privacy", "/privacy"],
      ["nav-link-knowledge", "/knowledge"],
    ] as const;
    for (const [testid, href] of expected) {
      const link = within(primary).getByTestId(testid);
      expect(link).toHaveAttribute("href", href);
    }
  });

  it("shows nav-auth-signin when logged out and not nav-auth-dashboard", () => {
    render(<SiteNavbar isLoggedIn={false} />);
    const primary = screen.getByRole("navigation", { name: "Primary" });
    expect(within(primary).getByTestId("nav-auth-signin")).toHaveAttribute("href", "/login");
    expect(within(primary).queryByTestId("nav-auth-dashboard")).toBeNull();
  });

  it("shows nav-auth-dashboard when logged in", () => {
    render(<SiteNavbar isLoggedIn={true} />);
    const primary = screen.getByRole("navigation", { name: "Primary" });
    const dash = within(primary).getByTestId("nav-auth-dashboard");
    expect(dash).toHaveAttribute("href", "/dashboard");
    expect(dash).toHaveAttribute("aria-label", "Open dashboard");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Hamburger — presence + a11y wiring
// ═══════════════════════════════════════════════════════════════════════════

describe("SiteNavbar hamburger button (M5)", () => {
  it("renders with the correct testid, aria-label, and aria-controls", () => {
    render(<SiteNavbar isLoggedIn={false} />);
    const btn = screen.getByTestId("nav-hamburger");
    expect(btn).toHaveAttribute("aria-label", "Open navigation menu");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).toHaveAttribute("aria-controls", "nav-drawer");
  });

  it("has a minimum 44×44 tap target (h-11 w-11)", () => {
    render(<SiteNavbar isLoggedIn={false} />);
    const btn = screen.getByTestId("nav-hamburger");
    // Tailwind h-11/w-11 → 2.75rem → 44px at default root font-size.
    expect(btn.className).toMatch(/\bh-11\b/);
    expect(btn.className).toMatch(/\bw-11\b/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Drawer — open / close behaviour
// ═══════════════════════════════════════════════════════════════════════════

describe("SiteNavbar mobile drawer (M5)", () => {
  it("is aria-hidden by default and flips when the hamburger is clicked", () => {
    render(<SiteNavbar isLoggedIn={false} />);
    const drawer = screen.getByTestId("nav-drawer");
    const wrapper = drawer.parentElement as HTMLElement;

    // Closed state
    expect(wrapper).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("nav-hamburger")).toHaveAttribute("aria-expanded", "false");

    // Open
    fireEvent.click(screen.getByTestId("nav-hamburger"));
    expect(wrapper).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByTestId("nav-hamburger")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("nav-hamburger")).toHaveAttribute(
      "aria-label",
      "Close navigation menu",
    );
  });

  it("renders nav-drawer-close with correct aria-label", () => {
    render(<SiteNavbar isLoggedIn={false} />);
    fireEvent.click(screen.getByTestId("nav-hamburger"));
    const close = screen.getByTestId("nav-drawer-close");
    expect(close).toHaveAttribute("aria-label", "Close navigation menu");
  });

  it("exposes every nav-link-* inside the drawer (DUAL-ACCESSIBILITY reuse rule)", () => {
    render(<SiteNavbar isLoggedIn={false} />);
    fireEvent.click(screen.getByTestId("nav-hamburger"));
    const drawer = screen.getByTestId("nav-drawer");
    for (const testid of [
      "nav-link-docs",
      "nav-link-about",
      "nav-link-blog",
      "nav-link-pricing",
      "nav-link-faq",
      "nav-link-legal",
      "nav-link-privacy",
      "nav-link-knowledge",
    ]) {
      expect(within(drawer).getByTestId(testid)).toBeInTheDocument();
    }
  });

  it("ESC closes the drawer", () => {
    render(<SiteNavbar isLoggedIn={false} />);
    fireEvent.click(screen.getByTestId("nav-hamburger"));
    expect(screen.getByTestId("nav-hamburger")).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("nav-hamburger")).toHaveAttribute("aria-expanded", "false");
  });

  it("the close button closes the drawer and returns focus to the hamburger", () => {
    render(<SiteNavbar isLoggedIn={false} />);
    const ham = screen.getByTestId("nav-hamburger");
    fireEvent.click(ham);

    const close = screen.getByTestId("nav-drawer-close");
    fireEvent.click(close);

    expect(ham).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(ham);
  });

  it("clicking a link inside the drawer closes it", () => {
    render(<SiteNavbar isLoggedIn={false} />);
    fireEvent.click(screen.getByTestId("nav-hamburger"));
    const drawer = screen.getByTestId("nav-drawer");
    fireEvent.click(within(drawer).getByTestId("nav-link-pricing"));
    expect(screen.getByTestId("nav-hamburger")).toHaveAttribute("aria-expanded", "false");
  });

  it("clicking the backdrop closes the drawer", () => {
    render(<SiteNavbar isLoggedIn={false} />);
    fireEvent.click(screen.getByTestId("nav-hamburger"));
    // The backdrop is the <button aria-label="Close navigation menu"> that is
    // a sibling of the drawer panel (not the nav-drawer-close button which has
    // the testid). Select the first one that is not the testid-carrying close.
    const closeLabelled = screen.getAllByLabelText("Close navigation menu");
    // closeLabelled[0] is the backdrop, closeLabelled[1] is nav-drawer-close
    // (the drawer is rendered after the backdrop).
    const backdrop = closeLabelled.find((el) => !el.hasAttribute("data-testid"));
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(screen.getByTestId("nav-hamburger")).toHaveAttribute("aria-expanded", "false");
  });

  it("locks body scroll while open and restores it on close", () => {
    render(<SiteNavbar isLoggedIn={false} />);
    expect(document.body.style.overflow).toBe("");
    fireEvent.click(screen.getByTestId("nav-hamburger"));
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByTestId("nav-drawer-close"));
    // After close, the effect cleanup restores the previous value (empty string).
    expect(document.body.style.overflow).toBe("");
  });

  it("closes automatically on pathname change", () => {
    const { rerender } = render(<SiteNavbar isLoggedIn={false} />);
    fireEvent.click(screen.getByTestId("nav-hamburger"));
    expect(screen.getByTestId("nav-hamburger")).toHaveAttribute("aria-expanded", "true");

    act(() => {
      pathState.current = "/pricing";
    });
    rerender(<SiteNavbar isLoggedIn={false} />);
    expect(screen.getByTestId("nav-hamburger")).toHaveAttribute("aria-expanded", "false");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Immersive variant — no drawer, separate testids
// ═══════════════════════════════════════════════════════════════════════════

describe("SiteNavbar immersive variant", () => {
  it("uses nav-immersive-home / nav-immersive-auth testids", () => {
    render(<SiteNavbar isLoggedIn={false} variant="immersive" />);
    const home = screen.getByTestId("nav-immersive-home");
    expect(home).toHaveAttribute("aria-label", "Parametric Memory — home");

    const auth = screen.getByTestId("nav-immersive-auth");
    expect(auth).toHaveAttribute("href", "/login");
    expect(auth).toHaveAttribute("aria-label", "Sign in");
  });

  it("does not render a hamburger or drawer in immersive variant", () => {
    render(<SiteNavbar isLoggedIn={false} variant="immersive" />);
    expect(screen.queryByTestId("nav-hamburger")).toBeNull();
    expect(screen.queryByTestId("nav-drawer")).toBeNull();
  });

  it("verified user → nav-immersive-auth points at /dashboard", () => {
    render(<SiteNavbar isLoggedIn={true} variant="immersive" />);
    const auth = screen.getByTestId("nav-immersive-auth");
    expect(auth).toHaveAttribute("href", "/dashboard");
    expect(auth).toHaveAttribute("aria-label", "Open dashboard");
  });
});
