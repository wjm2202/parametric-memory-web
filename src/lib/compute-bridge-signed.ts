/**
 * HMAC-signed client for compute's OAuth bridge routes (ADR-003, Phase 2).
 *
 * Why this file exists
 * ────────────────────
 * Three endpoints on compute — `/api/v1/auth/oauth/bridge/signin`,
 * `/bridge/link`, `/bridge/unlink` — persist identity changes. A leaked
 * user session alone must NOT be enough to hit them; the website and
 * compute share a signing key and every call carries an HMAC-SHA256
 * that proves "this request was issued by the website process, not by
 * a random attacker with a session cookie". See
 * `parametric-memory-compute/src/middleware/bridge-auth.ts` for the
 * verifying half.
 *
 * Wire format (must stay byte-identical to compute's verifier)
 * ────────────────────────────────────────────────────────────
 *
 *   Headers:
 *     Content-Type: application/json            (POST only)
 *     X-Compute-Bridge-Timestamp: <unix-seconds>
 *     X-Compute-Bridge-Nonce: <32 hex chars — 128 bits of randomness>
 *     X-Compute-Bridge-Signature: <hex HMAC-SHA256>
 *     Cookie: <optional — forwarded for link/unlink/identities>
 *
 *   Signed message (newline-separated):
 *     <timestamp>\n<METHOD>\n<fullUrlPath>\n<sha256HexOfBody>\n<nonce>
 *
 *   Where:
 *     timestamp       — same string as the header (unix seconds)
 *     METHOD          — uppercase verb (POST, GET, …)
 *     fullUrlPath     — the entire path from root (`/api/v1/auth/…`), no query
 *     sha256HexOfBody — `sha256(<raw bytes sent as body>).digest('hex')`;
 *                       empty body → hash of empty string
 *     nonce           — 32 lowercase hex chars, minted fresh per call via
 *                       `randomBytes(16)`. Compute tracks seen nonces in a
 *                       short TTL cache (= skew tolerance window) and rejects
 *                       replays with 401. See security test Block D + the
 *                       compute verifier for the enforcement half.
 *
 * Invariants this client enforces
 * ───────────────────────────────
 * 1. **Exact-byte body.** We JSON-stringify once, hash those bytes, and
 *    then hand the same string to `fetch`. `fetch` won't re-serialise
 *    a string body — so the bytes compute receives are the bytes we
 *    hashed. A mismatch here would manifest as every bridge call
 *    failing verification, so this is worth reading carefully if you
 *    ever refactor.
 * 2. **Empty-body hash still included.** Compute hashes `''` when the
 *    request has no body. We must too, or GET /identities-style calls
 *    would sign a different message than compute verifies.
 * 3. **Signing key never logged.** `console.error` paths below ALWAYS
 *    log `method`, `path`, and `status` — never the key, timestamp,
 *    or signature. Review this rule before adding new log lines.
 * 4. **Response is always JSON-parsed.** We mirror `compute-proxy.ts`'s
 *    discipline (M-0A 2026-04-09): nginx HTML error pages get coerced
 *    to a structured error, never forwarded as-is.
 *
 * What this client does NOT do
 * ────────────────────────────
 *   - It does NOT carry user-session authenticators on its own — the
 *     caller passes `sessionCookie` for routes that need one
 *     (`/bridge/link`, `/bridge/unlink`, `/identities`). `/bridge/signin`
 *     runs without a session (it PRECEDES session creation).
 *   - It does NOT retry on network failure. Bridge calls mutate
 *     identity state; a blind retry after a successful-but-slow call
 *     would write twice. The caller handles retries if they're safe.
 *   - It does NOT validate the inner JSON shape. The caller knows
 *     what it expects back and type-asserts — `BridgeResponse<T>` is
 *     just the envelope.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { config } from "@/config";

/**
 * Shape of every bridge response. Mirrors `compute-proxy.ts`'s
 * `ComputeProxyResult` in spirit (single envelope, parsed body,
 * upstream status) but trimmed for the bridge case where there is no
 * NextResponse wrapping and no rate-limit header forwarding.
 *
 * `status === 0` is a client-side-only sentinel meaning "never got a
 * response" (network error, aborted, etc.). Callers can treat >=400
 * and ===0 the same way for user-facing error surfaces.
 */
export interface BridgeResponse<T = unknown> {
  /** Truthy when upstream returned 2xx with a parseable JSON body. */
  ok: boolean;
  /** Upstream HTTP status, or 0 if the fetch itself failed. */
  status: number;
  /** Parsed JSON body, or null on error / non-JSON. */
  data: T | null;
  /**
   * Short error code suitable for logs. Populated when ok is false.
   * Common values: `"network_error"`, `"non_json_response"`,
   * `"unauthorized"`, `"conflict"`, `"server_error"`. Specific codes
   * echoed from upstream (`data.error`) take precedence.
   */
  error: string | null;
}

