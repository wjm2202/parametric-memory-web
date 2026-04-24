#!/usr/bin/env node
/**
 * scripts/check-testids.mjs
 *
 * Dual-accessibility A6 guard — Part 1.
 *
 * DUAL-ACCESSIBILITY.md is the authoritative pre-registration list: "Any new
 * interactive element added during the sprint must choose a name from this
 * list or add a new entry here first, before the PR that uses it."
 *
 * That means the registry leads source. The enforcement direction is:
 *
 *   source testid → must exist in registry        (HARD FAIL on drift)
 *   registry testid → may or may not be in source (INFORMATIONAL warning)
 *
 * Why not the other way round? Because pre-registration is intentional —
 * testids get reserved before components land. Failing CI on "registered
 * but not yet wired" would block every PR that registered a name for a
 * component scheduled for a later commit in the same sprint.
 *
 * Failing on "wired but not registered" catches the real governance risk:
 * a developer invents a testid without updating the registry, and the
 * registry silently rots into irrelevance.
 *
 * Safety: read-only FS. No git, no network, no env access.
 * Usage:
 *   node scripts/check-testids.mjs                    # default paths
 *   node scripts/check-testids.mjs --doc=<path>       # override registry
 *   node scripts/check-testids.mjs --src=<path>       # override src root
 *   node scripts/check-testids.mjs --quiet            # hide OK / warnings
 *   node scripts/check-testids.mjs --strict           # also fail on unwired
 *
 * Exit codes:
 *   0  every source testid is registered (unwired registry entries allowed)
 *   1  one or more source testids are not registered
 *   2  input file missing or malformed (internal error)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const DOC_PATH = resolve(args.doc ?? "docs/DUAL-ACCESSIBILITY.md");
const SRC_ROOT = resolve(args.src ?? "src");
const QUIET = Boolean(args.quiet);
const STRICT = Boolean(args.strict);

function die(code, msg) {
  process.stderr.write(`check-testids: ${msg}\n`);
  process.exit(code);
}

// ── 1. Load the registry ──────────────────────────────────────────────────
let doc;
try {
  doc = readFileSync(DOC_PATH, "utf8");
} catch (e) {
  die(2, `could not read ${DOC_PATH}: ${e.message}`);
}

/**
 * Extract backtick-wrapped testid-like tokens from markdown table rows.
 * A testid is kebab-case, starts with a letter, ≥ 2 hyphen-separated
 * segments (one hyphen minimum — e.g. `nav-home`, `signin-google`).
 * Pattern entries (with `<slug>` placeholders) are captured as prefixes
 * so we can match interpolated source testids to them.
 */
const registered = new Set(); // literal testids registered
const patterns = new Set(); // patterns like "dashboard-substrate-row-<slug>"

for (const line of doc.split("\n")) {
  if (!line.startsWith("|")) continue;
  const matches = line.matchAll(/`([^`]+)`/g);
  for (const [, tok] of matches) {
    if (tok.includes("<") && tok.includes(">")) {
      // Pattern entry — record the static prefix (everything up to the
      // first `<placeholder>`).
      const prefix = tok.replace(/<[^>]+>.*$/, "");
      if (/^[a-z][a-z0-9]*(-[a-z0-9]+)*-$/.test(prefix)) {
        patterns.add(prefix);
      }
      continue;
    }
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+){1,}$/.test(tok)) continue;
    registered.add(tok);
  }
}

if (registered.size === 0 && patterns.size === 0) {
  // Registry is completely empty of both literal and pattern entries — the
  // parser probably broke (or someone pointed us at the wrong file). A
  // registry with patterns but no literals is legitimate (all entries are
  // templates), so we only bail when BOTH sets are empty.
  die(2, `no testids found in ${DOC_PATH} — registry parser broke?`);
}

// ── 2. Walk src/ and extract every data-testid literal ───────────────────
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (["node_modules", ".next", "dist", "__tests__"].includes(name)) continue;
      out.push(...walk(p));
    } else if (/\.(tsx?|mjs|js)$/.test(name)) {
      if (/\.test\.(tsx?|mjs|js)$/.test(name)) continue;
      out.push(p);
    }
  }
  return out;
}

const srcFiles = walk(SRC_ROOT);

// Extract every testid emitted from source. Three forms:
//   data-testid="foo"             → "foo"
//   data-testid='foo'             → "foo"
//   data-testid={`foo-${x}-bar`}  → pattern "foo-" (everything before first ${)
const emitted = new Map(); // testid (or pattern prefix) → [files]

for (const path of srcFiles) {
  const text = readFileSync(path, "utf8");
  // Quoted literals
  for (const [, tok] of text.matchAll(/data-testid=["']([^"']+)["']/g)) {
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+){1,}$/.test(tok)) continue;
    if (!emitted.has(tok)) emitted.set(tok, []);
    emitted.get(tok).push(path);
  }
  // Template literals
  for (const [, tok] of text.matchAll(/data-testid=\{`([^`]+)`\}/g)) {
    // Normalise to the pattern prefix: everything up to the first ${
    const prefix = tok.split("${")[0];
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*-$/.test(prefix)) continue;
    if (!emitted.has(prefix)) emitted.set(prefix, []);
    emitted.get(prefix).push(path);
  }
}

