/**
 * Doc-sync test — every @parametric-memory.dev address the site uses must be
 * listed in docs/RUNBOOK-CORPORATE-EMAIL-PROTON.md.
 *
 * WHY: the legal pages (Terms, Privacy, DPA, AUP) publish role addresses such
 * as privacy@ and legal@ as contractual contact points. Each one must exist as
 * a real alias (or be covered by catch-all) in the Proton mailbox. The runbook
 * is the record of what's provisioned; if someone adds a new address to the
 * site without adding it to the runbook, it may silently bounce or vanish into
 * catch-all with nobody aware it's a published commitment.
 *
 * WHAT IT SCANS: text files under src/, public/ and content/, excluding test
 * files (fixtures may use addresses that are never published).
 *
 * TO FIX A FAILURE: add a row for the address to the "Address inventory"
 * table in the runbook, and create the alias in Proton if it must send mail.
 *
 * LOCAL-ONLY: docs/ is gitignored (.gitignore line 43), so the runbook is
 * not in CI checkouts. The runbook checks are skipped when the file is
 * absent and run on any machine that has it (Glen's Mac). The extractor
 * unit tests always run.
 *
 * Lives in src/ because vitest's include is src/** (see
 * src/nginx-brand-assets.test.ts for the same rationale).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");
const RUNBOOK = path.join(repoRoot, "docs", "RUNBOOK-CORPORATE-EMAIL-PROTON.md");
const SCAN_DIRS = ["src", "public", "content"];
const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".md",
  ".mdx",
  ".txt",
  ".json",
  ".html",
  ".xml",
  ".yml",
  ".yaml",
]);
const IS_TEST = /(\.test\.|\.spec\.|[\\/]__tests__[\\/]|[\\/]test[\\/])/;

// Local part + optional subdomain(s) + our domain. Case-insensitive.
export const DOMAIN_ADDRESS_RE = /[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)*parametric-memory\.dev\b/gi;

export function extractDomainAddresses(text: string): string[] {
  const found = text.match(DOMAIN_ADDRESS_RE) ?? [];
  return [...new Set(found.map((a) => a.toLowerCase()))].sort();
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".next")) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (TEXT_EXT.has(path.extname(name)) && !IS_TEST.test(full)) out.push(full);
  }
  return out;
}

function addressesUsedBySite(): Map<string, string[]> {
  const where = new Map<string, string[]>();
  for (const d of SCAN_DIRS) {
    for (const file of walk(path.join(repoRoot, d))) {
      for (const addr of extractDomainAddresses(readFileSync(file, "utf8"))) {
        const rel = path.relative(repoRoot, file);
        where.set(addr, [...(where.get(addr) ?? []), rel]);
      }
    }
  }
  return where;
}

describe("extractDomainAddresses", () => {
  it("finds root and subdomain addresses, case-insensitively, deduped", () => {
    const text =
      "Mail Legal@Parametric-Memory.dev or legal@parametric-memory.dev; " +
      "bot: noreply@send.parametric-memory.dev";
    expect(extractDomainAddresses(text)).toEqual([
      "legal@parametric-memory.dev",
      "noreply@send.parametric-memory.dev",
    ]);
  });

  it("ignores other domains and look-alikes", () => {
    const text = "a@example.com b@parametric-memory.dev.evil.com c@notparametric-memory.devx";
    // b@ is matched up to the word boundary of our domain, then rejected by
    // the inventory check — but look-alike suffixes like .devx never match.
    expect(extractDomainAddresses(text)).not.toContain("c@notparametric-memory.devx");
    expect(extractDomainAddresses("a@example.com")).toEqual([]);
  });
});

const HAVE_RUNBOOK = existsSync(RUNBOOK);

describe.skipIf(!HAVE_RUNBOOK)("corporate email runbook (local only — docs/ is gitignored)", () => {
  it("lists every @parametric-memory.dev address the site uses", () => {
    const runbook = readFileSync(RUNBOOK, "utf8").toLowerCase();
    const used = addressesUsedBySite();
    const missing = [...used.entries()]
      .filter(([addr]) => !runbook.includes(addr))
      .map(([addr, files]) => `${addr}  (used in: ${files.join(", ")})`);
    expect(
      missing,
      "Add these to the Address inventory in docs/RUNBOOK-CORPORATE-EMAIL-PROTON.md",
    ).toEqual([]);
  });

  it("finds the legal-page addresses (guards against the scan silently finding nothing)", () => {
    const used = addressesUsedBySite();
    for (const addr of [
      "privacy@parametric-memory.dev",
      "legal@parametric-memory.dev",
      "support@parametric-memory.dev",
      "abuse@parametric-memory.dev",
    ]) {
      expect(used.has(addr), `${addr} should be found in site source`).toBe(true);
    }
  });
});
