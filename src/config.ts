/**
 * Website runtime config.
 *
 * Centralises env var reads + boot-time validation for the Next.js server
 * process. Every server-side module that depends on an env var should import
 * `config` from here rather than reading `process.env.FOO` directly — this
 * file is the one place where:
 *
 *   1. Types are narrowed (booleans are actual booleans, not `"true"` strings)
 *   2. Defaults are applied
 *   3. Combinations that don't make sense fail fast at boot
 *
 * Phase 2 OAuth (ADR-003)
 * ───────────────────────
 * The website runs the user-facing OAuth dance (PKCE, state, nonce, provider
 * token exchange) and then calls compute's `/api/v1/auth/oauth/bridge/*`
 * endpoints to persist outcomes. Those bridge calls are HMAC-signed — the
 * key is a shared secret with compute. See `parametric-memory-compute/src/
 * middleware/bridge-auth.ts` for the exact signature format (message =
 * `${timestamp}\n${METHOD}\n${fullUrlPath}\n${sha256Hex(rawBody)}`).
 *
 * The compute server's `src/config.ts:132` enforces the same ≥32-char length
 * rule at its own boot — the two halves of the shared secret are checked
 * symmetrically. If this file passes and compute fails (or vice versa) the
 * two environments are misaligned, which is exactly the class of bug a boot-
 * time assertion is meant to turn into a startup failure rather than a
 * runtime 500.
 *
 * Why a factory
 * ─────────────
 * `loadConfig(env)` takes the env object as input so tests can exercise
 * every validation branch without having to stub `process.env` globally.
 * The cached `config` export calls `loadConfig(process.env)` once at module
 * load — mirrors compute's pattern.
 *
 * Where to import
 * ───────────────
 * Server-side ONLY. Next.js API routes, server components, middleware.
 * Never import this from a Client Component — the bundler would ship the
 * validation code (and more importantly, attempt to validate env vars that
 * don't exist at build time for client bundles).
 *
 * We do NOT add `import 'server-only'` here because the package isn't a
 * direct dependency in this repo and adding it silently changes the Next
 * build graph. The JSDoc header above plus the .server.ts convention is
 * the current codebase style — see src/lib/compute-proxy.ts for the same
 * pattern. Revisit if server-only is installed project-wide.
 */

/**
 * Shape of the validated config. Consumers should prefer this type over
 * poking directly at `process.env`.
 */
export interface Config {
  /**
   * ADR-003 Phase 2 feature flag. When false, every OAuth-related code path
   * on the website is a no-op:
   *   - /api/auth/oauth/[provider]/start  — 404
   *   - /api/auth/oauth/[provider]/callback — 404
   *   - /api/auth/oauth/link / /unlink / /identities — 404
   *   - LoginClient.tsx hides the provider buttons
   *
   * Staging rolls true first, production follows once the Security Go/No-Go
   * checklist in ADR-003 is green.
   */
  authOauthEnabled: boolean;

  /**
   * HMAC-SHA256 shared secret for signing bridge calls to compute. Must be
   * identical to `COMPUTE_OAUTH_BRIDGE_SIGNING_KEY` on the compute host.
   * Rotating this key requires deploying the new value to both sides in the
   * same window — a mismatch causes every bridge call to 401.
   *
   * Raw string form (not hex, not base64) — the HMAC library takes bytes,
   * and using the raw UTF-8 bytes of a ≥32-char key avoids ambiguity about
   * "does the key mean 32 bytes or 32 hex chars?". 32 ASCII chars = 256 bits
   * of material even in the worst case.
   *
   * Empty string is the safe default when the feature is disabled — in that
   * mode the key is never read, so leaving it unset lets dev environments
   * run without the ceremony of generating a placeholder secret.
   */
  computeOauthBridgeSigningKey: string;

  /**
   * Base URL of the mmpm-compute HTTP API. The bridge client will POST to
   * `${mmpmComputeUrl}/api/v1/auth/oauth/bridge/signin` (etc.). This value
   * is the single source of truth — `src/lib/compute-proxy.ts` will be
   * migrated to read it from here in a later sprint, but for now it reads
   * `process.env.MMPM_COMPUTE_URL` directly (same env var, same default).
   *
   * Default matches compute's default listening port (3100). Override for
   * staging (`https://api.staging.parametric-memory.dev`) and production
   * (`https://memory.kiwi`) via env.
   */
  mmpmComputeUrl: string;

