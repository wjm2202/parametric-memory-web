/**
 * PKCE + state + nonce generator and single-use flow store (ADR-003, Phase 2 OAuth).
 *
 * What this module does
 * ─────────────────────
 * An OAuth authorization-code flow with PKCE requires the client to
 * remember four secrets between the redirect to the provider and the
 * callback from the provider:
 *
 *   - `verifier` — a fresh PKCE secret. We send its SHA-256 hash
 *     (the `challenge`) in the redirect URL; the provider sends the
 *     `code` back; we send `code + verifier` to the token endpoint;
 *     the provider checks `SHA-256(verifier) === challenge`. If an
 *     attacker intercepts the `code`, they can't redeem it without the
 *     verifier, which never left our server.
 *   - `state` — a fresh random token we put in the redirect URL and
 *     expect to see echoed back by the provider. Binds the callback to
 *     the initiating browser (via the `mmpm_oauth_state` cookie). A
 *     callback with a `state` we didn't issue is a CSRF attempt and
 *     must 403.
 *   - `nonce` — OIDC only (Google). Put in the auth request, claimed
 *     inside the returned `id_token`. Prevents id-token replay.
 *     `null` for non-OIDC providers (GitHub).
 *   - `returnTo` — the validated post-login destination; stored
 *     alongside so the callback route can redirect the user to the
 *     right page after session mint. Already allow-list-filtered by
 *     the time it gets here — see ./return-to.ts.
 *
 * The `OauthFlowStore` keeps these under the `state` key for a short
 * TTL (5 min per ADR-003 §§ 2, 256). On callback we `consume(state)`
 * which returns the flow and simultaneously deletes it — **single use**,
 * so a leaked callback URL can't be replayed.
 *
 * Why in-memory
 * ─────────────
 * The website runs as a single Docker container on its own droplet.
 * Single Node process → in-memory Map is correct and fast. A container
 * restart loses any in-flight flows, but the worst case is "users who
 * were mid-OAuth when we redeployed get an error page and retry" —
 * acceptable for a ≤5-min pending window.
 *
 * If we later scale the website to multiple containers, the right move
 * is to swap the backing store for Redis (same interface, small diff),
 * NOT to pretend it works with sticky sessions.
 *
 * Why split crypto from storage
 * ─────────────────────────────
 * `generateFlowCredentials()` is pure — it returns fresh random bytes
 * and a hash — and can be unit-tested for entropy / format / challenge
 * round-trip with zero setup. The store is stateful and needs an
 * injectable clock for deterministic TTL tests. Keeping them separate
 * means each concern can grow / break / be replaced without dragging
 * the other along.
 *
 * What this module does NOT do
 * ────────────────────────────
 *   - It does NOT set or read cookies. The caller (route handler)
 *     owns the `mmpm_oauth_state` cookie — we only issue the value
 *     that goes into it.
 *   - It does NOT talk to any OAuth provider. That's the adapter
 *     layer (`src/lib/auth/providers/*`, Session 2).
 *   - It does NOT validate `returnTo`. That's `./return-to.ts` and
 *     must run BEFORE creating a flow.
 */
import { createHash, randomBytes } from "node:crypto";

import type { OauthIntent } from "./providers/types";

/**
 * Default TTL for pending OAuth flows. Five minutes matches ADR-003
 * and RFC 6819 guidance for authorization-request lifetime — long
 * enough for a slow user, short enough that a leaked state+cookie
 * pair can't be replayed hours later.
 */
export const OAUTH_FLOW_TTL_MS = 5 * 60 * 1000;

/**
 * Minimum byte counts. Callers should not need these directly — they
 * exist so the crypto tests can assert we're not quietly weakening the
 * parameters without a test change.
 */
export const PKCE_VERIFIER_BYTES = 64;
export const STATE_BYTES = 32;
export const NONCE_BYTES = 32;

/**
 * One pending OAuth flow — everything the callback route needs to
 * complete it.
 *
 * `state` is NOT a field here because it's the store key. `challenge`
 * is NOT stored because it's used once (in the redirect URL) and never
 * read again — persisting it would just be dead weight plus one more
 * thing to accidentally log.
 */
