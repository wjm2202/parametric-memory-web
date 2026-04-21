/**
 * getEnabledOauthProviders — server-side helper that answers the
 * single question the login page asks at render time:
 *
 *   "Which OAuth provider buttons should I show this user?"
 *
 * Why a helper and not just reading the registry
 * ──────────────────────────────────────────────
 * `ProviderRegistry.get(id)` already returns `null` for unconfigured
 * providers, so in principle the login page could call `registry.get("google")`
 * and conditionally render. But the registry is lazy — first `get()`
 * instantiates the jose JWKS resolver / GitHub adapter, which means a
 * render-time call would kick off a network-cachable side effect on
 * every page load. Separating "is this provider usable?" (this module,
 * pure config check) from "give me the adapter" (registry, lazy +
 * cached) keeps the login page's render path free of adapter
 * construction.
 *
 * Feature flag is the hard gate
 * ─────────────────────────────
 * If `authOauthEnabled === false`, return `[]` regardless of what
 * credentials are configured. This mirrors the route handlers'
 * behaviour (flag off → every /api/auth/oauth/* returns 404) so we
 * never render a button that would 404 when clicked.
 *
 * Per-provider check is "both or neither"
 * ───────────────────────────────────────
 * `loadConfig()` already rejects half-configured providers at boot
 * (one id set but not the secret), so if we're running at all the
 * pairs are either fully set or fully empty. We still check both
 * fields here belt-and-braces — if a future config refactor ever
 * relaxes the boot guard, this function stays correct.
 *
 * Extending for future providers
 * ──────────────────────────────
 * Adding a third provider is one entry: widen `ProviderId` in
 * `types.ts`, add a case to the `PROVIDER_CONFIG_KEYS` table below,
 * and register the adapter in `registry.ts`. The login page picks
 * the new provider up automatically.
 */
import type { Config } from "@/config";
import type { ProviderId } from "./types";

/**
 * Map from ProviderId → the pair of Config keys that together mean
 * "this provider is configured in this environment". The table form
 * keeps the enable check declarative: one row per provider, no
 * branching logic to audit.
 *
 * Declaration order matters — it's the order the login page renders
 * buttons. Google first because it's the more common consumer SSO;
 * GitHub second because our developer audience reaches for it when
 * Google fails.
 */
const PROVIDER_CONFIG_KEYS: Array<{
  id: ProviderId;
  clientIdKey: keyof Config;
  clientSecretKey: keyof Config;
}> = [
  {
    id: "google",
    clientIdKey: "googleOauthClientId",
    clientSecretKey: "googleOauthClientSecret",
  },
  {
    id: "github",
    clientIdKey: "githubOauthClientId",
    clientSecretKey: "githubOauthClientSecret",
  },
];

/**
 * Return the list of provider ids whose buttons should be shown on
 * the login page for this environment, in render order.
 *
 * @param cfg  The validated app config. Callers should pass the
 *   module-level `config` export — tests pass synthetic configs.
 * @returns  Ordered `ProviderId[]`. Empty when the feature flag is
 *   off, or when no provider is fully configured.
 */
export function getEnabledOauthProviders(cfg: Config): ProviderId[] {
  if (!cfg.authOauthEnabled) return [];

  return PROVIDER_CONFIG_KEYS.filter(({ clientIdKey, clientSecretKey }) => {
    // Both values are typed as `string` in Config; the `as string`
    // cast is belt-and-braces against a future refactor that widens
    // the type. Empty string = unconfigured, matches the registry.
    const clientId = cfg[clientIdKey] as string;
    const clientSecret = cfg[clientSecretKey] as string;
    return clientId.length > 0 && clientSecret.length > 0;
  }).map((row) => row.id);
}