  /**
   * Google OAuth 2.0 Client ID. Issued by Google Cloud Console under the
   * `mmpm-website` project. One client per environment — the dev client's
   * redirect URI is `http://localhost:3000/api/auth/oauth/google/callback`,
   * prod's is `https://parametric-memory.dev/api/auth/oauth/google/callback`.
   *
   * Empty string is the safe default when the feature is disabled — the
   * registry won't construct a Google adapter unless this is non-empty.
   */
  googleOauthClientId: string;
  /** Google OAuth 2.0 Client Secret. Pair with `googleOauthClientId`. */
  googleOauthClientSecret: string;

  /**
   * GitHub OAuth App Client ID. Issued by GitHub Settings → Developer
   * settings → OAuth Apps. One app per environment — GitHub allows only
   * one callback URL per app, so dev and prod are separate apps with
   * separate IDs/secrets.
   */
  githubOauthClientId: string;
  /** GitHub OAuth App Client Secret. Pair with `githubOauthClientId`. */
  githubOauthClientSecret: string;

  /**
   * Absolute base URL the website serves from — used to build the
   * `redirect_uri` handed to providers. Must match what's registered
   * with Google / GitHub exactly. `http://localhost:3000` for dev,
   * `https://parametric-memory.dev` for prod. No trailing slash.
   *
   * This could be derived from the incoming request host at runtime,
   * but binding it to an env var has two upsides: we catch misconfig
   * at boot (not at first OAuth attempt), and a proxy that rewrites
   * `Host` can't trick us into handing a different redirect_uri to
   * the provider.
   */
  publicSiteUrl: string;
}

/**
 * Minimum length of the OAuth bridge signing key. Matches compute's
 * assertion at `parametric-memory-compute/src/config.ts:132`. If you change
 * this, change both sides — and then plan a key rotation, because anyone
 * running a shorter key will fail boot on the next deploy.
 */
export const MIN_BRIDGE_SIGNING_KEY_LENGTH = 32;

