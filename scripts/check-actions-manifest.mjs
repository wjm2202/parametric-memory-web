#!/usr/bin/env node
/**
 * scripts/check-actions-manifest.mjs
 *
 * Dual-accessibility A6 guard — Part 2.
 *
 * Validates the structural integrity of public/.well-known/actions.json —
 * the Schema.org Action catalogue that machine-readable clients (browsing
 * agents, answer engines) use to discover what they can do on our site.
 *
 * This is a STATIC structural check — it does NOT hit the network. Live
 * drift (manifest target vs. real-endpoint response) is a separate concern
 * deferred to a scheduled production job; running it from CI on every PR
 * would be flaky and would slow the merge pipeline.
 *
 * Invariants checked:
 *   1.  File parses as JSON.
 *   2.  @context === "https://schema.org".
 *   3.  version matches YYYY-MM-DD ISO date.
 *   4.  actions is a non-empty array.
 *   5.  For each action:
 *         - @type ends in "Action"
 *         - @id matches https://parametric-memory.dev/#action-<name>
 *         - name is a non-empty kebab-case slug
 *         - target is either a string URL or { urlTemplate: string } and
 *           points at parametric-memory.dev (with one allowance: urls may
 *           include the {search_term_string} placeholder for SearchAction)
 *         - description is ≥ 20 characters
 *   6.  All @ids are unique.
 *   7.  All names are unique.
 *   8.  agentNotes has keys: userAgent, pricing, provenance.
 *
 * Safety: read-only FS. No git, no network, no env access.
 * Usage:
 *   node scripts/check-actions-manifest.mjs                # default path
 *   node scripts/check-actions-manifest.mjs --file=<path>  # override
 *   node scripts/check-actions-manifest.mjs --quiet        # suppress OK msg
 *
 * Exit codes:
 *   0  manifest is structurally valid
 *   1  one or more invariants violated (details on stderr)
 *   2  file missing, unreadable, or not valid JSON
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const MANIFEST_PATH = resolve(args.file ?? "public/.well-known/actions.json");
const QUIET = Boolean(args.quiet);

const errors = [];
const err = (msg) => errors.push(msg);

// ── 1. Load + parse ──────────────────────────────────────────────────────
let raw;
try {
  raw = readFileSync(MANIFEST_PATH, "utf8");
} catch (e) {
  process.stderr.write(`check-actions-manifest: could not read ${MANIFEST_PATH}: ${e.message}\n`);
  process.exit(2);
}

let manifest;
try {
  manifest = JSON.parse(raw);
} catch (e) {
  process.stderr.write(
    `check-actions-manifest: ${MANIFEST_PATH} is not valid JSON: ${e.message}\n`,
  );
  process.exit(2);
}

// ── 2. Top-level invariants ──────────────────────────────────────────────
if (manifest["@context"] !== "https://schema.org") {
  err(`@context must be "https://schema.org", got ${JSON.stringify(manifest["@context"])}`);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.version ?? "")) {
  err(`version must match YYYY-MM-DD, got ${JSON.stringify(manifest.version)}`);
}

if (!Array.isArray(manifest.actions) || manifest.actions.length === 0) {
  err("actions must be a non-empty array");
}

// ── 3. Per-action invariants ─────────────────────────────────────────────
const seenIds = new Set();
const seenNames = new Set();

if (Array.isArray(manifest.actions)) {
  for (const [i, a] of manifest.actions.entries()) {
    const tag = `actions[${i}]${a?.name ? ` (${a.name})` : ""}`;

    // @type
    if (typeof a["@type"] !== "string" || !a["@type"].endsWith("Action")) {
      err(`${tag}: @type must end in "Action", got ${JSON.stringify(a["@type"])}`);
    }

    // name
    if (typeof a.name !== "string" || !/^[a-z][a-z0-9-]*$/.test(a.name)) {
      err(`${tag}: name must be kebab-case, got ${JSON.stringify(a.name)}`);
    } else if (seenNames.has(a.name)) {
      err(`${tag}: duplicate name "${a.name}"`);
    } else {
      seenNames.add(a.name);
    }

    // @id — must follow .../#action-<name>
    const expectedId = `https://parametric-memory.dev/#action-${a.name}`;
    if (a["@id"] !== expectedId) {
      err(`${tag}: @id must be ${expectedId}, got ${JSON.stringify(a["@id"])}`);
    } else if (seenIds.has(a["@id"])) {
      err(`${tag}: duplicate @id "${a["@id"]}"`);
    } else {
      seenIds.add(a["@id"]);
    }

    // target — either string URL or { urlTemplate: string }
    let targetStr = null;
    if (typeof a.target === "string") targetStr = a.target;
    else if (a.target && typeof a.target === "object" && typeof a.target.urlTemplate === "string") {
      targetStr = a.target.urlTemplate;
    } else {
      err(`${tag}: target must be a URL string or { urlTemplate: string }`);
    }
    if (targetStr && !targetStr.startsWith("https://parametric-memory.dev/")) {
      err(`${tag}: target must point at parametric-memory.dev, got ${JSON.stringify(targetStr)}`);
    }

    // description
    if (typeof a.description !== "string" || a.description.length < 20) {
      err(`${tag}: description must be ≥ 20 characters`);
    }
  }
}

// ── 4. agentNotes keys ───────────────────────────────────────────────────
const notes = manifest.agentNotes ?? {};
for (const key of ["userAgent", "pricing", "provenance"]) {
  if (typeof notes[key] !== "string" || notes[key].length < 20) {
    err(`agentNotes.${key} must be a string of ≥ 20 characters`);
  }
}

// ── 5. Report ────────────────────────────────────────────────────────────
if (errors.length > 0) {
  process.stderr.write(
    `\ncheck-actions-manifest: FAIL — ${errors.length} invariant(s) violated:\n`,
  );
  for (const e of errors) {
    process.stderr.write(`  - ${e}\n`);
  }
  process.exit(1);
}

if (!QUIET) {
  process.stdout.write(
    `check-actions-manifest: OK — ${manifest.actions.length} actions, version ${manifest.version}\n`,
  );
}
process.exit(0);
