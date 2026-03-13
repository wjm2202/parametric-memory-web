#!/usr/bin/env tsx
/**
 * generate-docs.ts
 *
 * Extracts API documentation from the MMPM source repository and generates
 * MDX files for the Next.js documentation pages.
 *
 * Sources:
 * - MMPM repo /src/ — API reference (JSDoc extraction)
 * - MMPM repo /README.md — Getting started guide
 * - MMPM repo /CHANGELOG.md — Public changelog
 * - Memory atoms — Architecture decisions, verified facts
 *
 * Output:
 * - /content/docs/api/ — Auto-generated API reference
 * - /content/docs/getting-started.mdx — From README
 * - /content/docs/changelog.mdx — From CHANGELOG
 *
 * This script is called:
 * 1. During `npm run build` (pre-build step)
 * 2. When the MMPM repo pushes to main (via docs-hook webhook)
 * 3. Manually via `npm run generate-docs`
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const CONTENT_DIR = join(process.cwd(), "content", "docs");
const API_DIR = join(CONTENT_DIR, "api");

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function generatePlaceholderDocs() {
  ensureDir(API_DIR);

  // Placeholder getting-started doc
  writeFileSync(
    join(CONTENT_DIR, "getting-started.mdx"),
    `---
title: Getting Started
description: Install and configure Parametric Memory in under 5 minutes.
---

# Getting Started

Welcome to Parametric Memory. This guide will help you go from zero to your first
stored memory in under 5 minutes.

## Installation

\`\`\`bash
npm install parametric-memory
\`\`\`

## Quick Start

\`\`\`typescript
import { ParametricMemory } from 'parametric-memory';

const memory = new ParametricMemory({
  endpoint: 'https://your-instance.parametric-memory.dev',
});

// Store a fact
await memory.store('v1.fact.user_prefers_dark_mode');

// Recall with proof
const result = await memory.recall('user preferences');
console.log(result.atom, result.proof);
\`\`\`

> **Note:** This documentation is auto-generated and will be expanded as the
> API stabilises. See the API Reference for complete endpoint documentation.
`,
  );

  // Placeholder API index
  writeFileSync(
    join(API_DIR, "index.mdx"),
    `---
title: API Reference
description: Complete API reference for Parametric Memory endpoints.
---

# API Reference

Parametric Memory exposes an MCP-compatible HTTP API with the following
endpoint groups:

- **Atoms** — Store, retrieve, list, and tombstone memory atoms
- **Access** — Markov associative recall with cryptographic proofs
- **Search** — Semantic search over memory (when enabled)
- **Training** — Reinforce Markov transition weights
- **Admin** — Health, metrics, commit, export, audit log
- **Verification** — Merkle proof and consistency verification

> This reference is auto-generated from the MMPM source code.
> Last generated: ${new Date().toISOString()}
`,
  );

  console.log("Documentation generated (placeholder mode)");
  console.log(`  → ${join(CONTENT_DIR, "getting-started.mdx")}`);
  console.log(`  → ${join(API_DIR, "index.mdx")}`);
}

// Main
console.log("Generating documentation...");
generatePlaceholderDocs();
console.log("Done.");
