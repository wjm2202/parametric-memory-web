import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Phase 6 — meta-tests for the two CI guard scripts.
 *
 * These tests validate the guards themselves: that they pass the clean tree,
 * fail on obviously-bad inputs, and return the right exit codes for each
 * failure class. The governance scripts are code we wrote; per the "we write
 * tests for everything we make" rule, they get tests.
 *
 * Strategy: spawn the script via node:child_process with --doc/--src/--file
 * overrides pointing at fixture files in a per-suite tmp directory. No test
 * touches the live repo state. Fixtures are cleaned up in afterAll.
 *
 * We do NOT assert on stdout/stderr wording — only exit codes. Wording is
 * an implementation detail that might change; exit-code contract is the
 * public surface of these CLIs.
 */

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const TESTIDS = path.join(repoRoot, "scripts", "check-testids.mjs");
const ACTIONS = path.join(repoRoot, "scripts", "check-actions-manifest.mjs");

function runNode(
  scriptPath: string,
  args: string[],
): { status: number; stdout: string; stderr: string } {
  const res = spawnSync("node", [scriptPath, "--quiet", ...args], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  return {
    status: res.status ?? -1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

let tmp: string;
beforeAll(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "phase6-guards-"));
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("Phase 6: check-testids.mjs", () => {
  it("exits 0 on the clean repo tree (sanity baseline)", () => {
    const { status } = runNode(TESTIDS, []);
    expect(status).toBe(0);
  });

  it("exits 2 when the registry parses but has zero testids (parser-broke signal)", () => {
    const empty = path.join(tmp, "empty-registry.md");
    writeFileSync(empty, "# empty\n\nNo table rows here.\n");
    const srcDir = path.join(tmp, "empty-src");
    mkdirSync(srcDir, { recursive: true });
    const { status } = runNode(TESTIDS, [`--doc=${empty}`, `--src=${srcDir}`]);
    expect(status).toBe(2);
  });

  it("exits 2 when the registry file is missing (cannot-read signal)", () => {
    const srcDir = path.join(tmp, "missing-registry-src");
    mkdirSync(srcDir, { recursive: true });
    const { status } = runNode(TESTIDS, [`--doc=${path.join(tmp, "nope.md")}`, `--src=${srcDir}`]);
    expect(status).toBe(2);
  });

  it("exits 1 when a source testid is not in the registry (drift signal)", () => {
    const doc = path.join(tmp, "drift-registry.md");
    writeFileSync(
      doc,
      "# registry\n\n| testid | el |\n|---|---|\n| `nav-home` | logo |\n| `nav-link-pricing` | link |\n",
    );
    const srcDir = path.join(tmp, "drift-src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      path.join(srcDir, "Bad.tsx"),
      'export const X = () => <button data-testid="totally-invented-testid">x</button>;\n',
    );
    const { status, stderr } = runNode(TESTIDS, [`--doc=${doc}`, `--src=${srcDir}`]);
    expect(status).toBe(1);
    // Defensive: the invented name should appear in the failure report.
    expect(stderr).toContain("totally-invented-testid");
  });

  it("exits 0 when source testids match registered literals exactly", () => {
    const doc = path.join(tmp, "exact-registry.md");
    writeFileSync(
      doc,
      "# registry\n\n| testid | el |\n|---|---|\n| `sample-ok-one` | el |\n| `sample-ok-two` | el |\n",
    );
    const srcDir = path.join(tmp, "exact-src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      path.join(srcDir, "Good.tsx"),
      `export const A = () => <button data-testid="sample-ok-one">a</button>;
export const B = () => <button data-testid="sample-ok-two">b</button>;
`,
    );
    const { status } = runNode(TESTIDS, [`--doc=${doc}`, `--src=${srcDir}`]);
    expect(status).toBe(0);
  });

  it("matches a template-literal emitter against a pattern registry entry", () => {
    const doc = path.join(tmp, "pattern-registry.md");
    // `row-<slug>` is the pattern-entry form documented in the registry.
    writeFileSync(
      doc,
      "# registry\n\n| testid | el |\n|---|---|\n| `grid-row-<slug>` | one per row |\n",
    );
    const srcDir = path.join(tmp, "pattern-src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      path.join(srcDir, "Grid.tsx"),
      "export const Row = ({slug}: {slug: string}) => <div data-testid={`grid-row-${slug}`}>x</div>;\n",
    );
    const { status } = runNode(TESTIDS, [`--doc=${doc}`, `--src=${srcDir}`]);
    expect(status).toBe(0);
  });

  it("exits 1 under --strict when registered entries are not wired", () => {
    const doc = path.join(tmp, "unwired-registry.md");
    writeFileSync(
      doc,
      "# registry\n\n| testid | el |\n|---|---|\n| `wired-one-ok` | wired |\n| `unwired-two-orphan` | not wired |\n",
    );
    const srcDir = path.join(tmp, "unwired-src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      path.join(srcDir, "OnlyOne.tsx"),
      'export const A = () => <button data-testid="wired-one-ok">a</button>;\n',
    );
    // Without --strict, unwired entries are INFO only → exit 0.
    expect(runNode(TESTIDS, [`--doc=${doc}`, `--src=${srcDir}`]).status).toBe(0);
    // With --strict, unwired entries fail → exit 1.
    expect(runNode(TESTIDS, [`--doc=${doc}`, `--src=${srcDir}`, "--strict"]).status).toBe(1);
  });
});

describe("Phase 6: check-actions-manifest.mjs", () => {
  it("exits 0 on the live public/.well-known/actions.json", () => {
    const { status } = runNode(ACTIONS, []);
    expect(status).toBe(0);
  });

  it("exits 2 when the manifest file is missing", () => {
    const { status } = runNode(ACTIONS, [`--file=${path.join(tmp, "nope.json")}`]);
    expect(status).toBe(2);
  });

  it("exits 2 when the manifest file is malformed JSON", () => {
    const bad = path.join(tmp, "bad.json");
    writeFileSync(bad, "{not valid json");
    const { status } = runNode(ACTIONS, [`--file=${bad}`]);
    expect(status).toBe(2);
  });

  it("exits 1 when @context is wrong", () => {
    const bad = path.join(tmp, "bad-context.json");
    writeFileSync(
      bad,
      JSON.stringify({
        "@context": "https://example.com/not-schema",
        version: "2026-04-24",
        actions: [
          {
            "@type": "ViewAction",
            "@id": "https://parametric-memory.dev/#action-view",
            name: "view",
            target: "https://parametric-memory.dev/",
            description: "View the landing page in a browser.",
          },
        ],
        agentNotes: {
          userAgent: "Agents should identify themselves via a User-Agent string.",
          pricing: "Pricing is documented at https://parametric-memory.dev/pricing.",
          provenance: "Provenance: https://github.com/parametric-memory/website.",
        },
      }),
    );
    const { status, stderr } = runNode(ACTIONS, [`--file=${bad}`]);
    expect(status).toBe(1);
    expect(stderr).toContain("@context");
  });

  it("exits 1 when an action @id does not match the expected #action-<name> pattern", () => {
    const bad = path.join(tmp, "bad-id.json");
    writeFileSync(
      bad,
      JSON.stringify({
        "@context": "https://schema.org",
        version: "2026-04-24",
        actions: [
          {
            "@type": "ViewAction",
            "@id": "https://parametric-memory.dev/#wrong-fragment",
            name: "view",
            target: "https://parametric-memory.dev/",
            description: "View the landing page in a browser.",
          },
        ],
        agentNotes: {
          userAgent: "Agents should identify themselves via a User-Agent string.",
          pricing: "Pricing is documented at https://parametric-memory.dev/pricing.",
          provenance: "Provenance: https://github.com/parametric-memory/website.",
        },
      }),
    );
    const { status } = runNode(ACTIONS, [`--file=${bad}`]);
    expect(status).toBe(1);
  });

  it("exits 1 when agentNotes is missing a required key", () => {
    const bad = path.join(tmp, "missing-notes.json");
    writeFileSync(
      bad,
      JSON.stringify({
        "@context": "https://schema.org",
        version: "2026-04-24",
        actions: [
          {
            "@type": "ViewAction",
            "@id": "https://parametric-memory.dev/#action-view",
            name: "view",
            target: "https://parametric-memory.dev/",
            description: "View the landing page in a browser.",
          },
        ],
        agentNotes: {
          userAgent: "Agents should identify themselves via a User-Agent string.",
          // pricing intentionally omitted
          provenance: "Provenance: https://github.com/parametric-memory/website.",
        },
      }),
    );
    const { status, stderr } = runNode(ACTIONS, [`--file=${bad}`]);
    expect(status).toBe(1);
    expect(stderr).toContain("pricing");
  });

  it("exits 1 when target points at a non-parametric-memory.dev origin", () => {
    const bad = path.join(tmp, "bad-origin.json");
    writeFileSync(
      bad,
      JSON.stringify({
        "@context": "https://schema.org",
        version: "2026-04-24",
        actions: [
          {
            "@type": "ViewAction",
            "@id": "https://parametric-memory.dev/#action-view",
            name: "view",
            target: "https://evil.example.com/",
            description: "View the landing page in a browser.",
          },
        ],
        agentNotes: {
          userAgent: "Agents should identify themselves via a User-Agent string.",
          pricing: "Pricing is documented at https://parametric-memory.dev/pricing.",
          provenance: "Provenance: https://github.com/parametric-memory/website.",
        },
      }),
    );
    const { status } = runNode(ACTIONS, [`--file=${bad}`]);
    expect(status).toBe(1);
  });

  it("exits 1 on duplicate action names", () => {
    const bad = path.join(tmp, "dup-names.json");
    writeFileSync(
      bad,
      JSON.stringify({
        "@context": "https://schema.org",
        version: "2026-04-24",
        actions: [
          {
            "@type": "ViewAction",
            "@id": "https://parametric-memory.dev/#action-view",
            name: "view",
            target: "https://parametric-memory.dev/",
            description: "View the landing page in a browser.",
          },
          {
            "@type": "ViewAction",
            "@id": "https://parametric-memory.dev/#action-view",
            name: "view",
            target: "https://parametric-memory.dev/pricing",
            description: "View the pricing page in a browser.",
          },
        ],
        agentNotes: {
          userAgent: "Agents should identify themselves via a User-Agent string.",
          pricing: "Pricing is documented at https://parametric-memory.dev/pricing.",
          provenance: "Provenance: https://github.com/parametric-memory/website.",
        },
      }),
    );
    const { status, stderr } = runNode(ACTIONS, [`--file=${bad}`]);
    expect(status).toBe(1);
    expect(stderr).toContain("duplicate");
  });
});
