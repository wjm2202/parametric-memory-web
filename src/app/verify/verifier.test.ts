import { describe, it, expect } from "vitest";
import { verifyMasterRoot, type SnapshotV1 } from "./verifier";

// Helper: SHA-256 of buffer → hex (mirrors the verifier's internal pair hash).
async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const buf = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(s: string): Uint8Array {
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    return out;
}

// Minimal SnapshotV1-shaped fixture for masterRoot recompute tests. Other
// fields are stubbed; verifyMasterRoot only consults snap.tree.masterRoot
// and snap.tree.shardRoots so the rest can be empty/dummy.
function fixture(opts: { shardRoots: string[]; masterRoot: string }): SnapshotV1 {
    return {
        formatVersion: "1.0.0",
        formatUri: "https://parametric-memory.dev/spec/snapshot/v1",
        exporter: { name: "test", version: "0", host: "test", exportedAtMs: 0, exportedAtIso: "1970-01-01T00:00:00.000Z" },
        tree: {
            treeVersion: 1,
            masterRoot: opts.masterRoot,
            treeHeadTimestampMs: 0,
            shardCount: opts.shardRoots.length,
            shardRoots: opts.shardRoots,
            shardLeafCounts: opts.shardRoots.map(() => 0),
            atomCount: 0,
            edgesRoot: "0".repeat(64),
        },
        atoms: [],
        edges: [],
        hubAtoms: [],
        signature: { alg: "Ed25519", kid: "test", publicKey: "", publicKeyFingerprint: "", keyUri: "", sig: "" },
    } as unknown as SnapshotV1;
}

describe("verifyMasterRoot — spec §6.4 Check B sub-check 4", () => {
    it("PASS when masterRoot equals the recompute over decoded shard-root bytes (single shard)", async () => {
        // RFC 6962 strict: single-leaf root === the leaf hex itself.
        const shardRoot = "ab".repeat(32);
        const snap = fixture({ shardRoots: [shardRoot], masterRoot: shardRoot });
        const result = await verifyMasterRoot(snap);
        expect(result.ok).toBe(true);
        expect(result.computed).toBe(shardRoot);
    });

    it("PASS when masterRoot equals SHA-256(shardRoot1 || shardRoot2) (two shards)", async () => {
        const r1 = "11".repeat(32);
        const r2 = "22".repeat(32);
        const expectedMaster = await sha256Hex(new Uint8Array([...fromHex(r1), ...fromHex(r2)]));
        const snap = fixture({ shardRoots: [r1, r2], masterRoot: expectedMaster });
        const result = await verifyMasterRoot(snap);
        expect(result.ok).toBe(true);
        expect(result.computed).toBe(expectedMaster);
    });

    it("FAIL when masterRoot is the OLD-bug double-hash form (caught by S-AC-29)", async () => {
        // Old bug: SHA-256 of the ASCII hex string of the shard root, instead of
        // using the decoded bytes directly. Reproduce the bug to prove this check
        // catches it — that's the whole point of S-AC-30.
        const shardRoot = "ab".repeat(32);
        const buggyMaster = await sha256Hex(new TextEncoder().encode(shardRoot));
        const snap = fixture({ shardRoots: [shardRoot], masterRoot: buggyMaster });
        const result = await verifyMasterRoot(snap);
        expect(result.ok).toBe(false);
        expect(result.detail).toContain("masterRoot mismatch");
    });

    it("FAIL when masterRoot is a fabricated value", async () => {
        const shardRoot = "33".repeat(32);
        const snap = fixture({ shardRoots: [shardRoot], masterRoot: "ff".repeat(32) });
        const result = await verifyMasterRoot(snap);
        expect(result.ok).toBe(false);
    });

    it("PASS for empty shard list (degenerate but valid: empty Merkle root)", async () => {
        // rootOfHashes([]) returns "0".repeat(64) per the kernel's contract.
        const emptyRoot = "0".repeat(64);
        const snap = fixture({ shardRoots: [], masterRoot: emptyRoot });
        const result = await verifyMasterRoot(snap);
        expect(result.ok).toBe(true);
    });
});
