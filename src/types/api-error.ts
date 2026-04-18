/**
 * Canonical error envelope returned by every compute API route and MCP tool response.
 *
 * Contract (2026-04-19 founder decision): every error must communicate to BOTH humans
 * (rendered directly in UI) AND AI clients (parsed and relayed into an LLM context
 * window). `human_message` and `ai_message` are BOTH mandatory — do not collapse them.
 *
 * `human_message` favours gentleness and context.
 * `ai_message`    favours action prescription and low token count.
 *
 * See silent-block-failure-modes-catalog.md (mmpm-website) for usage across failure sites.
 *
 * IMPORTANT: this file is duplicated in parametric-memory-compute/src/types/api-error.ts
 * and mmpm-website/src/types/api-error.ts. Keep them byte-identical. No monorepo yet.
 */
export interface ApiError {
  /** snake_case identifier — stable across versions, NEVER rename once shipped. */
  error_code: string;
  /** Plain English, safe to render directly in UI. */
  human_message: string;
  /** Short, action-prescriptive, low-token — for AI client context windows. */
  ai_message: string;
  /** Imperative sentence — what to do now. */
  next_action: string;
  /** Absolute or root-relative deep-link that fixes the problem. */
  remediation_url?: string;
  /** Internal context — OMIT in production for security-sensitive paths (auth, keys). */
  detail?: string;
}

/**
 * Identity helper — lets call sites write `apiError({ ... })` for inferred-literal
 * structural checking without importing the interface explicitly.
 */
export function apiError(e: ApiError): ApiError {
  return e;
}

/**
 * Runtime type guard — checks every required field is present and correctly typed.
 * Use on the client when parsing unknown JSON from proxy routes / fetch().
 */
export function isApiError(x: unknown): x is ApiError {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.error_code === "string" &&
    typeof e.human_message === "string" &&
    typeof e.ai_message === "string" &&
    typeof e.next_action === "string" &&
    (e.remediation_url === undefined || typeof e.remediation_url === "string") &&
    (e.detail === undefined || typeof e.detail === "string")
  );
}
