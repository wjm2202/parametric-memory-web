/**
 * Tests for SignupClient — F-SIGNUP-1: checkoutUrl silent drop bug fix.
 *
 * Covers:
 *   1. New account with valid checkoutUrl → CheckEmailView shows "Complete payment →" CTA
 *   2. New account with missing checkoutUrl → toast.error + redirect to /pricing
 *   3. Existing account (409) → CheckEmailView in existing-account mode
 *   4. Validation error (422) → inline error, no navigation
 *   5. Generic server error with canonical ApiError envelope → human_message shown
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SignupClient from "./SignupClient";

// ── Hoisted spy state ─────────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  return {
    mockToast: Object.assign(vi.fn(), {
      info: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    }),
    // Mutable mock for useSearchParams — individual tests override `params` to
    // simulate landing on `/signup?checkout=cancelled` etc.
    searchParamsState: { params: new URLSearchParams() } as { params: URLSearchParams },
  };
});

// ── Next.js mocks ─────────────────────────────────────────────────────────────

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

vi.mock("next/navigation", () => ({
  // Each call returns an object backed by the hoisted state, so tests can
  // flip the param set without re-mocking.
  useSearchParams: () => ({
    get: (key: string) => h.searchParamsState.params.get(key),
  }),
}));

// ── sonner mock ───────────────────────────────────────────────────────────────

vi.mock("sonner", () => ({
  toast: h.mockToast,
  Toaster: () => null,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_SIGNUP_RESULT = {
  customerId: "cust_abc123",
  slug: "swift-meadow",
  tier: "starter",
  mcpEndpoint: "https://swift-meadow.mmpm.co.nz/mcp",
  apiKey: "mmk_test_abc123",
  checkoutUrl: "https://checkout.stripe.com/pay/cs_test_abc123",
  limits: {
    maxAtoms: 10000,
    maxBootstrapsPerMonth: 100,
    maxStorageMB: 512,
    maxMonthlyCents: 1900,
    maxSubstrates: 1,
  },
  status: "pending_payment",
  mcpConfig: {
    mcpServers: {
      "Memory-mcp": {
        command: "npx",
        args: ["-y", "@mmpm/mcp-client", "https://swift-meadow.mmpm.co.nz/mcp"],
      },
    },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fill and submit the signup form with test@example.com */
async function fillAndSubmit() {
  const emailInput = screen.getByLabelText(/email address/i);
  fireEvent.change(emailInput, { target: { value: "test@example.com" } });

  const checkbox = screen.getByRole("checkbox");
  fireEvent.click(checkbox);

  const submitBtn = screen.getByRole("button", { name: /continue/i });
  fireEvent.click(submitBtn);
}

// ── Global lifecycle ──────────────────────────────────────────────────────────

beforeEach(() => {
  h.mockToast.mockReset();
  h.mockToast.info.mockReset();
  h.mockToast.success.mockReset();
  h.mockToast.error.mockReset();

  // Reset search params every test so cancel banner only shows where explicitly
  // set. Individual tests mutate h.searchParamsState.params before render().
  h.searchParamsState.params = new URLSearchParams();

  // Writable window.location.href so we can spy on redirects
  Object.defineProperty(window, "location", {
    writable: true,
    value: { href: "" },
  });
});

// ── Test 1: successful new account with valid checkoutUrl ─────────────────────

describe("SignupClient — new account with valid checkoutUrl", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/signup") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve(VALID_SIGNUP_RESULT),
        });
      }
      if (url === "/api/auth/request-link") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders CheckEmailView after successful signup", async () => {
    render(<SignupClient />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
  });

  it("shows the 'Complete payment →' button in CheckEmailView", async () => {
    render(<SignupClient />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /complete payment/i })).toBeInTheDocument();
    });
  });

  it("shows the activation copy above the payment button", async () => {
    render(<SignupClient />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(
        screen.getByText(/activate your substrate by completing payment/i),
      ).toBeInTheDocument();
    });
  });

  it("clicking 'Complete payment →' navigates to checkoutUrl", async () => {
    render(<SignupClient />);
    await fillAndSubmit();

    const payBtn = await screen.findByRole("button", { name: /complete payment/i });
    fireEvent.click(payBtn);

    expect(window.location.href).toBe(VALID_SIGNUP_RESULT.checkoutUrl);
  });

  it("does NOT call toast.error on a valid response", async () => {
    render(<SignupClient />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
    expect(h.mockToast.error).not.toHaveBeenCalled();
  });

  it("shows the API key card for new accounts", async () => {
    render(<SignupClient />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText(/api key — shown once/i)).toBeInTheDocument();
    });
  });
});

// ── Test 2: new account without checkoutUrl (corrupted backend) ───────────────

describe("SignupClient — new account with missing checkoutUrl", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Return a 201 but with checkoutUrl omitted — simulates a backend regression
    const { checkoutUrl: _omitted, ...withoutCheckoutUrl } = VALID_SIGNUP_RESULT;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/signup") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve(withoutCheckoutUrl),
        });
      }
      if (url === "/api/auth/request-link") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls toast.error mentioning 'checkout link is missing'", async () => {
    render(<SignupClient />);
    await fillAndSubmit();

    await waitFor(() => {
      expect(h.mockToast.error).toHaveBeenCalledTimes(1);
    });

    const [message] = h.mockToast.error.mock.calls[0];
    expect(message).toMatch(/checkout link is missing/i);
  });

  it("redirects to /pricing", async () => {
    render(<SignupClient />);
    await fillAndSubmit();

    await waitFor(() => {
      expect(window.location.href).toBe("/pricing");
    });
  });

  it("does NOT show CheckEmailView", async () => {
    render(<SignupClient />);
    await fillAndSubmit();

    await waitFor(() => {
      expect(h.mockToast.error).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
  });
});

