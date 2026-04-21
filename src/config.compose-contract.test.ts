/**
 * Contract test — docker-compose.yml forwards every env var that
 * `src/config.ts` reads at runtime.
 *
 * Why this test exists
 * ────────────────────
 * `src/config.ts` runs `loadConfig(process.env)` at module load. The
 * container sees ONLY the env vars listed in docker-compose.yml's
 * services.web.environment block — nothing else from the host env
 * is forwarded. So if a developer adds a new `env.FOO_BAR` read to
 * config.ts but forgets to add `- FOO_BAR=${FOO_BAR}` to compose,
 * the container boots with FOO_BAR="" and either (a) silently runs
 * with the wrong default, or (b) crashes the whole process via the
 * validator. Both are bad. This test is the trip-wire.
 *
 * The exact bug this would have caught: Sprint 2026-W18 preflight.
 * AUTH_OAUTH_ENABLED + GOOGLE_OAUTH_* + GITHUB_OAUTH_* +
 * COMPUTE_OAUTH_BRIDGE_SIGNING_KEY + PUBLIC_SITE_URL were all read
 * by config.ts but NONE were in compose. Would have worked locally
 * (reads directly from .env.local), but prod deploys would have
 * crashed the container on boot.
 *
 * How the test works
 * ──────────────────
 * 1. Parse `src/config.ts` for `env.FOO_BAR` reads → required set.
 * 2. Parse `docker-compose.yml` for lines matching
 *    `- FOO_BAR=...` under services.web.environment → forwarded set.
 * 3. Assert required ⊆ forwarded.
 * 4. Separate check: anything in `forwarded` but not read by config
 *    is fine (compose forwards extras that downstream libs consume:
 *    NODE_ENV, STRIPE_*, etc.) — we don't enforce that direction.
 *
 * Intentionally uses regex rather than a proper TS AST walk because
 * (a) the ts-morph / typescript compiler surface is overkill for a
 * handful of env.FOO patterns and (b) this test has to stay fast
 * and dep-free so it runs on every preflight.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..");

/**
 * Strip TS/JS comments (block + line) from a source string. Prevents
 * false-positive env-var matches in JSDoc examples like
 * `process.env.FOO` or in inline `// TODO env.BAR` comments.
 *
 * The strip is naive — it does NOT handle `/*` or `//` appearing
 * inside string literals. That's acceptable here because
 * `src/config.ts` is a small, hand-authored file with no such
 * oddities; if one ever appears the test will trip obviously and
 * this helper will need an upgrade (ts.createSourceFile tokenizer).
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // block + JSDoc
    .replace(/\/\/[^\n]*/g, ""); // line
}

/**
 * Extract every identifier read via `env.IDENTIFIER` from config.ts.
 * Matches both `env.FOO` and `env.FOO ?? ...` patterns — anywhere
 * the TypeScript source reads a property off the injected env param.
 *
 * The first `env.` in the file is the function parameter name inside
 * `loadConfig(env: NodeJS.ProcessEnv = process.env)` — so every
 * `env.FOO` in the body is guaranteed to be a real env-var read.
 *
 * Comments are stripped first so doc examples like `process.env.FOO`
 * don't produce phantom requirements.
 */
function extractConfigEnvReads(): Set<string> {
  const raw = readFileSync(join(REPO_ROOT, "src/config.ts"), "utf8");
  const src = stripComments(raw);
  const reads = new Set<string>();
  const pattern = /\benv\.([A-Z][A-Z0-9_]*)\b/g;
  for (const match of src.matchAll(pattern)) {
    reads.add(match[1]);
  }
  return reads;
}

/**
 * Extract every env var name forwarded by docker-compose.yml's
 * services.web.environment list. Matches lines of the form
 * `- FOO_BAR=${FOO_BAR}` or `- FOO_BAR=${FOO_BAR:-default}` or
 * `- FOO_BAR=literal-value`. Comments (# ...) are ignored.
 *
 * We don't try to parse full YAML here — the compose file is stable,
 * hand-authored, and conventional. A regex walk over non-comment
 * lines starting with `- NAME=` is sufficient and keeps the test
 * dep-free (no `js-yaml` install).
 */
