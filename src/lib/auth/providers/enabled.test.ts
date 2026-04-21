/**
 * Unit tests for getEnabledOauthProviders.
 *
 * Coverage:
 *   1. Flag off → [] regardless of credentials  (the hard gate)
 *   2. Flag on, nothing configured → []         (safe default)
 *   3. Flag on, only google configured → ["google"]
 *   4. Flag on, only github configured → ["github"]
 *   5. Flag on, both configured → ["google", "github"]  (order check)
 *   6. Flag on, google has id but empty secret → []     (belt-and-braces)
 *
 * These tests use a synthetic `Config` rather than `loadConfig()` so
 * we aren't coupling to whatever `loadConfig()` does with env vars —
 * this helper's contract is "given a Config, return the list".
 */
import { describe, it, expect } from "vitest";
import { getEnabledOauthProviders } from "./enabled";
import type { Config } from "@/config";

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

describe("getEnabledOauthProviders — hard gate on feature flag", () => {
  it("returns [] when authOauthEnabled is false, even with all creds set", () => {
    const result = getEnabledOauthProviders(
      cfg({
        authOauthEnabled: false,
        googleOauthClientId: "g-id",
        googleOauthClientSecret: "g-secret",
        githubOauthClientId: "gh-id",
        githubOauthClientSecret: "gh-secret",
      }),
    );
    expect(result).toEqual([]);
  });
});

describe("getEnabledOauthProviders — per-provider gating", () => {
  it("returns [] when flag is on but no providers are configured", () => {
    expect(getEnabledOauthProviders(cfg())).toEqual([]);
  });

  it("returns ['google'] when only Google is fully configured", () => {
    const result = getEnabledOauthProviders(
      cfg({ googleOauthClientId: "g-id", googleOauthClientSecret: "g-secret" }),
    );
    expect(result).toEqual(["google"]);
  });

  it("returns ['github'] when only GitHub is fully configured", () => {
    const result = getEnabledOauthProviders(
      cfg({ githubOauthClientId: "gh-id", githubOauthClientSecret: "gh-secret" }),
    );
    expect(result).toEqual(["github"]);
  });

  it("returns both in declared order when both are fully configured", () => {
    const result = getEnabledOauthProviders(
      cfg({
        googleOauthClientId: "g-id",
        googleOauthClientSecret: "g-secret",
        githubOauthClientId: "gh-id",
        githubOauthClientSecret: "gh-secret",
      }),
    );
    // Order is Google, then GitHub — consumer-first, matches declaration table.
    expect(result).toEqual(["google", "github"]);
  });
});

describe("getEnabledOauthProviders — half-configured guard", () => {
  // loadConfig() already rejects half-configured providers at boot,
  // but this helper must stay correct if that boot guard ever relaxes.
  it("excludes google when clientId is set but secret is empty", () => {
    const result = getEnabledOauthProviders(
      cfg({ googleOauthClientId: "g-id", googleOauthClientSecret: "" }),
    );
    expect(result).toEqual([]);
  });

  it("excludes github when secret is set but clientId is empty", () => {
    const result = getEnabledOauthProviders(
      cfg({ githubOauthClientId: "", githubOauthClientSecret: "gh-secret" }),
    );
    expect(result).toEqual([]);
  });
});
