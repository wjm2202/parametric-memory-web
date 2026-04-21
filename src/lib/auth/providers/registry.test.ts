/**
 * Unit tests for the provider registry.
 *
 * Every test builds its own registry via `createRegistry` with a
 * synthetic `Config` — the module-level `registry` export is
 * intentionally NOT imported (same discipline as pkce-store.test).
 *
 * Coverage strategy
 * ─────────────────
 *   - Unknown ids return null (unknown provider AND typo branches).
 *   - Both providers reachable when both are fully configured.
 *   - Unconfigured providers return null (one missing half).
 *   - Lookup is cached — repeat calls return the same instance.
 *   - `overrides` short-circuits the real factory so tests can inject
 *     fakes without constructing real adapters.
 *   - redirectUriFor builds the right URL and strips trailing slashes.
 */
import { describe, it, expect } from "vitest";
import { createRegistry, redirectUriFor, type ProviderRegistry } from "./registry";
import type { AuthProvider } from "./types";
import type { Config } from "@/config";

/**
 * Minimal config builder for tests. Every field has a safe default;
 * individual tests override only what they care about.
 */
function cfg(overrides: Partial<Config> = {}): Config {
  return {
    authOauthEnabled: true,
    computeOauthBridgeSigningKey: "x".repeat(32),
    mmpmComputeUrl: "http://localhost:3100",
    googleOauthClientId: "",
    googleOauthClientSecret: "",
    githubOauthClientId: "",
    githubOauthClientSecret: "",
    publicSiteUrl: "http://localhost:3000",
    ...overrides,
  };
}

/** A fake provider that exposes identity + throws on use. */
function fakeProvider(id: "google" | "github"): AuthProvider {
  return {
    id,
    displayName: id === "google" ? "Google" : "GitHub",
    isOidc: id === "google",
    buildAuthorizeUrl() {
      return `https://fake/${id}/authorize`;
    },
    async exchangeCode() {
      throw new Error("fakeProvider: not implemented");
    },
  };
}

describe("createRegistry — lookup behaviour", () => {
  it("returns null for unknown ids", () => {
    const r = createRegistry(cfg());
    expect(r.get("saml:acme")).toBeNull();
    expect(r.get("apple")).toBeNull();
    expect(r.get("")).toBeNull();
    // Defensive: a missing/undefined-ish string must not crash.
    expect(r.get("Google")).toBeNull(); // case-sensitive — matches URL segments
  });

  it("returns null for google when client id is empty", () => {
    const r = createRegistry(
      cfg({
        googleOauthClientId: "",
        googleOauthClientSecret: "secret-only",
      }),
    );
    expect(r.get("google")).toBeNull();
  });

  it("returns null for google when client secret is empty", () => {
    const r = createRegistry(
      cfg({
        googleOauthClientId: "id-only",
        googleOauthClientSecret: "",
      }),
    );
    expect(r.get("google")).toBeNull();
  });

  it("returns a Google adapter when fully configured", () => {
    const r = createRegistry(
      cfg({
        googleOauthClientId: "g-id",
        googleOauthClientSecret: "g-secret",
      }),
    );
    const p = r.get("google");
    expect(p).not.toBeNull();
    expect(p!.id).toBe("google");
    expect(p!.displayName).toBe("Google");
    expect(p!.isOidc).toBe(true);
  });

  it("returns a GitHub adapter when fully configured", () => {
    const r = createRegistry(
      cfg({
        githubOauthClientId: "gh-id",
        githubOauthClientSecret: "gh-secret",
      }),
    );
    const p = r.get("github");
    expect(p).not.toBeNull();
    expect(p!.id).toBe("github");
    expect(p!.isOidc).toBe(false);
  });
});

describe("createRegistry — caching", () => {
  it("repeat lookups for the same id return the SAME adapter instance", () => {
    const r = createRegistry(
      cfg({
        googleOauthClientId: "g-id",
        googleOauthClientSecret: "g-secret",
      }),
    );
    const first = r.get("google");
    const second = r.get("google");
    const third = r.get("google");
    expect(first).not.toBeNull();
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("caches the null result for unconfigured providers (no re-check on every call)", () => {
    // Verifying the negative cache is a little awkward — we prove it
    // by mutating the cfg object reference AFTER the first lookup and
    // confirming the registry doesn't notice. That's the point of
    // caching: config is read once per provider.
    const c = cfg({
      githubOauthClientId: "",
      githubOauthClientSecret: "",
    });
    const r: ProviderRegistry = createRegistry(c);
    expect(r.get("github")).toBeNull();

    // Mutating after the fact — if the registry re-read config it
    // would now return a real adapter. The cache keeps the original
    // null answer.
    c.githubOauthClientId = "gh-id";
    c.githubOauthClientSecret = "gh-secret";
    expect(r.get("github")).toBeNull();
  });
});

describe("createRegistry — overrides", () => {
  it("returns the override instead of constructing a real adapter", () => {
    const fake = fakeProvider("google");
    const r = createRegistry(
      // Config says google is unconfigured — overrides still win.
      cfg({ googleOauthClientId: "", googleOauthClientSecret: "" }),
      { google: fake },
    );
    expect(r.get("google")).toBe(fake);
  });

  it("overrides one provider without affecting the other", () => {
    const fakeGoogle = fakeProvider("google");
    const r = createRegistry(
      cfg({
        githubOauthClientId: "gh-id",
        githubOauthClientSecret: "gh-secret",
      }),
      { google: fakeGoogle },
    );
    expect(r.get("google")).toBe(fakeGoogle);
    expect(r.get("github")?.id).toBe("github");
  });
});

describe("redirectUriFor — URL construction", () => {
  it("builds the standard callback path for each provider", () => {
    const c = cfg({ publicSiteUrl: "https://parametric-memory.dev" });
    expect(redirectUriFor("google", c)).toBe(
      "https://parametric-memory.dev/api/auth/oauth/google/callback",
    );
    expect(redirectUriFor("github", c)).toBe(
      "https://parametric-memory.dev/api/auth/oauth/github/callback",
    );
  });

  it("handles localhost dev URL", () => {
    const c = cfg({ publicSiteUrl: "http://localhost:3000" });
    expect(redirectUriFor("google", c)).toBe(
      "http://localhost:3000/api/auth/oauth/google/callback",
    );
  });

  it("strips any trailing slash from publicSiteUrl defensively", () => {
    // Config validator rejects paths, but an accidental trailing `/`
    // on the origin is harmless enough that we normalise rather than
    // fail. Prevents `.../callback` doubling up into `...//callback`.
    const c = cfg({ publicSiteUrl: "https://parametric-memory.dev" });
    (c as { publicSiteUrl: string }).publicSiteUrl = "https://parametric-memory.dev/";
    expect(redirectUriFor("google", c)).toBe(
      "https://parametric-memory.dev/api/auth/oauth/google/callback",
    );
  });
});