export interface OauthFlow {
  /** PKCE verifier. base64url string, 64 random bytes. Secret. */
  verifier: string;
  /** OIDC nonce for providers that issue an `id_token`. `null` otherwise. */
  nonce: string | null;
  /** Provider slug — `"google"`, `"github"`, etc. Matches the `AuthProvider.slug`. */
  provider: string;
  /**
   * Why this OAuth dance is happening — chosen at `/start` when the user
   * clicks a button, carried here through the 5-min pending window, and
   * read by `/callback` to decide which compute bridge endpoint to hit
   * (`/bridge/signin` vs `/bridge/link`). Storing it on the flow keeps
   * intent bound to the single-use state token — no second cookie with
   * duplicated TTL / consume semantics to keep in lockstep.
   */
  intent: OauthIntent;
  /** Already-validated return-to path. Assumed safe — DO NOT re-validate here. */
  returnTo: string;
  /** Epoch ms when the flow was stored. TTL checks use `now() - createdAt`. */
  createdAt: number;
}

/**
 * Freshly-generated credentials for a new OAuth flow. The caller will
 * typically:
 *
 *   1. Validate `returnTo` (./return-to.ts).
 *   2. Call `generateFlowCredentials(provider)`.
 *   3. `store.put(state, {verifier, nonce, provider, returnTo, createdAt: Date.now()})`.
 *   4. Set `mmpm_oauth_state=state` cookie (HttpOnly, Secure, SameSite=Lax, Max-Age=300).
 *   5. 302 to the provider's authorize endpoint with `?state=…&code_challenge=…&nonce=…`.
 */
export interface FlowCredentials {
  /** 64 random bytes, base64url-encoded. Secret. Send ONLY to the token endpoint. */
  verifier: string;
  /** `SHA-256(verifier)`, base64url-encoded. Safe to put in the public redirect URL. */
  challenge: string;
  /** 32 random bytes, base64url-encoded. Goes in both the URL and the `mmpm_oauth_state` cookie. */
  state: string;
  /** 32 random bytes, base64url-encoded. `null` for providers without OIDC. */
  nonce: string | null;
}

/**
 * Contract for a pending-flow store. In prod we use the in-memory
 * implementation below; tests mock via the `now` clock rather than
 * swapping the whole store. An alternative backing store (Redis,
 * Postgres) would implement the same three methods.
 */
export interface OauthFlowStore {
  /**
   * Persist a flow under `state`. Overwrites any existing entry with
   * the same key — in practice this never happens (state is 256 bits
   * of entropy, collisions are astronomically unlikely), but we
   * document the behaviour anyway so the tests can pin it down.
   */
  put(state: string, flow: OauthFlow): void;

  /**
   * Look up, return, and DELETE the entry for `state`. Returns `null`
   * if no entry, or if the entry has expired. Single-use — a second
   * `consume` call with the same state always returns `null`.
   */
  consume(state: string): OauthFlow | null;

  /** Count of live (non-expired) entries. Exposed for tests / metrics. */
  size(): number;
}

/**
 * Generate fresh PKCE + state + nonce credentials. Pure function — no
 * side effects, no storage. Safe to call in any server-side context.
 *
 * The nonce is only meaningful for OIDC providers (Google's
 * `id_token`). Non-OIDC providers (GitHub) receive `null` so the
 * caller can't accidentally send a nonce in a URL that wouldn't check
 * it — silent noise that would pass tests and hide a real bug.
 *
 * Accepting a string `provider` rather than a union is deliberate:
 * when we add a third provider the registry key changes, not this
 * function. See `src/lib/auth/providers/types.ts` (Session 2) for the
 * list of OIDC providers.
 */
export function generateFlowCredentials(provider: string): FlowCredentials {
  const verifierBytes = randomBytes(PKCE_VERIFIER_BYTES);
  const verifier = base64url(verifierBytes);

  // S256 challenge = base64url(sha256(verifier-ASCII)). Note: we hash
  // the verifier STRING, not the raw bytes — per RFC 7636 §4.2 the
  // verifier is an ASCII string for the purposes of the hash.
  const challenge = base64url(createHash("sha256").update(verifier).digest());

  const state = base64url(randomBytes(STATE_BYTES));

  const nonce = isOidcProvider(provider) ? base64url(randomBytes(NONCE_BYTES)) : null;

  return { verifier, challenge, state, nonce };
}

/**
 * Which providers issue an OIDC `id_token` and therefore need a
 * nonce. Not exported — callers shouldn't branch on this themselves,
 * they should call `generateFlowCredentials(provider)` and get `null`
 * for non-OIDC.
 *
 * When a new provider is added:
 *   - OIDC (Azure AD, Okta, Apple):  add to this set.
 *   - OAuth 2.0 only (Discord, Reddit): do NOT add.
 * A missing entry here means the provider adapter must not rely on
 * receiving a nonce back — enforced by the type `nonce: string | null`.
 */