// ── Test 3: existing account (409) ───────────────────────────────────────────

describe("SignupClient — existing account (409)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/signup") {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: () => Promise.resolve({ error: "email_exists" }),
        });
      }
      if (url === "/api/auth/request-link") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("shows CheckEmailView in existing-account mode", async () => {
    render(<SignupClient />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    });
  });

  it("does NOT show the Complete payment button for existing accounts", async () => {
    render(<SignupClient />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /complete payment/i })).not.toBeInTheDocument();
  });

  it("does NOT show the API key card for existing accounts", async () => {
    render(<SignupClient />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/api key — shown once/i)).not.toBeInTheDocument();
  });
});

// ── Test 4: validation error (422) ───────────────────────────────────────────

describe("SignupClient — validation error (422)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/signup") {
        return Promise.resolve({
          ok: false,
          status: 422,
          json: () => Promise.resolve({ fields: ["email"] }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("shows inline error mentioning the field", async () => {
    render(<SignupClient />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText(/validation error: email/i)).toBeInTheDocument();
    });
  });

  it("does NOT navigate away", async () => {
    render(<SignupClient />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText(/validation error: email/i)).toBeInTheDocument();
    });
    expect(window.location.href).toBe("");
  });

  it("does NOT show CheckEmailView", async () => {
    render(<SignupClient />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText(/validation error: email/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
  });
});

// ── Test 5: generic server error with canonical ApiError envelope ─────────────

describe("SignupClient — 500 with canonical ApiError envelope", () => {
  const originalFetch = globalThis.fetch;

  const canonicalError = {
    error_code: "signup_failed",
    human_message: "Signup temporarily unavailable.",
    ai_message: "signup_failed: DB write timed out. Retry.",
    next_action: "Try again in a minute.",
  };

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/signup") {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve(canonicalError),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("shows human_message from the ApiError envelope", async () => {
    render(<SignupClient />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText("Signup temporarily unavailable.")).toBeInTheDocument();
    });
  });

  it("does NOT show the generic fallback message", async () => {
    render(<SignupClient />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText("Signup temporarily unavailable.")).toBeInTheDocument();
    });
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("does NOT navigate away", async () => {
    render(<SignupClient />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText("Signup temporarily unavailable.")).toBeInTheDocument();
    });
    expect(window.location.href).toBe("");
  });
});

// ── F-BILLING-1: cancel-landing banner on /signup?checkout=cancelled ──────────

describe("SignupClient — cancel-landing banner (F-BILLING-1)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Stub fetch so the banner tests don't accidentally touch the network
    // (the banner renders BEFORE any form submit, so no fetch is expected,
    // but defensive stubbing keeps failures loud and specific).
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders the banner when ?checkout=cancelled is present", () => {
    h.searchParamsState.params = new URLSearchParams("checkout=cancelled");
    render(<SignupClient />);
    expect(screen.getByTestId("signup-cancel-banner")).toBeInTheDocument();
    expect(screen.getByText(/Payment cancelled/i)).toBeInTheDocument();
    expect(screen.getByText(/no charge was made/i)).toBeInTheDocument();
  });

  it("does NOT render the banner when no checkout param is set", () => {
    // Default state — h.searchParamsState.params is empty per beforeEach.
    render(<SignupClient />);
    expect(screen.queryByTestId("signup-cancel-banner")).not.toBeInTheDocument();
  });

  it("does NOT render the banner for unrelated checkout values", () => {
    // Defence in depth — only the exact string "cancelled" should trigger it.
    h.searchParamsState.params = new URLSearchParams("checkout=success");
    render(<SignupClient />);
    expect(screen.queryByTestId("signup-cancel-banner")).not.toBeInTheDocument();
  });

  it("dismisses locally when the ✕ is clicked", () => {
    h.searchParamsState.params = new URLSearchParams("checkout=cancelled");
    render(<SignupClient />);
    expect(screen.getByTestId("signup-cancel-banner")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByTestId("signup-cancel-banner")).not.toBeInTheDocument();
  });

  it("banner renders alongside the signup form (not instead of it)", () => {
    h.searchParamsState.params = new URLSearchParams("checkout=cancelled");
    render(<SignupClient />);
    // Regression guard: the banner must NOT replace the form — the whole
    // point of the banner is to help the user retry the flow right there.
    expect(screen.getByTestId("signup-cancel-banner")).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
  });

  it("banner hides once the user completes signup (CheckEmailView takes over)", async () => {
    // Once the user re-submits successfully we show CheckEmailView which has
    // its own "Complete payment →" CTA — stacking the cancel banner on top
    // would be redundant and noisy.
    h.searchParamsState.params = new URLSearchParams("checkout=cancelled");
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/signup") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve(VALID_SIGNUP_RESULT),
        });
      }
      if (url === "/api/auth/request-link") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    render(<SignupClient />);
    expect(screen.getByTestId("signup-cancel-banner")).toBeInTheDocument();

    await fillAndSubmit();
    // NOTE: target a string unique to CheckEmailView — the banner's own copy
    // contains "Check your email for the sign-in link…", which would otherwise
    // false-positive this assertion before CheckEmailView actually mounted.
    await waitFor(() => {
      expect(screen.getByText(/we sent a sign-in link to/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("signup-cancel-banner")).not.toBeInTheDocument();
  });
});
