// =============================================================================
// /verify — re-export shim over @parametric-memory/snapshot-verify.
// =============================================================================
// The original header of this file (2026-05) said:
//
//   "When S2 (Node verifier CLI) starts, this file gets factored into a
//    shared package consumed by both /verify and the CLI."
//
// That happened (S4, 2026-07-17). The implementation now lives in the
// published package — the SAME bytes the mmpm CLI runs — pinned by the
// substrate's canonical test vectors in that package's CI:
//
//   https://www.npmjs.com/package/@parametric-memory/snapshot-verify
//   https://github.com/wjm2202/mmpm-verify
//
// The trust property is unchanged: pure browser verification, WebCrypto
// only, zero runtime dependencies, no API calls (mechanically enforced by
// the package's guard tests). This shim exists so VerifyClient and its
// test suites keep their imports; new code should import the package
// directly.
// =============================================================================

export { verifySnapshot, verifyMasterRoot, canonicalize } from "@parametric-memory/snapshot-verify";
export type {
  SnapshotV1,
  VerifyResult,
  CheckResult,
  VerifySnapshotOptions,
} from "@parametric-memory/snapshot-verify";