/**
 * One bridge call — enough knobs to describe any of the four routes.
 * Most bridge routes are POST; `/identities` is the only GET (and
 * bridge-auth doesn't even run on that route, but the client supports
 * unsigned calls too via a separate helper below).
 */
export interface BridgeRequestOptions {
  /** HTTP verb. Bridge routes: POST. Non-bridge /identities: GET. */
  method: "GET" | "POST";
  /**
   * Full URL path from the compute host root, INCLUDING `/api/v1/…`.
   * Must start with `/`. Must NOT include a query string — compute's
   * verifier strips any `?…` before hashing, and including one here
   * would produce a mismatch.
   */
  path: string;
  /**
   * JSON-serialisable body. `undefined` means "no body"; we still sign
   * the empty-string body hash per compute's expectation. Non-object
   * bodies (e.g. a bare string) are discouraged but supported —
   * compute's validators reject them, and the test suite pins the
   * behaviour.
   */
  body?: unknown;
  /**
   * Optional Cookie header value to forward to compute — needed for
   * routes that require a session (link, unlink, identities). The
   * caller is responsible for supplying the exact cookie string the
   * client received in the browser request (e.g. `mmpm_session=…`).
   */
  sessionCookie?: string;
}

/**
 * Dependencies — baseUrl, signing key, injectable clock, injectable
 * fetch. Separated so tests can build a fully-offline client with a
 * frozen clock and a stub fetch that captures the exact request.
 */
export interface BridgeClientDeps {
  /** e.g. `"http://localhost:3100"` or `"https://memory.kiwi"`. No trailing slash. */
  baseUrl: string;
  /** HMAC key. Must be ≥32 chars at runtime; we throw on call if empty. */
  signingKey: string;
  /** Injectable clock (ms since epoch). Defaults to `Date.now`. */
  now?: () => number;
  /** Injectable fetch. Defaults to the global. */
  fetchImpl?: typeof fetch;
}

/** The cached compute hash of the empty body — computed once, reused. */
const EMPTY_BODY_HASH = createHash("sha256").update("").digest("hex");

/**
 * Header names — string literals would be fine but this way a typo
 * surfaces at compile time. Match compute's expected casing exactly
 * (HTTP headers are case-insensitive but making the ritual match both
 * sides makes code review easier).
 */
const TIMESTAMP_HEADER = "X-Compute-Bridge-Timestamp";
const SIGNATURE_HEADER = "X-Compute-Bridge-Signature";
/**
 * Anti-replay nonce. 128 bits of randomness from `randomBytes(16)` → 32
 * lowercase hex chars. Compute caches each accepted nonce for the duration
 * of the skew window; a second bridge call that reuses any previously-seen
 * nonce is rejected 401. Without this header, a network MITM (or a replay
 * from logs) could re-submit a captured signed request while its timestamp
 * is still inside the skew window. Exporting the header name keeps the
 * security tests' mirror verifier in lockstep with production.
 */
const NONCE_HEADER = "X-Compute-Bridge-Nonce";

/**
 * Build a fresh bridge client. Typical production use is the
 * module-level `bridgeClient` singleton at the bottom of this file.
 * Tests build their own so they can inject `fetchImpl` + `now`.
 */
