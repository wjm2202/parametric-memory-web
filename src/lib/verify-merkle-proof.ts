/**
 * S16-4: Client-side Merkle proof verification using Web Crypto API.
 *
 * Walks the audit path from leaf → root, hashing pairs at each level.
 * Uses SubtleCrypto.digest (SHA-256) — no external crypto libraries.
 *
 * The MMPM Merkle tree hashes raw binary buffers:
 *   - Leaf hash = SHA-256(atomNameString) → 32 bytes, stored as hex
 *   - Internal node = SHA-256(leftBytes ++ rightBytes) → raw 32-byte concat
 *   - auditPath entries are hex-encoded 32-byte siblings
 *   - Verification must decode hex → bytes, concat bytes, then hash bytes
 */

import type { MerkleProof } from "@/types/memory";

export interface VerificationResult {
  verified: boolean;
  leafHash: string;
  computedRoot: string;
  expectedRoot: string;
  auditPathLength: number;
  verificationTimeMs: number;
}

/** Hex string → Uint8Array (raw bytes) */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/** Uint8Array → hex string */
function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 of raw bytes, returned as raw bytes */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest("SHA-256", data as unknown as ArrayBuffer);
  return new Uint8Array(hash);
}

/** Concatenate two Uint8Arrays */
function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

/**
 * Verify a Merkle proof client-side.
 *
 * Works with raw binary buffers to match the server's hashing:
 *   SHA-256(Buffer.concat([leftBuffer, rightBuffer]))
 *
 * @param proof - The MerkleProof from the server (leaf, root, auditPath, index)
 * @returns VerificationResult with verified=true if the proof checks out
 */
export async function verifyMerkleProof(proof: MerkleProof): Promise<VerificationResult> {
  const start = performance.now();

  let current = hexToBytes(proof.leaf);
  let currentIndex = proof.index;

  for (const siblingHex of proof.auditPath) {
    const sibling = hexToBytes(siblingHex);
    // Even index = we're the left child, odd = right child
    const combined = currentIndex % 2 === 0 ? concat(current, sibling) : concat(sibling, current);

    current = await sha256(combined);
    currentIndex = Math.floor(currentIndex / 2);
  }

  const computedRoot = bytesToHex(current.buffer as ArrayBuffer);
  const elapsed = performance.now() - start;

  return {
    verified: computedRoot === proof.root,
    leafHash: proof.leaf,
    computedRoot,
    expectedRoot: proof.root,
    auditPathLength: proof.auditPath.length,
    verificationTimeMs: Math.round(elapsed * 100) / 100,
  };
}

/**
 * Verify both the shard-level proof (atom → shard root) and
 * the top-level proof (shard root → tree root) in sequence.
 *
 * Both must pass for the atom to be considered fully verified.
 */
export async function verifyFullProof(
  currentProof: MerkleProof,
  shardRootProof: MerkleProof,
): Promise<VerificationResult> {
  const start = performance.now();

  // Step 1: Verify atom exists in its shard tree
  const shardResult = await verifyMerkleProof(currentProof);
  if (!shardResult.verified) {
    return {
      ...shardResult,
      verificationTimeMs: Math.round((performance.now() - start) * 100) / 100,
    };
  }

  // Step 2: Verify shard root exists in the top-level tree
  const topResult = await verifyMerkleProof(shardRootProof);

  const elapsed = performance.now() - start;

  return {
    verified: topResult.verified,
    leafHash: currentProof.leaf,
    computedRoot: topResult.computedRoot,
    expectedRoot: shardRootProof.root,
    auditPathLength: currentProof.auditPath.length + shardRootProof.auditPath.length,
    verificationTimeMs: Math.round(elapsed * 100) / 100,
  };
}