// ── 3. Cross-check: every source testid must be registered ───────────────
const unregistered = [];

for (const [tok, files] of emitted) {
  const isPattern = tok.endsWith("-");
  if (isPattern) {
    // Template emitter — must match a registered pattern prefix OR have at
    // least one registered literal that shares this prefix.
    const patternMatch = patterns.has(tok);
    const literalMatch = [...registered].some((r) => r.startsWith(tok));
    if (!patternMatch && !literalMatch) {
      unregistered.push({ tok: `${tok}\${...}`, files: [...new Set(files)] });
    }
  } else {
    // Literal emitter — must match a registered literal.
    if (!registered.has(tok)) {
      unregistered.push({ tok, files: [...new Set(files)] });
    }
  }
}

// ── 4. Informational: registered but not wired ───────────────────────────
const unwired = [];
for (const r of registered) {
  const literalHit = emitted.has(r);
  // Could also be emitted via template — check prefix match.
  const templateHit = [...emitted.keys()]
    .filter((k) => k.endsWith("-"))
    .some((prefix) => r.startsWith(prefix));
  if (!literalHit && !templateHit) unwired.push(r);
}

// ── 5. Report ─────────────────────────────────────────────────────────────
if (!QUIET) {
  process.stdout.write(
    `check-testids: scanned ${srcFiles.length} source files · ${registered.size} registered literals + ${patterns.size} patterns · ${emitted.size} emitted testids/patterns\n`,
  );
}

if (unregistered.length > 0) {
  process.stderr.write(
    `\ncheck-testids: FAIL — ${unregistered.length} source testid(s) are NOT registered in docs/DUAL-ACCESSIBILITY.md:\n`,
  );
  for (const { tok, files } of unregistered.sort((a, b) => a.tok.localeCompare(b.tok))) {
    process.stderr.write(`  - ${tok}\n      emitted by: ${files.join(", ")}\n`);
  }
  process.stderr.write(
    `\nEvery data-testid in source MUST be pre-registered. Add an entry to docs/DUAL-ACCESSIBILITY.md (under the appropriate surface section) describing the element, then re-run this check.\n`,
  );
  process.exit(1);
}

if (unwired.length > 0) {
  if (!QUIET) {
    process.stdout.write(
      `check-testids: INFO — ${unwired.length} registered testid(s) not yet wired to source (OK — pre-registration is permitted):\n`,
    );
    for (const t of unwired.sort()) {
      process.stdout.write(`  · ${t}\n`);
    }
  }
  // STRICT is independent of QUIET — strict-mode must fail regardless of
  // whether the INFO block was rendered. Gating the exit behind !QUIET
  // silently swallows the failure when `--quiet --strict` are combined
  // (as they are from `npm run guard:testids` in test environments).
  if (STRICT) {
    process.stderr.write(
      `\ncheck-testids: FAIL — --strict set and ${unwired.length} registered testid(s) are not wired to source.\n`,
    );
    process.exit(1);
  }
}

if (!QUIET) {
  process.stdout.write(`check-testids: OK — every source testid is registered\n`);
}
process.exit(0);