export function createBridgeClient(deps: BridgeClientDeps) {
  const { baseUrl, signingKey, now = Date.now, fetchImpl = fetch } = deps;

  return {
    /**
     * Send an HMAC-signed request to a compute bridge endpoint.
     *
     * Generics are fully inferred at the call site: the caller writes
     * `bridgeClient.call<SigninResult>({…})` and gets back
     * `BridgeResponse<SigninResult>` typed accordingly. The client
     * itself does no schema validation; that's the caller's job.
     */
    async call<T = unknown>(opts: BridgeRequestOptions): Promise<BridgeResponse<T>> {
      // ── Defensive: never sign with an empty key ─────────────────
      // config.ts already boot-fails if authOauthEnabled && key<32,
      // but a call here WITHOUT the feature flag (e.g. dev
      // experiments) would otherwise silently produce garbage
      // signatures. Throwing surfaces the problem loudly.
      if (signingKey.length === 0) {
        throw new Error(
          "bridgeClient.call: signingKey is empty. Set " +
            "COMPUTE_OAUTH_BRIDGE_SIGNING_KEY and AUTH_OAUTH_ENABLED=true.",
        );
      }

      // ── Serialise body once, hash those exact bytes ─────────────
      // Note: no body → empty string (NOT "null"). `JSON.stringify(undefined)`
      // returns undefined, which is a pitfall we explicitly avoid.
      const bodyString = opts.body === undefined ? "" : JSON.stringify(opts.body);
      const bodyHashHex =
        bodyString === "" ? EMPTY_BODY_HASH : createHash("sha256").update(bodyString).digest("hex");

      // ── Timestamp in unix seconds (matches compute's Number() parse) ─
      const timestamp = Math.floor(now() / 1000).toString();

      // ── Anti-replay nonce ───────────────────────────────────────
      // 16 random bytes → 32 lowercase hex chars = 128 bits of
      // entropy. At 10^6 bridge calls the collision probability is
      // ~3e-27, far below any realistic concern. The nonce joins the
      // signed message AND ships as its own header so compute can
      // fast-reject replayed requests BEFORE doing HMAC verification
      // (the replay cache lookup is O(1)). Without minting the nonce
      // here, a captured request could be replayed inside the 5-minute
      // skew window and re-run its identity mutation. See
      // `bridge-auth.ts` on the compute side.
      const nonce = randomBytes(16).toString("hex");

      // ── The exact message compute will reconstruct and verify ───
      const method = opts.method.toUpperCase();
      const message = `${timestamp}\n${method}\n${opts.path}\n${bodyHashHex}\n${nonce}`;

      // ── HMAC-SHA256, hex (matches compute's `Buffer.from(sig, 'hex')`) ─
      const signature = createHmac("sha256", signingKey).update(message).digest("hex");

      // ── Build request ───────────────────────────────────────────
      const url = `${baseUrl}${opts.path}`;
      const headers: Record<string, string> = {
        [TIMESTAMP_HEADER]: timestamp,
        [NONCE_HEADER]: nonce,
        [SIGNATURE_HEADER]: signature,
      };
      // Only attach Content-Type when there's a body — GET requests
      // with Content-Type confuse some middleboxes and are gratuitous.
      if (bodyString.length > 0) {
        headers["Content-Type"] = "application/json";
      }
      if (opts.sessionCookie) {
        headers["Cookie"] = opts.sessionCookie;
      }

      const init: RequestInit = {
        method,
        headers,
        // Bridge calls are never cached — every call reflects live
        // identity state. Same discipline as compute-proxy.ts.
        cache: "no-store",
      };
      // `body` must be omitted entirely for GET (fetch throws
      // otherwise), and we want the bytes to match bodyString exactly.
      if (method !== "GET" && bodyString.length > 0) {
        init.body = bodyString;
      }

      // ── Fetch ───────────────────────────────────────────────────
      let res: Response;
      try {
        res = await fetchImpl(url, init);
      } catch (err) {
        console.error(
          `[bridge-signed] ${method} ${opts.path} — network error:`,
          err instanceof Error ? err.message : err,
        );
        return {
          ok: false,
          status: 0,
          data: null,
          error: "network_error",
        };
      }

      // ── Parse body ──────────────────────────────────────────────
      // Mirror compute-proxy.ts: any non-JSON response becomes a
      // structured error rather than being forwarded.
      let raw: string;
      try {
        raw = await res.text();
      } catch {
        console.error(
          `[bridge-signed] ${method} ${opts.path} — unreadable body (status ${res.status})`,
        );
        return {
          ok: false,
          status: res.status,
          data: null,
          error: "unreadable_body",
        };
      }

      let parsed: unknown = null;
      if (raw.length > 0) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          console.error(
            `[bridge-signed] ${method} ${opts.path} — non-JSON response ` +
              `(status ${res.status}): ${raw.slice(0, 200)}`,
          );
          return {
            ok: false,
            status: res.status,
            data: null,
            error: "non_json_response",
          };
        }
      }

      const ok = res.ok && parsed !== null;
      // Prefer the server's own error code if it supplied one.
      const errorFromBody =
        parsed !== null &&
        typeof parsed === "object" &&
        "error" in (parsed as Record<string, unknown>) &&
        typeof (parsed as { error: unknown }).error === "string"
          ? (parsed as { error: string }).error
          : null;

      return {
        ok,
        status: res.status,
        data: parsed as T | null,
        error: ok ? null : (errorFromBody ?? (res.status >= 500 ? "server_error" : "client_error")),
      };
    },
  };
}

/**
 * Module-level singleton, configured from the validated website config.
 * Import from route handlers:
 *
 *   import { bridgeClient } from "@/lib/compute-bridge-signed";
 *   const r = await bridgeClient.call<SigninResult>({ method: "POST", … });
 *
 * Tests should NOT import this — they should `createBridgeClient(…)`
 * with stub fetch + fixed clock so cases are deterministic and
 * independent.
 */
export const bridgeClient = createBridgeClient({
  baseUrl: config.mmpmComputeUrl,
  signingKey: config.computeOauthBridgeSigningKey,
});
