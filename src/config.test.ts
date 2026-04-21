/**
 * Unit tests for the website config loader.
 *
 * Every branch of `loadConfig` is exercised with synthetic env objects so
 * the suite runs without touching `process.env`. The module-level cached
 * `config` export is deliberately NOT imported here — validating it would
 * require the test runner's own env to satisfy the OAuth rules, which
 * defeats the point of keeping validation testable.
 */
import { describe, it, expect } from "vitest";
import { loadConfig, ConfigError, MIN_BRIDGE_SIGNING_KEY_LENGTH } from "./config";

/**
 * A signing key the length validator accepts. Pad with 'x' so the literal
 * matches the minimum length exactly — one char shorter and validation
 * rejects, proving the boundary works.
 */
const VALID_KEY = "x".repeat(MIN_BRIDGE_SIGNING_KEY_LENGTH);
const SHORT_KEY = "x".repeat(MIN_BRIDGE_SIGNING_KEY_LENGTH - 1);

/**
 * A single-provider (Google only) env object that satisfies the new
 * "at least one provider configured when OAuth is enabled" rule. Most
 * feature-flag tests layer onto this base so they don't trip over the
 * provider rule unintentionally.
 */
const GOOGLE_PROVIDER_ENV = {
  GOOGLE_OAUTH_CLIENT_ID: "google-test-client-id.apps.googleusercontent.com",
  GOOGLE_OAUTH_CLIENT_SECRET: "GOCSPX-google-test-client-secret",
};

