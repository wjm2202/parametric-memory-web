/**
 * Regression test for the `force-dynamic` export on the login page.
 *
 * Why this matters
 * ────────────────
 * If a future refactor strips `export const dynamic = "force-dynamic"`
 * from this page (or "tidies it up"), Next.js will statically render
 * /login at build time, baking `oauthProviders=[]` into the HTML
 * because the Docker build doesn't have the OAuth env vars in scope.
 * The running container's env vars then become irrelevant. Symptom:
 * /login on prod silently loses Google/GitHub buttons even though
 * AUTH_OAUTH_ENABLED=true is set.
 *
 * This test makes that regression a hard CI failure rather than a
 * silent prod outage discovered by a confused user.
 *
 * The page module imports `@/config` which calls `loadConfig()` at
 * module-load time and asserts on real env vars. We mock both that and
 * `getEnabledOauthProviders` so the test is hermetic.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/config", () => ({
  config: {
    authOauthEnabled: false,
    googleOauthClientId: "",
    googleOauthClientSecret: "",
    githubOauthClientId: "",
    githubOauthClientSecret: "",
  },
}));

vi.mock("@/lib/auth/providers/enabled", () => ({
  getEnabledOauthProviders: () => [],
}));

vi.mock("./LoginClient", () => ({
  default: () => null,
}));

describe("src/app/login/page module exports", () => {
  it("exports `dynamic = 'force-dynamic'` so OAuth env vars are read per request", async () => {
    const mod = await import("./page");
    expect((mod as { dynamic?: string }).dynamic).toBe("force-dynamic");
  });

  it("exports a default page component", async () => {
    const mod = await import("./page");
    expect(typeof mod.default).toBe("function");
  });

  it("exports metadata with the canonical /login URL", async () => {
    const mod = await import("./page");
    expect(mod.metadata.title).toBe("Sign In");
    expect(mod.metadata.alternates?.canonical).toBe("https://parametric-memory.dev/login");
  });
});
