/**
 * Homepage holistic-redesign guard (sprint 2026-07-01, Page 1).
 *
 * The homepage was rewritten benefit-first to close the Holistic Review's
 * positioning findings. This is a source-level governance test (same style as
 * phase2-testid-reconciliation) — it reads src/app/page.tsx and asserts the
 * finding-closing content is present and the regressions we care about can't
 * silently creep back. It deliberately avoids rendering the async server
 * component (which pulls in the R3F HeroSceneWrapper) — copy/structure is what
 * we're guarding here; the CTA wiring is covered by HeroAnimatedSequence.test.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");

describe("Homepage redesign — findings closed", () => {
  it("P1: hero/capabilities lead with the outcome, not the mechanism", () => {
    // Benefit-first capability headings replace the crypto-first ones.
    expect(src).toContain("It can prove itself");
    expect(src).toContain("It's warm before you ask");
    expect(src).toContain("It answers instantly");
    expect(src).toContain("You plug in, you don't integrate");
  });

  it("P1b: the Merkle card's headline is about PROOF, not forgetting", () => {
    // "It never forgets" was retired 2026-07-13. Two reasons, both fatal:
    //   1. It headlined the MERKLE card, whose body is entirely about tamper-
    //      detection. The headline described a different capability than its body.
    //   2. It contradicted the very next card, which says "old paths decay" —
    //      a hostile reader could falsify the claim by reading one paragraph on.
    // Decay is the FEATURE ("a vector database can delete; only a parametric
    // memory can forget"), so the site must never claim it never forgets.
    expect(src).not.toContain("It never forgets");
    expect(src).toContain("only a parametric memory can forget");
  });

  it("P2: every headline metric carries the honest 'our own substrate' qualifier", () => {
    // Substring stops before the JSX line-wrap ("customer\n benchmark").
    expect(src).toContain("measured on our own production substrate — not a customer");
  });

  it("P3: self-referential social proof is replaced by the Verify section", () => {
    expect(src).toContain("Take the proof.");
    expect(src).toContain('data-testid="landing-verify-cta"');
    // The old self-trust block is gone.
    expect(src).not.toContain("We trust it with ours");
  });

  it("A1: the agent-operable pillar is surfaced on the page", () => {
    expect(src).toContain("Operable by the humans and the agents.");
  });

  it("P4: pricing preview anchors Professional and collapses enterprise", () => {
    expect(src).toContain("Most popular");
    expect(src).toContain('data-testid="landing-pricing-enterprise"');
    expect(src).toContain("Talk to us");
    // The old flat six-tier hint line is gone.
    expect(src).not.toContain("Enterprise Cloud $299");
    expect(src).not.toContain("Self-Hosted $499");
  });

  it("S1: the dead metadata.keywords array is removed", () => {
    expect(src).not.toMatch(/keywords:\s*\[/);
  });

  it("D1/accuracy: storage-engine copy says LevelDB (owner-confirmed)", () => {
    expect(src).toContain("LevelDB sharded across four independent Merkle trees");
  });

  it("setup card uses the real per-instance droplet-mcp.nz URL + streamable-http", () => {
    expect(src).toContain("droplet-mcp.nz/mcp");
    expect(src).toContain("streamable-http");
    expect(src).toContain("Bearer mmpm_live_");
    // No placeholder domain from the mock.
    expect(src).not.toContain("mmpm.dev/you/mcp");
  });

  it("does NOT advertise the $1 entry tier (owner directive)", () => {
    // Cards emit their testid via a template literal, one per advertised tier.
    expect(src).toContain("data-testid={`landing-pricing-${tier.slug}`}");
    // Advertised tiers are Starter → Team only; the $1 "free" tier is absent.
    expect(src).toContain('slug: "starter"');
    expect(src).toContain('slug: "team"');
    expect(src).not.toContain('slug: "free"');
    expect(src).not.toContain('price: "$1"');
  });

  it("preserves the CI-critical testids and JSON-LD", () => {
    expect(src).toContain('data-testid="landing-section-features"');
    expect(src).toContain("homeFaqJsonLd");
    expect(src).toContain("landingJsonLd");
    expect(src).toContain("homeBreadcrumbJsonLd");
  });
});
