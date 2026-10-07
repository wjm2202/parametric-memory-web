/**
 * Guard — no personal mailbox may appear in anything the website publishes.
 *
 * WHY: until 2026-10-08 the founder's personal Gmail was the public contact
 * address (SUPPORT_EMAIL, llms.txt, actions.json, LICENSE, README, package
 * author, docker-compose default). The company now has Proton aliases on
 * parametric-memory.dev (support@, legal@, privacy@, abuse@, postmaster@,
 * glen@ — see docs/RUNBOOK-CORPORATE-EMAIL-PROTON.md). Personal addresses
 * attract spam, leak a private identity, and can't be handed over if the
 * business changes hands.
 *
 * WHAT IT SCANS: src/, public/, scripts/, content/, .github/ and the root
 * files that ship or get published (LICENSE, README.md, package.json,
 * docker-compose*.yml, .env.example). Test files are scanned too — fixtures
 * should use example.com.
 *
 * KNOWN_EXCEPTIONS lists files with an open, tracked problem. The test also
 * fails if an exception is no longer needed, so the list can only shrink.
 *
 * Lives in src/ because vitest's include is src/**.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

// Free/consumer mail providers + the founder's personal handle on any domain.
export const PERSONAL_EMAIL_RE =
  /[a-z0-9._%+-]+@(?:gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|pm|proton|protonmail)\.(?:com|me|ch)\b|entityone22@/gi;

const SCAN_DIRS = ["src", "public", "scripts", "content", ".github"];
const ROOT_FILES = ["LICENSE", "README.md", "package.json", ".env.example"];
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
  ".css",
  ".svg",
  ".webmanifest",
]);

/**
 * Open problems, keyed by repo-relative path → why it is tolerated for now.
 * Remove the entry in the same change that fixes the file.
 */
const KNOWN_EXCEPTIONS: Record<string, string> = {
  "public/demo-snapshots/mmpm-research-snap.json":
    "Merkle-sealed demo export of the MMPM substrate; contains a real customer's " +
    "email and the founder's Gmail inside atom text. Cannot be hand-edited " +
    "without breaking proofs — must be regenerated from a scrubbed substrate. " +
    "Flagged 2026-10-08.",
};

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".next")) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (TEXT_EXT.has(path.extname(name))) out.push(full);
  }
  return out;
}

function scannedFiles(): string[] {
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(repoRoot, d)));
  for (const f of readdirSync(repoRoot)) {
    if (ROOT_FILES.includes(f) || /^docker-compose.*\.ya?ml$/.test(f)) {
      files.push(path.join(repoRoot, f));
    }
  }
  return files;
}

function offenders(): Map<string, string[]> {
  const hits = new Map<string, string[]>();
  for (const file of scannedFiles()) {
    if (file === __filename) continue; // this file's own regex fixtures
    const found = readFileSync(file, "utf8").match(PERSONAL_EMAIL_RE);
    if (found) hits.set(path.relative(repoRoot, file), [...new Set(found)]);
  }
  return hits;
}

describe("PERSONAL_EMAIL_RE", () => {
  it("matches consumer mailboxes and the founder handle", () => {
    for (const s of [
      "someone@gmail.com",
      "x@outlook.com",
      "y@pm.me",
      "z@proton.me",
      "entityone22@anything.example",
    ]) {
      expect(s.match(PERSONAL_EMAIL_RE), s).not.toBeNull();
    }
  });

  it("does not match company or example addresses", () => {
    for (const s of [
      "support@parametric-memory.dev",
      "noreply@send.parametric-memory.dev",
      "ada@example.com",
      "user@mail.company.co.nz",
    ]) {
      expect(s.match(PERSONAL_EMAIL_RE), s).toBeNull();
    }
  });
});

describe("no personal email in published files", () => {
  it("scans a meaningful set of files (guards against the walk silently finding nothing)", () => {
    const files = scannedFiles().map((f) => path.relative(repoRoot, f));
    expect(files).toContain("src/config/site.ts");
    expect(files).toContain("public/llms.txt");
    expect(files).toContain("public/.well-known/actions.json");
    expect(files).toContain("LICENSE");
    expect(files).toContain("docker-compose.yml");
  });

  it("finds no personal addresses outside KNOWN_EXCEPTIONS", () => {
    const unexpected = [...offenders().entries()]
      .filter(([file]) => !(file in KNOWN_EXCEPTIONS))
      .map(([file, addrs]) => `${file}: ${addrs.join(", ")}`);
    expect(unexpected, "Use an alias from src/config/site.ts instead").toEqual([]);
  });

  it("every KNOWN_EXCEPTION still needs to be there (the list can only shrink)", () => {
    const hits = offenders();
    const stale = Object.keys(KNOWN_EXCEPTIONS).filter((f) => !hits.has(f));
    expect(stale, "Fixed — remove these from KNOWN_EXCEPTIONS").toEqual([]);
  });
});
