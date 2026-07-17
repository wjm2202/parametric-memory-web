/**
 * Re-export shim over @parametric-memory/snapshot-verify (S4, 2026-07-17).
 *
 * The per-atom Merkle inclusion-proof walk (originally S16-4, written here)
 * now lives in the published package — the same implementation the mmpm CLI
 * and the /verify page use, pinned by the substrate's canonical test
 * vectors. The package's MerkleProof type is structurally identical to
 * `MerkleProof` in "@/types/memory" ({ leaf, root, auditPath, index }), so
 * existing callers (memory-store, visualise/AccessControls) need no changes.
 * New code should import the package directly.
 */

export { verifyMerkleProof, verifyFullProof } from "@parametric-memory/snapshot-verify";
export type { VerificationResult } from "@parametric-memory/snapshot-verify";
