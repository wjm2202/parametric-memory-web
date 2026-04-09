/**
 * Shared compute proxy utility.
 *
 * Every API route that proxies to mmpm-compute MUST use this utility instead of
 * raw `fetch` + `res.text()` passthrough. It enforces three invariants:
 *
 *   1. Response is ALWAYS valid JSON (Content-Type: application/json).
 *   2. Non-JSON upstream responses (nginx HTML error pages, empty bodies) are
 *      caught and replaced with a structured JSON error.
 *   3. Upstream status codes are preserved for semantic errors (4xx) but
 *      non-2xx/4xx responses become 502 with a JSON body.
 *
 * BUG CONTEXT (M-0A, 2026-04-09):
 * In production, compute is behind nginx at https://memory.kiwi. When the
 * Express process is unhealthy (PM2 restart, DB timeout), nginx returns an
 * HTML 502/504 page. The old pattern — `res.text()` → `new NextResponse(data)`
 * — forwarded that HTML to the client, breaking every JSON consumer. This
 * utility exists to make that class of bug structurally impossible.
 */

import { NextResponse } from "next/server";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ComputeProxyOptions {
  /** HTTP method. Default: "GET". */
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

  /** Headers to send to compute (Authorization, Content-Type, etc.). */
  headers?: Record<string, string>;

  /** JSON-serialisable request body. Ignored for GET/DELETE. */
  body?: unknown;

  /**
   * Route label for error logs (e.g. "billing/status", "my-substrate/rotate-key").
   * Used in console.error messages to identify which proxy failed.
   */
  label?: string;

  /**
   * Extra headers to forward from the upstream response to the client.
   * Useful for rate-limit headers (X-RateLimit-*). The header values are
   * copied from the upstream response if present.
   */
  forwardHeaders?: string[];
}

export interface ComputeProxyResult {
  /** The NextResponse ready to return from a route handler. */
  response: NextResponse;

  /** The parsed JSON body (if upstream returned valid JSON), or null. */
  data: unknown;

  /** The upstream HTTP status code, or null if fetch failed entirely. */
  upstreamStatus: number | null;

  /** True if the upstream response was valid JSON and status was 2xx. */
  ok: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core proxy function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Proxy a request to compute and return a guaranteed-JSON NextResponse.
 *
 * @param path — Compute path WITHOUT leading slash. Example: "api/v1/billing/status"
 * @param opts — Request options.
 * @returns ComputeProxyResult with the response, parsed data, and status.
 *
 * @example
 * ```ts
 * const { response } = await computeProxy("api/v1/billing/status", {
 *   headers: { Authorization: `Bearer ${token}` },
 *   label: "billing/status",
 * });
 * return response;
 * ```
 */
export async function computeProxy(
  path: string,
  opts: ComputeProxyOptions = {},
): Promise<ComputeProxyResult> {
  const {
    method = "GET",
    headers = {},
    body,
    label = path,
    forwardHeaders = [],
  } = opts;

  const url = `${COMPUTE_URL}/${path}`;

  // ── Fetch ────────────────────────────────────────────────────────────────
  let res: Response;
  try {
    const init: RequestInit = {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      cache: "no-store",
    };
    if (body !== undefined && method !== "GET") {
      init.body = JSON.stringify(body);
    }
    res = await fetch(url, init);
  } catch (err) {
    // Network error — compute unreachable, DNS failure, timeout, etc.
    console.error(`[compute-proxy] ${method} ${label} — network error:`, err);
    return {
      response: NextResponse.json(
        { error: "upstream_error", message: "Failed to reach compute service" },
        { status: 502 },
      ),
      data: null,
      upstreamStatus: null,
      ok: false,
    };
  }

  // ── Read and validate body ───────────────────────────────────────────────
  let raw: string;
  try {
    raw = await res.text();
  } catch {
    console.error(
      `[compute-proxy] ${method} ${label} — failed to read response body (status ${res.status})`,
    );
    return {
      response: NextResponse.json(
        { error: "upstream_error", message: "Unreadable response from compute service" },
        { status: 502 },
      ),
      data: null,
      upstreamStatus: res.status,
      ok: false,
    };
  }

  // Parse as JSON — if it's not JSON, we do NOT forward it.
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    // This is the exact M-0A bug: nginx HTML error page forwarded as JSON.
    console.error(
      `[compute-proxy] ${method} ${label} — non-JSON response (status ${res.status}): ${raw.slice(0, 500)}`,
    );
    return {
      response: NextResponse.json(
        { error: "upstream_error", message: "Invalid response from compute service" },
        { status: 502 },
      ),
      data: null,
      upstreamStatus: res.status,
      ok: false,
    };
  }

  // ── Build response headers ───────────────────────────────────────────────
  const responseHeaders: Record<string, string> = {};
  for (const h of forwardHeaders) {
    const v = res.headers.get(h);
    if (v) responseHeaders[h] = v;
  }

  // ── Return validated JSON ────────────────────────────────────────────────
  // Preserve upstream status for semantic errors (4xx) and success (2xx).
  // Server errors (5xx) are remapped to 502 since the upstream already failed.
  const status = res.status >= 500 ? 502 : res.status;

  return {
    response: NextResponse.json(data, { status, headers: responseHeaders }),
    data,
    upstreamStatus: res.status,
    ok: res.ok,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: session-authenticated proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build Authorization header from a session token.
 * Returns an empty object if token is undefined (unauthenticated routes).
 */
export function authHeaders(sessionToken?: string): Record<string, string> {
  return sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
}
