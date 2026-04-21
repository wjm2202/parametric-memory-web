/**
 * Provider registry — maps `ProviderId` → configured `AuthProvider`.
 *
 * Why a registry
 * ──────────────
 * The `/start` and `/callback` routes both take `[provider]` as a URL
 * segment. Rather than each route branching on the string, they ask
 * the registry for the adapter and get `null` if it's unknown or
 * unconfigured. The registry is the one place that knows which
 * providers exist, reads config, and instantiates adapters lazily.
 *
 * Lazy construction
 * ─────────────────
 * Adapters are constructed on first lookup, cached, and reused. This
 * matters for Google because the jose `createRemoteJWKSet` resolver
 * caches keys on a TTL — recreating the provider on every request
 * would blow the cache.
 *
 * Unconfigured providers
 * ──────────────────────
 * If `config.googleOauthClientId === ""`, Google returns `null` even
 * when `AUTH_OAUTH_ENABLED=true` (you can run the feature with only
 * GitHub, or only Google). The route turns `null` into a 404 so
 * unknown or disabled providers are indistinguishable from the
 * outside.
 *
 * Testability
 * ───────────
 * The default registry reads from the module-level `config`. Tests
 * should build a fresh registry with `createRegistry(config, overrides)`
 * passing stub adapters or a custom config object. The module-level
 * `registry` export is frozen at import time — never import it from
 * tests.
 */
import { config as defaultConfig, type Config } from "@/config";
import { createGoogleProvider } from "./google";
import { createGitHubProvider } from "./github";
import { type AuthProvider, type ProviderId } from "./types";

/**
 * Registry interface. One method — `get(id)`. Separated from the
 * factory to keep the surface minimal: if we ever need `list()` for
 * the UI it can be added, but for now the UI's list of providers is
 * hard-coded in `LoginClient.tsx` (flag-gated). Keeping this small
 * makes stubbing in tests trivial.
 */
export interface ProviderRegistry {
  /**
   * Look up a provider by id. Returns the cached adapter instance on
   * repeat calls. Returns `null` if:
   *   - `id` is not a known provider, OR
   *   - the provider is known but its client_id/secret are empty
   *     (unconfigured in this environment)
   */
  get(id: string): AuthProvider | null;
}

/**
 * Optional test overrides — when a test needs to pin a specific
 * adapter (e.g. a fake with known claims) it can short-circuit the
 * real factory.
 */
export interface RegistryOverrides {
  google?: AuthProvider;
  github?: AuthProvider;
}

/**
 * Build a provider registry from a config + optional overrides.
 * Production code calls this once with the default config and exports
 * the result. Tests call it per-case with a stub config.
 */
export function createRegistry(cfg: Config, overrides: RegistryOverrides = {}): ProviderRegistry {
  // `null` explicitly means "this provider is unconfigured" — distinct
  // from `undefined` which would signal "never looked at it yet". We
  // cache both states to avoid repeated config reads.
  let googleCache: AuthProvider | null | undefined = undefined;
  let githubCache: AuthProvider | null | undefined = undefined;

  function resolveGoogle(): AuthProvider | null {
    if (googleCache !== undefined) return googleCache;
    if (overrides.google) {
      googleCache = overrides.google;
      return googleCache;
    }
    if (cfg.googleOauthClientId.length === 0 || cfg.googleOauthClientSecret.length === 0) {
      googleCache = null;
      return null;
    }
    googleCache = createGoogleProvider({
      clientId: cfg.googleOauthClientId,
      clientSecret: cfg.googleOauthClientSecret,
    });
    return googleCache;
  }

  function resolveGitHub(): AuthProvider | null {
    if (githubCache !== undefined) return githubCache;
    if (overrides.github) {
      githubCache = overrides.github;
      return githubCache;
    }
    if (cfg.githubOauthClientId.length === 0 || cfg.githubOauthClientSecret.length === 0) {
      githubCache = null;
      return null;
    }
    githubCache = createGitHubProvider({
      clientId: cfg.githubOauthClientId,
      clientSecret: cfg.githubOauthClientSecret,
    });
    return githubCache;
  }

  return {
    get(id) {
      switch (id as ProviderId | string) {
        case "google":
          return resolveGoogle();
        case "github":
          return resolveGitHub();
        default:
          // Unknown id — not a typo caught by the type system
          // because routes receive raw strings from URL segments.
          return null;
      }
    },
  };
}

/**
 * Module-level singleton. Import this from route handlers:
 *
 *   import { registry } from "@/lib/auth/providers/registry";
 *   const provider = registry.get(params.provider);
 *   if (!provider) return new Response("Not found", { status: 404 });
 *
 * Tests should call `createRegistry(stubConfig, {google: fakeProvider})`
 * rather than importing this.
 */
export const registry: ProviderRegistry = createRegistry(defaultConfig);

/**
 * The `redirect_uri` for a given provider, built from the configured
 * `publicSiteUrl`. Kept adjacent to the registry because it's the
 * other moving piece that `/start` and `/callback` need to agree on —
 * if the provider's configured redirect URL doesn't match this value
 * character-for-character, the token exchange fails with
 * `redirect_uri_mismatch`.
 */
export function redirectUriFor(providerId: ProviderId, cfg: Config = defaultConfig): string {
  // Strip any accidental trailing slash on publicSiteUrl — the config
  // validator already rejects paths, but normalise just in case.
  const base = cfg.publicSiteUrl.replace(/\/+$/, "");
  return `${base}/api/auth/oauth/${providerId}/callback`;
}
