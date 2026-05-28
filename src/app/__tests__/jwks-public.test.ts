/**
 * Sprint nextjs-16-upgrade (2026-05-27) — JWKS smoke test (test 5.13).
 *
 * Pins the structural validity of `public/.well-known/jwks.json`. This
 * file is fetched by every customer MMPM substrate that this website's
 * compute backend has provisioned: the compute provisioner passes
 * `MMPM_JWKS_URI=https://parametric-memory.dev/.well-known/jwks.json`
 * into each substrate's environment (see compute/src/workers/
 * substrate-provisioner.ts:158), and the substrate uses the published
 * keys to verify Merkle snapshot signatures issued by this site.
 *
 * If this file is malformed, deleted, or missing required JWK fields,
 * EVERY customer substrate's verifier silently falls back to embedded
 * keys — the trust narrative degrades from "verifiable against an
 * independently published key" to "self-attested embedded key".
 *
 * The Next.js route handler emits ACAO + cache headers on this file
 * (next.config.ts:66-75); this test does NOT test that — that's in
 * src/app/__tests__/seo-headers.test.ts. This test asserts only the
 * file's structural shape as a JWK Set per RFC 7517 + the Ed25519
 * fields our snapshot signing uses (OKP, crv=Ed25519).
 *
 * Reference: docs/SPRINT-NEXTJS-16-UPGRADE-2026-05-27.md (test 5.13).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

const JWKS_PATH = path.resolve(__dirname, "../../../public/.well-known/jwks.json");

interface Jwk {
  kty: string;
  crv?: string;
  alg?: string;
  use?: string;
  kid?: string;
  x?: string;
  [k: string]: unknown;
}

interface JwkSet {
  keys: Jwk[];
}

describe("public/.well-known/jwks.json — structural contract", () => {
  let raw: string;
  let parsed: JwkSet;

  beforeAll(async () => {
    raw = await fs.readFile(JWKS_PATH, "utf8");
    parsed = JSON.parse(raw) as JwkSet;
  });

  it("exists and is non-empty", () => {
    expect(raw.length).toBeGreaterThan(0);
  });

  it("parses as valid JSON", () => {
    // Implicit — JSON.parse in beforeAll would have thrown.
    expect(typeof parsed).toBe("object");
    expect(parsed).not.toBeNull();
  });

  it("declares a `keys` array per RFC 7517 §5", () => {
    expect(Array.isArray(parsed.keys)).toBe(true);
    expect(parsed.keys.length).toBeGreaterThan(0);
  });

  describe("each key", () => {
    it("declares the required JWK fields (kty, kid)", () => {
      for (const key of parsed.keys) {
        expect(typeof key.kty).toBe("string");
        expect(typeof key.kid).toBe("string");
        expect((key.kid as string).length).toBeGreaterThan(0);
      }
    });

    it("uses kty=OKP + crv=Ed25519 (MMPM snapshot signing convention)", () => {
      for (const key of parsed.keys) {
        expect(key.kty).toBe("OKP");
        expect(key.crv).toBe("Ed25519");
      }
    });

    it("publishes the Ed25519 public key (`x` field, base64url-encoded)", () => {
      // RFC 8037 §2: Ed25519 public key in JWK is the `x` parameter,
      // base64url-encoded raw 32-byte key (so length 43 chars with no padding).
      for (const key of parsed.keys) {
        expect(typeof key.x).toBe("string");
        // base64url alphabet: A-Z a-z 0-9 - _
        expect(key.x).toMatch(/^[A-Za-z0-9_-]+$/);
        // Ed25519 raw pubkey is 32 bytes → 43 base64url chars (no pad).
        expect((key.x as string).length).toBe(43);
      }
    });

    it("marks keys with use=sig (signing) when use is declared", () => {
      for (const key of parsed.keys) {
        if (key.use !== undefined) {
          expect(key.use).toBe("sig");
        }
      }
    });
  });

  it("includes at least one key with kid starting `mmpm-snapshot-signing-` (the canonical signing-key family)", () => {
    const found = parsed.keys.some((k) => (k.kid ?? "").startsWith("mmpm-snapshot-signing-"));
    expect(found).toBe(true);
  });
});