describe("loadConfig — defaults", () => {
  it("empty env yields a valid disabled-OAuth config", () => {
    const cfg = loadConfig({} as NodeJS.ProcessEnv);
    expect(cfg.authOauthEnabled).toBe(false);
    expect(cfg.computeOauthBridgeSigningKey).toBe("");
    expect(cfg.mmpmComputeUrl).toBe("http://localhost:3100");
  });

  it('empty-string AUTH_OAUTH_ENABLED falls back to false (parseBool treats "" as unset)', () => {
    const cfg = loadConfig({
      AUTH_OAUTH_ENABLED: "",
      COMPUTE_OAUTH_BRIDGE_SIGNING_KEY: "",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.authOauthEnabled).toBe(false);
    expect(cfg.computeOauthBridgeSigningKey).toBe("");
    // Note: MMPM_COMPUTE_URL = '' is NOT accepted and has its own test in
    // the URL-validation block below. The asymmetry is deliberate — a blank
    // boolean is a common "comment it out" pattern in .env files; a blank
    // URL is an operator mistake worth failing on.
  });
});

describe("loadConfig — AUTH_OAUTH_ENABLED parsing", () => {
  it('"true" enables the feature', () => {
    const cfg = loadConfig({
      AUTH_OAUTH_ENABLED: "true",
      COMPUTE_OAUTH_BRIDGE_SIGNING_KEY: VALID_KEY,
      ...GOOGLE_PROVIDER_ENV,
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.authOauthEnabled).toBe(true);
  });

  it('"false" explicitly disables', () => {
    const cfg = loadConfig({
      AUTH_OAUTH_ENABLED: "false",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.authOauthEnabled).toBe(false);
  });

  it('typos like "yes" or "1" throw — strict parsing prevents silent-false bugs', () => {
    for (const badValue of ["yes", "no", "1", "0", "on", "off", "TRUE", "True"]) {
      expect(() =>
        loadConfig({ AUTH_OAUTH_ENABLED: badValue } as unknown as NodeJS.ProcessEnv),
      ).toThrow(ConfigError);
    }
  });
});

describe("loadConfig — signing key length validation", () => {
  it("enabled + exactly-MIN-length key passes", () => {
    const cfg = loadConfig({
      AUTH_OAUTH_ENABLED: "true",
      COMPUTE_OAUTH_BRIDGE_SIGNING_KEY: VALID_KEY,
      ...GOOGLE_PROVIDER_ENV,
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.computeOauthBridgeSigningKey.length).toBe(MIN_BRIDGE_SIGNING_KEY_LENGTH);
  });

  it("enabled + one-char-short key throws ConfigError", () => {
    expect(() =>
      loadConfig({
        AUTH_OAUTH_ENABLED: "true",
        COMPUTE_OAUTH_BRIDGE_SIGNING_KEY: SHORT_KEY,
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/at least 32 characters/);
  });

  it("enabled + no key throws", () => {
    expect(() =>
      loadConfig({
        AUTH_OAUTH_ENABLED: "true",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(ConfigError);
  });

  it("disabled + short key is fine — length only matters when feature is live", () => {
    const cfg = loadConfig({
      AUTH_OAUTH_ENABLED: "false",
      COMPUTE_OAUTH_BRIDGE_SIGNING_KEY: SHORT_KEY,
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.authOauthEnabled).toBe(false);
    expect(cfg.computeOauthBridgeSigningKey).toBe(SHORT_KEY);
  });

  it("disabled + no key is fine — the dev default path", () => {
    const cfg = loadConfig({} as NodeJS.ProcessEnv);
    expect(cfg.computeOauthBridgeSigningKey).toBe("");
  });
});

describe("loadConfig — MMPM_COMPUTE_URL validation", () => {
  it("accepts a well-formed URL", () => {
    const cfg = loadConfig({
      MMPM_COMPUTE_URL: "https://memory.kiwi",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.mmpmComputeUrl).toBe("https://memory.kiwi");
  });

  it("accepts the local dev default when unset", () => {
    const cfg = loadConfig({} as NodeJS.ProcessEnv);
    expect(cfg.mmpmComputeUrl).toBe("http://localhost:3100");
  });

  it("rejects a malformed URL", () => {
    expect(() =>
      loadConfig({ MMPM_COMPUTE_URL: "not-a-url" } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/valid URL/);
  });

  it("rejects an empty string (a set-but-blank env is an operator mistake)", () => {
    // Empty string survives `??` (only undefined triggers the default) and
    // fails the URL parse. This guarantees `MMPM_COMPUTE_URL=` in .env.local
    // fails boot rather than silently falling back.
    expect(() => loadConfig({ MMPM_COMPUTE_URL: "" } as unknown as NodeJS.ProcessEnv)).toThrow(
      ConfigError,
    );
  });
});

describe("loadConfig — combined scenarios", () => {
  it("full production-like env is accepted", () => {
    const cfg = loadConfig({
      AUTH_OAUTH_ENABLED: "true",
      COMPUTE_OAUTH_BRIDGE_SIGNING_KEY: "a".repeat(64), // 64 hex chars is typical
      MMPM_COMPUTE_URL: "https://memory.kiwi",
      GOOGLE_OAUTH_CLIENT_ID: "prod-google-id.apps.googleusercontent.com",
      GOOGLE_OAUTH_CLIENT_SECRET: "GOCSPX-prod-google-secret",
      GITHUB_OAUTH_CLIENT_ID: "Iv1.prodgithubid",
      GITHUB_OAUTH_CLIENT_SECRET: "prod-github-secret-40chars-aaaaaaaaaaaaaaaaa",
      PUBLIC_SITE_URL: "https://parametric-memory.dev",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.authOauthEnabled).toBe(true);
    expect(cfg.computeOauthBridgeSigningKey.length).toBe(64);
    expect(cfg.mmpmComputeUrl).toBe("https://memory.kiwi");
    expect(cfg.googleOauthClientId).toBe("prod-google-id.apps.googleusercontent.com");
    expect(cfg.githubOauthClientId).toBe("Iv1.prodgithubid");
    expect(cfg.publicSiteUrl).toBe("https://parametric-memory.dev");
  });

  it("ConfigError is distinct from plain Error (so callers can catch selectively)", () => {
    try {
      loadConfig({
        AUTH_OAUTH_ENABLED: "true",
      } as unknown as NodeJS.ProcessEnv);
      expect.fail("expected loadConfig to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as Error).name).toBe("ConfigError");
    }
  });
});

describe("loadConfig — provider configuration (AUTH_OAUTH_ENABLED=true)", () => {
  /**
   * With the feature flag on, at least one provider must be fully
   * configured. "Fully" = both client ID AND secret. Half-configured
   * providers are rejected at boot so they can't silently produce 500s
   * at first user attempt.
   */
  const baseEnabledEnv = {
    AUTH_OAUTH_ENABLED: "true",
    COMPUTE_OAUTH_BRIDGE_SIGNING_KEY: VALID_KEY,
  };

  it("enabled + zero providers configured → ConfigError", () => {
    expect(() => loadConfig(baseEnabledEnv as unknown as NodeJS.ProcessEnv)).toThrow(
      /no provider is configured/,
    );
  });

  it("enabled + Google id set but secret missing → ConfigError (half-configured)", () => {
    expect(() =>
      loadConfig({
        ...baseEnabledEnv,
        GOOGLE_OAUTH_CLIENT_ID: "id-only",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Google OAuth is half-configured/);
  });

  it("enabled + Google secret set but id missing → ConfigError (half-configured)", () => {
    expect(() =>
      loadConfig({
        ...baseEnabledEnv,
        GOOGLE_OAUTH_CLIENT_SECRET: "secret-only",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Google OAuth is half-configured/);
  });

  it("enabled + GitHub half-configured → ConfigError", () => {
    expect(() =>
      loadConfig({
        ...baseEnabledEnv,
        GITHUB_OAUTH_CLIENT_ID: "Iv1.halfconfigured",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/GitHub OAuth is half-configured/);
  });

  it("enabled + Google fully configured + GitHub blank is fine (single provider)", () => {
    const cfg = loadConfig({
      ...baseEnabledEnv,
      ...GOOGLE_PROVIDER_ENV,
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.googleOauthClientId).toBe(GOOGLE_PROVIDER_ENV.GOOGLE_OAUTH_CLIENT_ID);
    expect(cfg.githubOauthClientId).toBe("");
  });

  it("disabled + all provider vars blank is fine (dev-mode default)", () => {
    const cfg = loadConfig({} as NodeJS.ProcessEnv);
    expect(cfg.authOauthEnabled).toBe(false);
    expect(cfg.googleOauthClientId).toBe("");
    expect(cfg.githubOauthClientId).toBe("");
  });
});

describe("loadConfig — PUBLIC_SITE_URL validation", () => {
  it("defaults to http://localhost:3000 when unset", () => {
    const cfg = loadConfig({} as NodeJS.ProcessEnv);
    expect(cfg.publicSiteUrl).toBe("http://localhost:3000");
  });

  it("accepts an https production URL with no path", () => {
    const cfg = loadConfig({
      PUBLIC_SITE_URL: "https://parametric-memory.dev",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.publicSiteUrl).toBe("https://parametric-memory.dev");
  });

  it("rejects a URL with a path component (redirect_uri base must be pure origin)", () => {
    expect(() =>
      loadConfig({
        PUBLIC_SITE_URL: "https://parametric-memory.dev/foo",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/no path component/);
  });

  it("rejects a malformed URL", () => {
    expect(() =>
      loadConfig({
        PUBLIC_SITE_URL: "not-a-url",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/not a valid URL/);
  });
});
