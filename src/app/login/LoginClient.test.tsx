/**
 * Tests for LoginClient — focused on S2T8 (OAuth provider buttons,
 * flag-gated). The email magic-link form is covered elsewhere and
 * re-testing it here would duplicate coverage.
 *
 * What we assert
 * ──────────────
 *   1. `oauthProviders=[]` → NEITHER OAuth button renders. Flag-off
 *      parity with the server route (404 on /api/auth/oauth/*).
 *   2. `oauthProviders=["google"]` → only Google button, correct href.
 *   3. `oauthProviders=["github"]` → only GitHub button, correct href.
 *   4. Both providers → both buttons in declared order.
 *   5. URL query `?redirect=/dashboard` → href includes
 *      `&returnTo=%2Fdashboard` (URL-encoded).
 *   6. Untrusted `?redirect=//evil.com` → href OMITS returnTo (open-
 *      redirect defense matches `RedirectCookieSetter`'s rule).
 *
 * Next.js mock strategy mirrors `DashboardClient.test.tsx` —
 * `next/navigation` and `next/link` are stubbed so the component
 * can render in jsdom without a full Next runtime.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginClient from "./LoginClient";

// ── Per-test searchParams control ─────────────────────────────────────────────
// A mutable URLSearchParams instance the `useSearchParams` mock reads
// from. Tests mutate this in `beforeEach` via the `setSearchParams`
// helper below — cleaner than re-mocking per test.
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => currentSearchParams,
  // useRouter is unused by LoginClient but defensively stubbed — if a
  // future edit calls it, jsdom would otherwise explode.
  useRouter: () => ({ push: vi.fn() }),
}));

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

/**
 * Set the query string the rendered LoginClient will see. Reset in
 * `beforeEach` below so tests stay order-independent.
 */
function setSearchParams(query: string) {
  currentSearchParams = new URLSearchParams(query);
}

beforeEach(() => {
  setSearchParams("");
  // Stub fetch — LoginForm's submit handler touches it. Not exercised
  // in these tests but we don't want a dangling promise polluting
  // another test's output.
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: () => Promise.resolve({}),
    headers: new Headers(),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Flag-off behaviour ────────────────────────────────────────────────────────

describe("LoginClient — OAuth buttons: feature flag off", () => {
  it("renders neither OAuth button when oauthProviders is empty", () => {
    render(<LoginClient oauthProviders={[]} />);
    expect(screen.queryByText(/Join with Google/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Join with GitHub/i)).not.toBeInTheDocument();
    // Email form still present — flag-off must not break the magic-link fallback.
    expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument();
  });

  it("renders neither OAuth button when prop is omitted (default [])", () => {
    render(<LoginClient />);
    expect(screen.queryByText(/Join with Google/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Join with GitHub/i)).not.toBeInTheDocument();
  });
});

// ── Per-provider rendering ────────────────────────────────────────────────────

describe("LoginClient — OAuth buttons: provider-specific rendering", () => {
  it("renders only the Google button when oauthProviders=['google']", () => {
    render(<LoginClient oauthProviders={["google"]} />);

    const googleButton = screen.getByTestId("oauth-button-google");
    expect(googleButton).toBeInTheDocument();
    expect(googleButton).toHaveTextContent("Join with Google");
    expect(googleButton).toHaveAttribute("href", "/api/auth/oauth/google/start?intent=signin");

    expect(screen.queryByTestId("oauth-button-github")).not.toBeInTheDocument();
  });

  it("renders only the GitHub button when oauthProviders=['github']", () => {
    render(<LoginClient oauthProviders={["github"]} />);

    const githubButton = screen.getByTestId("oauth-button-github");
    expect(githubButton).toBeInTheDocument();
    expect(githubButton).toHaveTextContent("Join with GitHub");
    expect(githubButton).toHaveAttribute("href", "/api/auth/oauth/github/start?intent=signin");

    expect(screen.queryByTestId("oauth-button-google")).not.toBeInTheDocument();
  });

  it("renders both buttons in declared order when both providers are enabled", () => {
    render(<LoginClient oauthProviders={["google", "github"]} />);

    const buttons = screen.getAllByRole("link", { name: /Join with/i });
    expect(buttons).toHaveLength(2);
    // Source-order check — the first is Google (declared first in the
    // getEnabledOauthProviders table), the second is GitHub.
    expect(buttons[0]).toHaveAttribute("href", "/api/auth/oauth/google/start?intent=signin");
    expect(buttons[1]).toHaveAttribute("href", "/api/auth/oauth/github/start?intent=signin");
  });
});

// ── returnTo forwarding + open-redirect defense ───────────────────────────────

describe("LoginClient — OAuth buttons: returnTo forwarding", () => {
  it("forwards a safe relative ?redirect to the start route as returnTo", () => {
    setSearchParams("redirect=/dashboard");
    render(<LoginClient oauthProviders={["google"]} />);

    expect(screen.getByTestId("oauth-button-google")).toHaveAttribute(
      "href",
      "/api/auth/oauth/google/start?intent=signin&returnTo=%2Fdashboard",
    );
  });

  it("URL-encodes returnTo values that contain special characters", () => {
    // The incoming URL would be `?redirect=%2Fbilling%3Ftab%3Dinvoices%26from%3Demail`
    // (a single properly-encoded `redirect` param whose value is
    // `/billing?tab=invoices&from=email`). URLSearchParams decodes
    // that on ingress; our code re-encodes it on egress for the
    // outgoing `returnTo` param.
    setSearchParams("redirect=%2Fbilling%3Ftab%3Dinvoices%26from%3Demail");
    render(<LoginClient oauthProviders={["google"]} />);

    // `?` and `&` inside the returnTo value must be percent-encoded
    // so they're not read as new query params by the start route.
    expect(screen.getByTestId("oauth-button-google")).toHaveAttribute(
      "href",
      "/api/auth/oauth/google/start?intent=signin&returnTo=%2Fbilling%3Ftab%3Dinvoices%26from%3Demail",
    );
  });

  it("omits returnTo when ?redirect is a protocol-relative URL (open-redirect defense)", () => {
    setSearchParams("redirect=//evil.com/steal");
    render(<LoginClient oauthProviders={["google"]} />);

    // //evil.com is a protocol-relative URL — browsers would navigate
    // off-origin. Must be stripped identically to RedirectCookieSetter.
    expect(screen.getByTestId("oauth-button-google")).toHaveAttribute(
      "href",
      "/api/auth/oauth/google/start?intent=signin",
    );
  });

  it("omits returnTo when ?redirect is an absolute URL (open-redirect defense)", () => {
    setSearchParams("redirect=https%3A%2F%2Fevil.com");
    render(<LoginClient oauthProviders={["google"]} />);

    // An absolute URL decodes to `https://evil.com` — doesn't start
    // with `/` after decoding by URLSearchParams, so it's stripped.
    expect(screen.getByTestId("oauth-button-google")).toHaveAttribute(
      "href",
      "/api/auth/oauth/google/start?intent=signin",
    );
  });

  it("omits returnTo when ?redirect is absent", () => {
    render(<LoginClient oauthProviders={["github"]} />);

    expect(screen.getByTestId("oauth-button-github")).toHaveAttribute(
      "href",
      "/api/auth/oauth/github/start?intent=signin",
    );
  });
});
