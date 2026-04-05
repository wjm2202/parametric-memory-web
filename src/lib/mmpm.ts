/**
 * MMPM REST API client — server-side only.
 *
 * Holds the bearer token in-process (never sent to browser).
 * Used exclusively by /api/memory/* proxy routes.
 *
 * NOTE: We read MMPM_API_KEY from .env.local directly at startup
 * because Next.js won't override env vars already set in the shell
 * (even if empty). This avoids the need to `unset MMPM_API_KEY`
 * before running `npm run dev`.
 */

import { readFileSync } from "fs";
import { join } from "path";

const MMPM_URL = process.env.MMPM_API_URL ?? "https://mmpm.co.nz";

/**
 * REST API auth key — read-only viz key for the Substrate Viewer proxy.
 *
 * The MMPM server supports two scopes:
 *   - master  → full read/write (MMPM_API_KEY, used by server-side MCP)
 *   - read    → read-only, no side-effects (MMPM_VIZ_API_KEY, used here)
 *
 * The proxy only needs read access (atoms, access, search, tree-head, etc.)
 * so we use the read-only key. This ensures the public-facing website can
 * never mutate memory state even if the proxy is compromised.
 *
 * Falls back to MMPM_API_KEY if MMPM_VIZ_API_KEY is not set (backwards compat).
 */
function loadApiKey(): string {
  // Try process.env first (works in production / Docker)
  const vizKey = process.env.MMPM_VIZ_API_KEY;
  if (vizKey) return vizKey;

  // Fallback: read .env.local directly (handles shell override issue in dev)
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    const vizMatch = content.match(/^MMPM_VIZ_API_KEY=(.+)$/m);
    if (vizMatch?.[1]) return vizMatch[1].trim();
  } catch {
    // .env.local doesn't exist (e.g. production) — that's fine
  }

  // SECURITY: Do NOT fall back to MMPM_API_KEY (master).
  // If MMPM_VIZ_API_KEY is missing, the proxy runs without auth
  // and requests will be rejected by the MMPM server (401).
  // This is safer than silently using a master key.
  console.warn(
    "[mmpm] MMPM_VIZ_API_KEY is not set. " +
      "The proxy will not authenticate — MMPM requests will return 401. " +
      "Set MMPM_VIZ_API_KEY in .env.local or environment variables.",
  );
  return "";
}

const MMPM_KEY = loadApiKey();

/** Exposed for SSE passthrough route — server-side only. */
export function getMmpmSseUrl(): string {
  return `${MMPM_URL}/events`;
}
export function getMmpmAuthHeader(): string {
  return MMPM_KEY ? `Bearer ${MMPM_KEY}` : "";
}

/**
 * Allowed proxy paths → MMPM endpoint paths (whitelist).
 *
 * Key endpoints for the Substrate Viewer:
 *   GET  /tree-head   — public, no auth
 *   GET  /atoms       — list all atoms (needs auth)
 *   GET  /atoms/:name — single atom detail (needs auth)
 *   POST /access      — batch access multiple atoms (needs auth, body: { atoms: string[] })
 */
const ROUTE_MAP: Record<string, string> = {
  atoms: "/atoms",
  search: "/search",
  access: "/access",
  "batch-access": "/batch-access", // MCP memory_batch_access wraps POST /batch-access
  "tree-head": "/tree-head",
  verify: "/verify",
  "verify-consistency": "/verify-consistency",
  metrics: "/metrics",
  health: "/health",
  events: "/events", // S16-3: SSE real-time updates endpoint
  "events/clients": "/events/clients", // S16-5: SSE subscriber count
  // Knowledge Graph visualization layers
  edges: "/edges", // GET /edges — bulk structural KG edges (member_of, supersedes, etc.)
  poincare: "/poincare", // GET /poincare — Poincaré disk layout coordinates
};

/** Dynamic routes: /api/memory/atoms/<atom>, /api/memory/weights/<atom>, /api/memory/edges/<atom> */
const DYNAMIC_PREFIXES: Record<string, string> = {
  atoms: "/atoms",
  weights: "/weights",
  edges: "/edges", // GET /edges/:atom — per-atom structural edge expand
};

interface ProxyResult {
  status: number;
  body: string;
  contentType: string;
}

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (MMPM_KEY) {
    headers["Authorization"] = `Bearer ${MMPM_KEY}`;
  }
  return headers;
}

/**
 * Proxy a request to MMPM.
 * @param pathSegments  e.g. ["atoms"] or ["atoms", "v1.fact.xxx"]
 * @param method        "GET" or "POST"
 * @param body          JSON body for POST requests
 * @param queryString   Raw query string to forward (e.g. "?includeWeights=true&type=fact")
 */
export async function proxyToMmpm(
  pathSegments: string[],
  method: "GET" | "POST",
  body?: unknown,
  queryString?: string,
): Promise<ProxyResult> {
  if (pathSegments.length === 0) {
    return { status: 400, body: '{"error":"Empty path"}', contentType: "application/json" };
  }

  const first = pathSegments[0];

  // Build target URL
  let targetPath: string | null = null;

  if (pathSegments.length === 1) {
    // Static route: /api/memory/atoms → /atoms
    targetPath = ROUTE_MAP[first] ?? null;
  } else if (pathSegments.length === 2 && DYNAMIC_PREFIXES[first]) {
    // Dynamic route: /api/memory/atoms/v1.fact.xxx → /atoms/v1.fact.xxx
    targetPath = `${DYNAMIC_PREFIXES[first]}/${pathSegments[1]}`;
  }

  if (!targetPath) {
    return {
      status: 404,
      body: '{"error":"Endpoint not found"}',
      contentType: "application/json",
    };
  }

  // Append query string if present (e.g. ?includeWeights=true&type=fact)
  const qs = queryString && queryString !== "?" ? queryString : "";
  const url = `${MMPM_URL}${targetPath}${qs}`;
  const headers = buildHeaders();

  const fetchInit: RequestInit = {
    method,
    headers,
    // 10s timeout for MMPM requests
    signal: AbortSignal.timeout(10_000),
  };

  if (method === "POST" && body !== undefined) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
    fetchInit.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, fetchInit);
    const text = await res.text();
    return {
      status: res.status,
      body: text,
      contentType: res.headers.get("content-type") ?? "application/json",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "MMPM request failed";
    return {
      status: 502,
      body: JSON.stringify({ error: "Bad gateway", detail: message }),
      contentType: "application/json",
    };
  }
}