const OIDC_PROVIDERS = new Set(["google"]);
function isOidcProvider(slug: string): boolean {
  return OIDC_PROVIDERS.has(slug);
}

/**
 * Encode a Buffer as base64url without padding. RFC 4648 §5.
 * Node 16+ supports `.toString("base64url")` natively. The output is
 * the charset `[A-Z a-z 0-9 - _]`, safe to drop into URLs and cookies
 * without further escaping.
 */
function base64url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

/**
 * Options for the in-memory store factory. Split out so tests can
 * inject a frozen clock and a tight TTL without spooky action at a
 * distance.
 */
export interface InMemoryStoreOptions {
  /** Override the default TTL (5 min). Tests use tiny TTLs for speed. */
  ttlMs?: number;
  /**
   * Clock source. Defaults to `Date.now`. Tests pass a mutable
   * counter closure so they can advance time without touching real
   * timers.
   */
  now?: () => number;
  /**
   * Max live entries before `put` opportunistically sweeps expired
   * ones. Default 10_000 — high enough that it never fires in normal
   * operation, low enough that a runaway-create loop can't OOM before
   * something cleans up.
   */
  sweepThreshold?: number;
}

/**
 * Build a fresh in-memory OAuth flow store. One per server process.
 * Module-level singleton is created at the bottom of this file so
 * route handlers can just import it; tests build their own.
 */
export function createInMemoryOauthFlowStore(opts: InMemoryStoreOptions = {}): OauthFlowStore {
  const ttlMs = opts.ttlMs ?? OAUTH_FLOW_TTL_MS;
  const now = opts.now ?? Date.now;
  const sweepThreshold = opts.sweepThreshold ?? 10_000;
  const entries = new Map<string, OauthFlow>();

  /**
   * Drop any entries older than `ttlMs`. O(n) — only called
   * opportunistically on `put` when the map gets large, or on-demand
   * from the `consume` path for a specific key.
   */
  function sweepExpired(): void {
    const cutoff = now() - ttlMs;
    for (const [key, flow] of entries) {
      if (flow.createdAt < cutoff) entries.delete(key);
    }
  }

  return {
    put(state, flow) {
      if (entries.size >= sweepThreshold) sweepExpired();
      entries.set(state, flow);
    },

    consume(state) {
      const flow = entries.get(state);
      if (!flow) return null;
      entries.delete(state); // single-use, even if we're about to return null below
      if (flow.createdAt < now() - ttlMs) return null;
      return flow;
    },

    size() {
      sweepExpired();
      return entries.size;
    },
  };
}

/**
 * Resolve (or lazily create) the process-wide OAuth flow store,
 * stashing the instance on `globalRef` so it survives Next.js dev-mode
 * route re-compilation.
 *
 * Why this exists
 * ───────────────
 * In production the website runs one bundled Node process per
 * container, so a plain module-level `createInMemoryOauthFlowStore()`
 * export is a true singleton and this helper is a no-op.
 *
 * In Next.js dev mode (App Router + Turbopack), each API route is
 * compiled lazily on first request. The `/start` route compiles, runs,
 * stores a flow in Map-instance-A. Moments later the callback URL is
 * hit for the first time, Next compiles `/callback` fresh, and the
 * fresh module tree creates Map-instance-B. The callback's `consume`
 * call looks in B, finds nothing, and emits `oauth_expired`. Stashing
 * the Map on `globalThis` (which survives both HMR reloads and route
 * re-compilation) fixes this in dev without changing prod behaviour.
 *
 * Kept as an exported pure function so tests can inject a fake global
 * object and drive the stash-or-reuse logic deterministically — no
 * mucking with the real `globalThis`, no cross-test leakage.
 */
export function getOrCreateOauthFlowStore(globalRef: Record<string, unknown>): OauthFlowStore {
  const key = "__mmpm_oauth_flow_store";
  const existing = globalRef[key];
  if (existing !== undefined) {
    return existing as OauthFlowStore;
  }
  const store = createInMemoryOauthFlowStore();
  globalRef[key] = store;
  return store;
}

/**
 * The process-wide OAuth flow store used by route handlers. In prod
 * this is a plain singleton; in Next.js dev mode it's cached on
 * `globalThis` so it survives route re-compilation (see
 * `getOrCreateOauthFlowStore` for the rationale).
 *
 * Tests should NOT import this — build their own stores via
 * `createInMemoryOauthFlowStore(opts)` to avoid cross-test leakage
 * through the shared global.
 */
export const oauthFlowStore: OauthFlowStore = getOrCreateOauthFlowStore(
  globalThis as unknown as Record<string, unknown>,
);