/**
 * Thrown when env vars are present but internally inconsistent (e.g.
 * feature flag on, signing key missing). Separate from "env var not set at
 * all" — a genuine misconfiguration that should crash the process so ops
 * sees it in PM2 logs instead of a silent 500 on first request.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Parse + validate a NodeJS env object into a Config. Does NOT read from
 * `process.env` directly — inject the env object for testability. If
 * validation fails, throws `ConfigError` with a description of what the
 * operator needs to fix.
 *
 * ## Validation rules
 *
 * 1. `AUTH_OAUTH_ENABLED` is parsed as "true" | "false" | unset → boolean.
 *    Anything else (e.g. `yes`, `1`, `on`) is a typo and we reject — better
 *    to fail boot than silently treat an unexpected value as falsy.
 * 2. When the feature is enabled, `COMPUTE_OAUTH_BRIDGE_SIGNING_KEY` must
 *    be at least `MIN_BRIDGE_SIGNING_KEY_LENGTH` characters. Compute applies
 *    the same rule at its boot; keeping the two in lockstep turns a key
 *    mismatch into a startup failure on whichever side boots second rather
 *    than a runtime 401 storm.
 * 3. `MMPM_COMPUTE_URL` if set must parse as a URL — we don't try to ping
 *    it (boot must stay offline-safe), but an obviously malformed value
 *    (missing scheme, etc.) fails fast.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const authOauthEnabled = parseBool(env.AUTH_OAUTH_ENABLED, "AUTH_OAUTH_ENABLED", false);

  const computeOauthBridgeSigningKey = env.COMPUTE_OAUTH_BRIDGE_SIGNING_KEY ?? "";

  if (authOauthEnabled && computeOauthBridgeSigningKey.length < MIN_BRIDGE_SIGNING_KEY_LENGTH) {
    throw new ConfigError(
      `AUTH_OAUTH_ENABLED=true requires COMPUTE_OAUTH_BRIDGE_SIGNING_KEY ` +
        `to be at least ${MIN_BRIDGE_SIGNING_KEY_LENGTH} characters ` +
        `(got ${computeOauthBridgeSigningKey.length}). Generate with: ` +
        `openssl rand -hex 32`,
    );
  }

  const mmpmComputeUrl = env.MMPM_COMPUTE_URL ?? "http://localhost:3100";
  try {
    // Runtime sanity — throws on malformed URL. We don't keep the result;
    // the config consumer will `new URL(...)` as needed.
    new URL(mmpmComputeUrl);
  } catch {
    throw new ConfigError(`MMPM_COMPUTE_URL is not a valid URL: ${JSON.stringify(mmpmComputeUrl)}`);
  }

  const googleOauthClientId = env.GOOGLE_OAUTH_CLIENT_ID ?? "";
  const googleOauthClientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET ?? "";
  const githubOauthClientId = env.GITHUB_OAUTH_CLIENT_ID ?? "";
  const githubOauthClientSecret = env.GITHUB_OAUTH_CLIENT_SECRET ?? "";
  const publicSiteUrl = env.PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Validate publicSiteUrl is a well-formed URL. Must be set even when
  // the feature flag is off, so the parseable check runs unconditionally
  // — the feature-flag block below only checks per-provider pairs.
  try {
    const u = new URL(publicSiteUrl);
    if (u.pathname !== "/" && u.pathname !== "") {
      throw new ConfigError(
        `PUBLIC_SITE_URL must have no path component (got ${JSON.stringify(publicSiteUrl)})`,
      );
    }
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    throw new ConfigError(`PUBLIC_SITE_URL is not a valid URL: ${JSON.stringify(publicSiteUrl)}`);
  }

  // When the feature flag is on, at least one provider must be fully
  // configured. We enforce a per-provider "both or neither" rule so a
  // half-configured provider can't silently land in the registry and
  // produce 500s at first use.
  if (authOauthEnabled) {
    const googleHalfConfigured =
      (googleOauthClientId.length === 0) !== (googleOauthClientSecret.length === 0);
    if (googleHalfConfigured) {
      throw new ConfigError(
        "Google OAuth is half-configured: set BOTH GOOGLE_OAUTH_CLIENT_ID and " +
          "GOOGLE_OAUTH_CLIENT_SECRET, or neither.",
      );
    }
    const githubHalfConfigured =
      (githubOauthClientId.length === 0) !== (githubOauthClientSecret.length === 0);
    if (githubHalfConfigured) {
      throw new ConfigError(
        "GitHub OAuth is half-configured: set BOTH GITHUB_OAUTH_CLIENT_ID and " +
          "GITHUB_OAUTH_CLIENT_SECRET, or neither.",
      );
    }
    const noProviderConfigured =
      googleOauthClientId.length === 0 && githubOauthClientId.length === 0;
    if (noProviderConfigured) {
      throw new ConfigError(
        "AUTH_OAUTH_ENABLED=true but no provider is configured. Set at least one " +
          "of {GOOGLE_OAUTH_CLIENT_ID,GOOGLE_OAUTH_CLIENT_SECRET} or " +
          "{GITHUB_OAUTH_CLIENT_ID,GITHUB_OAUTH_CLIENT_SECRET}.",
      );
    }
  }

  return {
    authOauthEnabled,
    computeOauthBridgeSigningKey,
    mmpmComputeUrl,
    googleOauthClientId,
    googleOauthClientSecret,
    githubOauthClientId,
    githubOauthClientSecret,
    publicSiteUrl,
  };
}

/**
 * Parse a string env var as a strict "true"/"false" boolean. Any other
 * non-empty value is rejected as a likely typo. Empty/undefined falls back
 * to `fallback`.
 */
function parseBool(raw: string | undefined, name: string, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ConfigError(`${name} must be "true" or "false" (got ${JSON.stringify(raw)})`);
}

/**
 * Cached, validated config for the running server process. Import this
 * from API routes and server components. For unit tests that need to
 * exercise different env combinations, call `loadConfig(customEnv)`
 * directly instead — this cached instance is frozen once at module load.
 */
export const config: Config = loadConfig(process.env);