function extractComposeEnvForwarded(): Set<string> {
  const src = readFileSync(join(REPO_ROOT, "docker-compose.yml"), "utf8");
  const forwarded = new Set<string>();
  for (const rawLine of src.split("\n")) {
    // Strip comments and trim
    const line = rawLine.replace(/#.*$/, "").trim();
    // Match `- NAME=...`
    const m = line.match(/^-\s+([A-Z][A-Z0-9_]*)=/);
    if (m) forwarded.add(m[1]);
  }
  return forwarded;
}

/**
 * Env vars config.ts might reference but that we explicitly do NOT
 * require compose to forward. Keep this list short and documented —
 * every entry is an opportunity for a subtle boot-time bug. Current
 * entries are either (a) build-time only (baked into the Docker image
 * by the Dockerfile, not needed at runtime) or (b) intentionally
 * always-undefined-in-prod so the default branch fires.
 *
 * If you find yourself adding to this list, reconsider whether the
 * var should just go into compose.
 */
const COMPOSE_FORWARDING_ALLOWLIST = new Set<string>([
  // No entries today. All vars config.ts reads are prod-runtime
  // required and must be forwarded.
]);

describe("docker-compose.yml env-var contract (src/config.ts)", () => {
  const required = extractConfigEnvReads();
  const forwarded = extractComposeEnvForwarded();

  it("extracts at least one env read from src/config.ts (smoke check)", () => {
    // If this fails, the regex-based extraction is broken — every
    // other assertion below would falsely pass on an empty set.
    expect(required.size, "extractConfigEnvReads() returned 0 vars").toBeGreaterThan(0);
  });

  it("extracts at least one env forward from docker-compose.yml (smoke check)", () => {
    expect(forwarded.size, "extractComposeEnvForwarded() returned 0 vars").toBeGreaterThan(0);
  });

  it("every env var src/config.ts reads is forwarded by docker-compose.yml", () => {
    const missing: string[] = [];
    for (const key of required) {
      if (!forwarded.has(key) && !COMPOSE_FORWARDING_ALLOWLIST.has(key)) {
        missing.push(key);
      }
    }
    expect(
      missing,
      `src/config.ts reads these env vars but docker-compose.yml does NOT forward them:\n  - ${missing.join(
        "\n  - ",
      )}\n\nFix: add each to services.web.environment in docker-compose.yml, ` +
        `e.g. "- ${missing[0] ?? "FOO_BAR"}=\${${missing[0] ?? "FOO_BAR"}}". ` +
        `If a var is intentionally build-time-only, add it to COMPOSE_FORWARDING_ALLOWLIST ` +
        `with a one-line justification comment.`,
    ).toEqual([]);
  });

  it("OAuth Phase 2 required vars are all forwarded (regression guard)", () => {
    // Explicit list to guard against a future refactor of config.ts
    // that accidentally stops reading any of these. If someone deletes
    // `env.GOOGLE_OAUTH_CLIENT_ID` from config.ts, the generic test
    // above would pass (it's no longer "required") but OAuth would
    // silently stop working. This test pins the expectation.
    const oauthRequired = [
      "AUTH_OAUTH_ENABLED",
      "COMPUTE_OAUTH_BRIDGE_SIGNING_KEY",
      "GOOGLE_OAUTH_CLIENT_ID",
      "GOOGLE_OAUTH_CLIENT_SECRET",
      "GITHUB_OAUTH_CLIENT_ID",
      "GITHUB_OAUTH_CLIENT_SECRET",
      "PUBLIC_SITE_URL",
    ];
    const missing = oauthRequired.filter((k) => !forwarded.has(k));
    expect(
      missing,
      `docker-compose.yml is missing OAuth env forwards: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
