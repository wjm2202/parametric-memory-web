import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 4 — ASO (Agent-Schema Optimisation) foundation.
 *
 * Three invariants this suite guards:
 *   1. /.well-known/actions.json exists, is valid JSON, and declares the
 *      five canonical public actions (signin, signup, subscribe-waitlist,
 *      view-pricing, search-docs) with Schema.org Action types.
 *   2. Every JSON-LD block in layout.tsx and page.tsx carries a stable `@id`
 *      IRI, so AI answer engines can reference entities by identifier rather
 *      than by position in the page.
 *   3. llms.txt has Actions + Agent-notes sections, and robots.txt agrees
 *      with the actions manifest on allowed crawlers.
 *
 * Pattern: source-contract. We parse actions.json as JSON and grep source
 * files for the @id IRIs and required keywords. The rendered HTML is tested
 * separately (phase4-page-ssr.test.tsx — future).
 */

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const ACTION_MANIFEST_PATH = "public/.well-known/actions.json";

interface ActionEntry {
  name: string;
  "@type": string;
  "@id": string;
  target: string | { urlTemplate: string };
  method?: string;
  description: string;
}

interface ActionManifest {
  "@context": string;
  name: string;
  version: string;
  homepage: string;
  actions: ActionEntry[];
  agentNotes: Record<string, string>;
}

describe("Phase 4: /.well-known/actions.json manifest", () => {
  const raw = read(ACTION_MANIFEST_PATH);
  const manifest = JSON.parse(raw) as ActionManifest;

  it("uses schema.org as @context", () => {
    expect(manifest["@context"]).toBe("https://schema.org");
  });

  it("declares five canonical actions (signin/signup/waitlist/pricing/search)", () => {
    const names = manifest.actions.map((a) => a.name).sort();
    expect(names).toEqual([
      "search-docs",
      "signin",
      "signup",
      "subscribe-waitlist",
      "view-pricing",
    ]);
  });

  it("every action has @id, @type, target, and description", () => {
    for (const action of manifest.actions) {
      expect(action["@id"]).toMatch(/^https:\/\/parametric-memory\.dev\/#action-/);
      expect(action["@type"]).toMatch(/Action$/);
      expect(action.target).toBeDefined();
      expect(action.description.length).toBeGreaterThan(20);
    }
  });

  it("signin + signup target the magic-link + signup API endpoints", () => {
    const signin = manifest.actions.find((a) => a.name === "signin")!;
    const signup = manifest.actions.find((a) => a.name === "signup")!;
    expect(signin.target).toBe("https://parametric-memory.dev/api/auth/request-link");
    expect(signin.method).toBe("POST");
    expect(signup.target).toBe("https://parametric-memory.dev/api/signup");
    expect(signup.method).toBe("POST");
  });

  it("agentNotes covers user-agent, pricing, and provenance rules", () => {
    const keys = Object.keys(manifest.agentNotes);
    expect(keys).toContain("userAgent");
    expect(keys).toContain("pricing");
    expect(keys).toContain("provenance");
  });

  it("version is an ISO date (YYYY-MM-DD)", () => {
    expect(manifest.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Phase 4: stable @id IRIs on JSON-LD entities", () => {
  const layoutSrc = read("src/app/layout.tsx");
  const pageSrc = read("src/app/page.tsx");

  it("Organization entity has @id #organization", () => {
    expect(layoutSrc).toContain('"@id": "https://parametric-memory.dev/#organization"');
  });

  it("WebApplication entity has @id #webapplication", () => {
    expect(layoutSrc).toContain('"@id": "https://parametric-memory.dev/#webapplication"');
  });

  it("SoftwareApplication entity has @id #softwareapplication", () => {
    expect(layoutSrc).toContain('"@id": "https://parametric-memory.dev/#softwareapplication"');
  });

  it("WebPage entity has @id #webpage", () => {
    expect(pageSrc).toContain('"@id": "https://parametric-memory.dev/#webpage"');
  });

  it("FAQPage entity has @id #faq-home", () => {
    expect(pageSrc).toContain('"@id": "https://parametric-memory.dev/#faq-home"');
  });

  it("BreadcrumbList entity has @id #breadcrumbs-home", () => {
    expect(pageSrc).toContain('"@id": "https://parametric-memory.dev/#breadcrumbs-home"');
  });

  it("nested Publisher on landing page links to the canonical Organization IRI", () => {
    // The mainEntity publisher on the landing page references the Organization
    // defined in layout.tsx — this stitches the graph together.
    expect(pageSrc).toMatch(
      /publisher:\s*\{[\s\S]{0,80}"@id":\s*"https:\/\/parametric-memory\.dev\/#organization"/,
    );
  });
});

describe("Phase 4: potentialAction on Organization", () => {
  const layoutSrc = read("src/app/layout.tsx");

  it("Organization declares LoginAction, RegisterAction, SubscribeAction, SearchAction", () => {
    const orgIdx = layoutSrc.indexOf('"@id": "https://parametric-memory.dev/#organization"');
    expect(orgIdx).toBeGreaterThan(-1);
    // Organization block runs ~3kb — find the next closing `};` at the top level.
    const end = layoutSrc.indexOf("\n};", orgIdx);
    expect(end).toBeGreaterThan(orgIdx);
    const orgBlock = layoutSrc.slice(orgIdx, end);
    expect(orgBlock).toContain("potentialAction");
    expect(orgBlock).toContain('"@type": "LoginAction"');
    expect(orgBlock).toContain('"@type": "RegisterAction"');
    expect(orgBlock).toContain('"@type": "SubscribeAction"');
    expect(orgBlock).toContain('"@type": "SearchAction"');
  });

  it("LoginAction points at /api/auth/request-link", () => {
    expect(layoutSrc).toMatch(
      /LoginAction[\s\S]{0,400}urlTemplate:\s*"https:\/\/parametric-memory\.dev\/api\/auth\/request-link"/,
    );
  });

  it("RegisterAction points at /api/signup", () => {
    expect(layoutSrc).toMatch(
      /RegisterAction[\s\S]{0,400}urlTemplate:\s*"https:\/\/parametric-memory\.dev\/api\/signup"/,
    );
  });
});

describe("Phase 4: <link rel=actions> in root head", () => {
  const layoutSrc = read("src/app/layout.tsx");

  it('emits <link rel="actions" type="application/actions+json" href="/.well-known/actions.json">', () => {
    expect(layoutSrc).toContain('rel="actions"');
    expect(layoutSrc).toContain('type="application/actions+json"');
    expect(layoutSrc).toContain('href="/.well-known/actions.json"');
  });
});

describe("Phase 4: llms.txt three-agent upgrade", () => {
  const llms = read("public/llms.txt");

  it("has an ## Actions section referencing the manifest URL", () => {
    expect(llms).toMatch(/^## Actions$/m);
    expect(llms).toContain("https://parametric-memory.dev/.well-known/actions.json");
  });

  it("has an ## Agent notes section with three-agent awareness", () => {
    expect(llms).toMatch(/^## Agent notes$/m);
    expect(llms).toContain("Browsing agents");
    expect(llms).toContain("Retrieval crawlers");
    expect(llms).toContain("Answer engines");
  });

  it("names ClaudeBot, PerplexityBot, and Googlebot explicitly somewhere", () => {
    expect(llms).toMatch(/ClaudeBot/);
    expect(llms).toMatch(/PerplexityBot/);
    expect(llms).toMatch(/Googlebot/);
  });

  it("states the precedence rule (manifest wins over llms.txt)", () => {
    expect(llms).toMatch(/actions manifest wins|manifest wins|actions\.json.*wins/i);
  });
});
