/**
 * TwoFactorClient — wizard for enrolment, disable, and regenerate.
 *
 * One component, many states. Uses the live `useRecentAuth` status to decide
 * the top-level branch, and a local `step` state machine for the enrolment
 * + management sub-flows.
 *
 * ## Top-level branches
 *
 *   - status null + loading      → skeleton
 *   - status null + error        → redirect to /admin/security with toast
 *   - status.enrolled = false    → ENROLMENT FLOW (steps: intro/qr/verify/codes/done)
 *   - status.enrolled = true     → MANAGEMENT FLOW (steps: manage/disable/regenerate/codes/done)
 *
 * Both flows are wrapped in <RecentAuthGate>. Anything that calls /setup-init,
 * /setup-verify, /disable, or /regenerate-backup-codes is recent-auth gated;
 * /status is the only call that doesn't need recent-auth (the gate itself
 * reads it).
 *
 * ## State-machine choices
 *
 *  - The 10 backup codes are held in component state and never persisted.
 *    Once the user navigates away from the codes step, they're gone for
 *    good. This is intentional — the API only emits them once, and we
 *    don't want them lingering in localStorage / sessionStorage.
 *  - The QR setup payload (secret, otpauthUri, qrSvg) is held in state
 *    too. On a wizard restart (user clicks "Start over"), we POST
 *    /setup-init again to get a fresh secret — never reusing a previous
 *    one. Compute's setup-init handler DELETEs the old half-enrolled row
 *    inside its transaction so this is safe.
 *  - "Cancel" at any step clears all wizard state and routes back to
 *    /admin/security. The half-enrolled row left behind by /setup-init
 *    gets pruned by the cleanup cron in Sprint 6 (1-hour TTL).
 *
 * ## Error envelopes
 *
 * The compute API uses `{ error: { code, message } }` for 4xx/5xx. Every
 * `apiCall` helper below extracts and surfaces these:
 *   - `totp_already_enrolled` (409 on /setup-init)
 *   - `totp_invalid` (401 on verify/disable/regenerate — wrong code)
 *   - `totp_invalid_input` (400 — malformed body)
 *   - `totp_not_pending` (409 on /setup-verify — no pending row)
 *   - `totp_not_enrolled` (409 on /disable, /regenerate)
 * Anything else surfaces as a generic "Something went wrong, try again."
 */

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import SiteNavbar from "@/components/ui/SiteNavbar";
import { SixDigitInput } from "@/components/SixDigitInput";
import { RecentAuthGate } from "@/components/RecentAuthGate";
import { useRecentAuth, type TotpStatus } from "@/hooks/useRecentAuth";
import { FormattedDate } from "@/components/FormattedDate";

interface AccountInfo {
  id: string;
  email: string;
}

interface SetupInitResponse {
  secret: string;
  otpauthUri: string;
  qrSvg: string;
}

interface SetupVerifyResponse {
  backupCodes: string[];
}

interface RegenerateResponse {
  backupCodes: string[];
}

interface ApiError {
  code: string;
  message: string;
}

/** Normalise the compute API error envelope into a friendly inline message. */
function friendlyError(
  err: ApiError | null,
  fallback = "Something went wrong. Try again.",
): string {
  if (!err) return fallback;
  switch (err.code) {
    case "totp_already_enrolled":
      return "Two-factor authentication is already enabled. Disable it first to re-enrol.";
    case "totp_invalid":
      return "That code didn't match. Try the next one your authenticator shows.";
    case "totp_invalid_input":
      return "Enter the 6-digit code shown in your authenticator app.";
    case "totp_not_pending":
      return "Your enrolment timed out. Start over to scan a new QR code.";
    case "totp_not_enrolled":
      return "Two-factor authentication isn't enabled on this account.";
    case "auth_required":
    case "reauth_required":
      return "Your session is no longer fresh. Re-verify your identity to continue.";
    default:
      return err.message ?? fallback;
  }
}

/** Tiny POST helper so each handler isn't a 6-line fetch dance. */
async function postJson<T>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: ApiError }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  if (res.ok) {
    const data = (await res.json()) as T;
    return { ok: true, data };
  }
  let err: ApiError = { code: "unknown", message: "Request failed" };
  try {
    const body = (await res.json()) as { error?: ApiError };
    if (body.error) err = body.error;
  } catch {
    /* ignore body-parse failure — keep generic envelope */
  }
  return { ok: false, status: res.status, error: err };
}

// ─── Enrolment sub-flow steps ────────────────────────────────────────────────

type EnrolStep = "intro" | "scan" | "verify" | "codes" | "done";

// ─── Management sub-flow steps ───────────────────────────────────────────────

type ManageStep = "manage" | "disable" | "regenerate" | "codes" | "done";

// ─────────────────────────────────────────────────────────────────────────────
// Outer component: branch on enrolment status, wrap in RecentAuthGate
// ─────────────────────────────────────────────────────────────────────────────

export default function TwoFactorClient({ account }: { account: AccountInfo }) {
  const router = useRouter();
  const { status, loading, error, refetch } = useRecentAuth();

  useEffect(() => {
    if (error === "session_expired") {
      router.replace("/login?error=session_expired");
    }
  }, [error, router]);

  // Pick the next-target for RecentAuthGate based on current TOTP enrolment
  // state — if the user came in to enrol but their recent-auth is stale,
  // sending them back here after re-verification keeps the journey intact.
  const nextPath = "/admin/security/two-factor";

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      <SiteNavbar isLoggedIn={true} variant="standard" />

      <div className="border-b border-white/5 px-4 pt-20 pb-4 sm:px-6 sm:pt-24">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link
            href="/admin/security"
            data-testid="two-factor-breadcrumb-back"
            className="text-sm text-white/40 transition-colors hover:text-white/70"
          >
            ← Security
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-sm text-white/70">Two-factor authentication</span>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-6 font-[family-name:var(--font-syne)] text-xl font-semibold text-white sm:mb-8 sm:text-2xl">
          Two-factor authentication
        </h1>

        {loading && (
          <div
            data-testid="two-factor-loading"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
          >
            <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
            <div className="mt-3 h-3 w-72 animate-pulse rounded bg-white/5" />
          </div>
        )}

        {!loading && error === "network" && (
          <div
            data-testid="two-factor-error"
            role="alert"
            className="rounded-2xl border border-red-500/30 bg-red-500/[0.05] p-5 sm:p-6"
          >
            <h2 className="font-semibold text-white">Could not load two-factor settings</h2>
            <p className="mt-1 text-sm text-white/60">Check your connection and try again.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 inline-flex items-center rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/[0.08]"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && status && (
          <RecentAuthGate email={account.email} next={nextPath}>
            {status.enrolled ? (
              <ManagementFlow status={status} onChange={() => void refetch()} />
            ) : (
              <EnrolmentFlow email={account.email} onComplete={() => void refetch()} />
            )}
          </RecentAuthGate>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Enrolment flow
// ─────────────────────────────────────────────────────────────────────────────

function EnrolmentFlow({ email, onComplete }: { email: string; onComplete: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<EnrolStep>("intro");
  const [setup, setSetup] = useState<SetupInitResponse | null>(null);
  const [code, setCode] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState<boolean>(false);

  /** Step 1 → step 2: hit /setup-init, render the QR. */
  async function startSetup() {
    setSubmitting(true);
    setErrorMsg(null);
    const res = await postJson<SetupInitResponse>("/api/auth/factors/totp/setup-init");
    setSubmitting(false);
    if (!res.ok) {
      setErrorMsg(friendlyError(res.error));
      return;
    }
    setSetup(res.data);
    setStep("scan");
  }

  /** Step 3: submit /setup-verify with the 6-digit code. */
  async function verifyCode(submitted: string) {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    const res = await postJson<SetupVerifyResponse>("/api/auth/factors/totp/setup-verify", {
      code: submitted,
    });
    setSubmitting(false);
    if (!res.ok) {
      // Wrong code → keep the user on the verify step, clear the input,
      // surface the error inline. Other errors → bail to step intro
      // so they can try again with a fresh secret.
      if (res.error.code === "totp_invalid" || res.error.code === "totp_invalid_input") {
        setCode("");
        setErrorMsg(friendlyError(res.error));
      } else {
        setStep("intro");
        setSetup(null);
        setCode("");
        setErrorMsg(friendlyError(res.error));
      }
      return;
    }
    setBackupCodes(res.data.backupCodes);
    setStep("codes");
  }

  function startOver() {
    setStep("intro");
    setSetup(null);
    setCode("");
    setBackupCodes([]);
    setAcknowledged(false);
    setErrorMsg(null);
  }

  function finish() {
    toast.success("Two-factor authentication enabled");
    onComplete();
    router.push("/admin/security");
  }

  // ── Step: intro ─────────────────────────────────────────────────────────
  if (step === "intro") {
    return (
      <div
        data-testid="enrol-step-intro"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
      >
        <h2 className="font-semibold text-white">Add an authenticator app</h2>
        <p className="mt-2 text-sm text-white/60">
          You&apos;ll scan a QR code with an authenticator app on your phone — 1Password, Authy,
          Google Authenticator, or similar — and confirm a 6-digit code to finish setup. Once
          enabled, sign-in will require your current code from the app.
        </p>
        <p className="mt-3 text-sm text-white/60">
          Have your phone ready. The whole flow takes about a minute.
        </p>
        {errorMsg && (
          <p data-testid="enrol-error" role="alert" className="mt-3 text-sm text-red-300">
            {errorMsg}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void startSetup()}
            disabled={submitting}
            data-testid="enrol-step-intro-continue"
            className="inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Starting…" : "Continue"}
          </button>
          <Link
            href="/admin/security"
            data-testid="enrol-step-intro-cancel"
            className="text-sm text-white/50 hover:text-white/80"
          >
            Cancel
          </Link>
        </div>
      </div>
    );
  }

  // ── Step: scan ──────────────────────────────────────────────────────────
  if (step === "scan" && setup) {
    return (
      <div
        data-testid="enrol-step-scan"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
      >
        <h2 className="font-semibold text-white">Scan this QR code</h2>
        <p className="mt-1 text-sm text-white/60">
          Open your authenticator app and add a new account by scanning the QR code below. The app
          will start showing a 6-digit code that changes every 30 seconds.
        </p>

        <div
          data-testid="enrol-qr-svg"
          // The qrcode lib emits an SVG with `viewBox` but no explicit width/
          // height, which collapses to 0×0 in an inline-block container with
          // no intrinsic sizing. The arbitrary child-selector variants
          // `[&>svg]:h-60 [&>svg]:w-60` size the inner <svg> to 240×240px
          // (Tailwind h-60 / w-60 = 15rem). Doing this on the consumer side
          // keeps the server payload size-agnostic for future consumers
          // (e.g. a native app that wants a different rendering size).
          //
          // Server-rendered SVG. Trusted source (this server). Secret never
          // appears in a client URL.
          className="mt-5 inline-block rounded-lg bg-white p-3 [&>svg]:h-60 [&>svg]:w-60"
          dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
        />

        <details className="mt-5 text-sm text-white/60">
          <summary className="cursor-pointer text-white/70 hover:text-white">
            Can&apos;t scan? Use the manual entry key
          </summary>
          <p className="mt-3">
            In your authenticator app, choose &quot;manual entry&quot; or &quot;enter setup
            key&quot; and paste:
          </p>
          <code
            data-testid="enrol-manual-key"
            className="mt-2 block rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-sm break-all text-white/80"
          >
            {setup.secret}
          </code>
          <p className="mt-2 text-xs text-white/40">
            Account: <span className="text-white/60">{email}</span> · Issuer: MMPM
          </p>
        </details>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setStep("verify")}
            data-testid="enrol-step-scan-continue"
            className="inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
          >
            I scanned the code
          </button>
          <button
            type="button"
            onClick={startOver}
            data-testid="enrol-step-scan-cancel"
            className="text-sm text-white/50 hover:text-white/80"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Step: verify ────────────────────────────────────────────────────────
  if (step === "verify" && setup) {
    return (
      <div
        data-testid="enrol-step-verify"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
      >
        <h2 className="font-semibold text-white">Enter the 6-digit code</h2>
        <p className="mt-1 text-sm text-white/60">
          Type the code your authenticator app is currently showing.
        </p>
        <div className="mt-4">
          <SixDigitInput
            value={code}
            onChange={setCode}
            onComplete={(full) => void verifyCode(full)}
            disabled={submitting}
            describedBy={errorMsg ? "enrol-verify-error" : undefined}
          />
        </div>
        {errorMsg && (
          <p
            id="enrol-verify-error"
            data-testid="enrol-verify-error"
            role="alert"
            className="mt-3 text-sm text-red-300"
          >
            {errorMsg}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void verifyCode(code)}
            disabled={submitting || code.length !== 6}
            data-testid="enrol-step-verify-submit"
            className="inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Verifying…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setStep("scan")}
            disabled={submitting}
            className="text-sm text-white/50 hover:text-white/80 disabled:opacity-50"
          >
            ← Back to QR
          </button>
        </div>
      </div>
    );
  }

  // ── Step: codes ─────────────────────────────────────────────────────────
  if (step === "codes" && backupCodes.length === 10) {
    return (
      <div
        data-testid="enrol-step-codes"
        className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.05] p-5 sm:p-6"
      >
        <h2 className="font-semibold text-white">Save your backup codes</h2>
        <p className="mt-1 text-sm text-white/70">
          These 10 single-use codes let you sign in if you lose access to your authenticator app.
          Save them somewhere safe (a password manager works well).{" "}
          <strong className="text-white">You won&apos;t see them again</strong>.
        </p>

        <ul
          data-testid="enrol-backup-codes"
          className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-sm text-white/90 sm:grid-cols-2"
        >
          {backupCodes.map((c, i) => (
            <li key={i} data-testid={`enrol-backup-code-${i}`} className="select-all">
              {c}
            </li>
          ))}
        </ul>

        <BackupCodeDownloadButton codes={backupCodes} email={email} />

        <label className="mt-5 flex items-start gap-3 text-sm text-white/80">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            data-testid="enrol-acknowledge"
            className="mt-0.5"
          />
          I&apos;ve saved these backup codes somewhere safe.
        </label>

        <button
          type="button"
          onClick={finish}
          disabled={!acknowledged}
          data-testid="enrol-step-codes-finish"
          className="mt-4 inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Done
        </button>
      </div>
    );
  }

  // Fallback — shouldn't reach here, but render a safe state if we do.
  return (
    <div
      data-testid="enrol-fallback"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
    >
      <p className="text-sm text-white/60">
        Something unexpected happened.{" "}
        <button onClick={startOver} className="underline">
          Start over
        </button>
        .
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Management flow (enrolled state)
// ─────────────────────────────────────────────────────────────────────────────

function ManagementFlow({ status, onChange }: { status: TotpStatus; onChange: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<ManageStep>("manage");
  const [code, setCode] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState<boolean>(false);

  function reset() {
    setStep("manage");
    setCode("");
    setErrorMsg(null);
    setNewCodes([]);
    setAcknowledged(false);
  }

  /** Disable accepts a TOTP code OR a backup code. The compute API handles both. */
  async function submitDisable(submitted: string) {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    const res = await postJson<{ ok: boolean }>("/api/auth/factors/totp/disable", {
      code: submitted.trim(),
    });
    setSubmitting(false);
    if (!res.ok) {
      setErrorMsg(friendlyError(res.error));
      setCode("");
      return;
    }
    toast.success("Two-factor authentication disabled");
    onChange();
    router.push("/admin/security");
  }

  /** Regenerate accepts ONLY a 6-digit TOTP code. Backup codes are rejected by the API. */
  async function submitRegenerate(submitted: string) {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    const res = await postJson<RegenerateResponse>(
      "/api/auth/factors/totp/regenerate-backup-codes",
      { code: submitted },
    );
    setSubmitting(false);
    if (!res.ok) {
      setErrorMsg(friendlyError(res.error));
      setCode("");
      return;
    }
    setNewCodes(res.data.backupCodes);
    setStep("codes");
    onChange();
  }

  // ── Step: manage (default) ──────────────────────────────────────────────
  if (step === "manage") {
    return (
      <div data-testid="manage-step-overview" className="space-y-4">
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.04] p-5 sm:p-6">
          <h2 className="font-semibold text-white">Two-factor authentication is on</h2>
          <p className="mt-1 text-sm text-white/70">
            Your sign-in is protected by your authenticator app.
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs tracking-wider text-white/40 uppercase">Last used</dt>
              <dd className="mt-0.5 text-white/80">
                {status.lastUsedAt ? <FormattedDate iso={status.lastUsedAt} /> : "Never"}
              </dd>
            </div>
            <div>
              <dt className="text-xs tracking-wider text-white/40 uppercase">Backup codes</dt>
              <dd className="mt-0.5 text-white/80">
                {status.backupCodesRemaining} of 10 remaining
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <h3 className="font-semibold text-white">Regenerate backup codes</h3>
          <p className="mt-1 text-sm text-white/60">
            Issues 10 fresh codes and invalidates all previous ones. Requires a current 6-digit code
            from your authenticator app.
          </p>
          <button
            type="button"
            onClick={() => {
              setStep("regenerate");
              setErrorMsg(null);
              setCode("");
            }}
            data-testid="manage-go-regenerate"
            className="mt-4 inline-flex items-center rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/[0.08]"
          >
            Regenerate codes
          </button>
        </div>

        <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.03] p-5 sm:p-6">
          <h3 className="font-semibold text-white">Turn off two-factor authentication</h3>
          <p className="mt-1 text-sm text-white/60">
            Disabling 2FA removes the extra step at sign-in. You can enable it again at any time.
            Provide a current 6-digit code OR a backup code.
          </p>
          <button
            type="button"
            onClick={() => {
              setStep("disable");
              setErrorMsg(null);
              setCode("");
            }}
            data-testid="manage-go-disable"
            className="mt-4 inline-flex items-center rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm text-red-100 transition-colors hover:bg-red-500/20"
          >
            Disable 2FA
          </button>
        </div>
      </div>
    );
  }

  // ── Step: disable ────────────────────────────────────────────────────────
  if (step === "disable") {
    return (
      <div
        data-testid="manage-step-disable"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
      >
        <h2 className="font-semibold text-white">Disable two-factor authentication</h2>
        <p className="mt-1 text-sm text-white/60">
          Enter the 6-digit code from your authenticator app, OR a backup code (xxxx-xxxx). Either
          is accepted.
        </p>
        <div className="mt-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456 or xxxx-xxxx"
            disabled={submitting}
            autoComplete="one-time-code"
            data-testid="manage-disable-input"
            className="w-full max-w-xs rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-base text-white transition-colors outline-none focus:border-white/30 focus:bg-white/[0.06] disabled:opacity-50"
          />
        </div>
        {errorMsg && (
          <p data-testid="manage-disable-error" role="alert" className="mt-3 text-sm text-red-300">
            {errorMsg}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void submitDisable(code)}
            disabled={submitting || code.trim().length === 0}
            data-testid="manage-disable-submit"
            className="inline-flex items-center rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-100 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Disabling…" : "Disable 2FA"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={submitting}
            data-testid="manage-disable-cancel"
            className="text-sm text-white/50 hover:text-white/80 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Step: regenerate (collect TOTP code) ────────────────────────────────
  if (step === "regenerate") {
    return (
      <div
        data-testid="manage-step-regenerate"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
      >
        <h2 className="font-semibold text-white">Regenerate backup codes</h2>
        <p className="mt-1 text-sm text-white/60">
          Enter a current 6-digit code from your authenticator app. Backup codes aren&apos;t
          accepted here — using one to regenerate the rest would defeat the alert chain.
        </p>
        <div className="mt-4">
          <SixDigitInput
            value={code}
            onChange={setCode}
            onComplete={(full) => void submitRegenerate(full)}
            disabled={submitting}
            describedBy={errorMsg ? "manage-regen-error" : undefined}
          />
        </div>
        {errorMsg && (
          <p
            id="manage-regen-error"
            data-testid="manage-regenerate-error"
            role="alert"
            className="mt-3 text-sm text-red-300"
          >
            {errorMsg}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void submitRegenerate(code)}
            disabled={submitting || code.length !== 6}
            data-testid="manage-regenerate-submit"
            className="inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Generating…" : "Regenerate"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={submitting}
            data-testid="manage-regenerate-cancel"
            className="text-sm text-white/50 hover:text-white/80 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Step: codes (post-regenerate display) ────────────────────────────────
  if (step === "codes" && newCodes.length === 10) {
    return (
      <div
        data-testid="manage-step-codes"
        className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.05] p-5 sm:p-6"
      >
        <h2 className="font-semibold text-white">Your new backup codes</h2>
        <p className="mt-1 text-sm text-white/70">
          Save these 10 single-use codes. Your previous codes are now invalid.
          <strong className="text-white"> You won&apos;t see these again.</strong>
        </p>

        <ul
          data-testid="manage-backup-codes"
          className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-sm text-white/90"
        >
          {newCodes.map((c, i) => (
            <li key={i} data-testid={`manage-backup-code-${i}`} className="select-all">
              {c}
            </li>
          ))}
        </ul>

        <BackupCodeDownloadButton codes={newCodes} email="" />

        <label className="mt-5 flex items-start gap-3 text-sm text-white/80">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            data-testid="manage-acknowledge"
            className="mt-0.5"
          />
          I&apos;ve saved these new codes somewhere safe.
        </label>

        <button
          type="button"
          onClick={() => {
            toast.success("Backup codes regenerated");
            router.push("/admin/security");
          }}
          disabled={!acknowledged}
          data-testid="manage-codes-finish"
          className="mt-4 inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <p className="text-sm text-white/60">
        Something unexpected happened.{" "}
        <button onClick={reset} className="underline">
          Reset
        </button>
        .
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BackupCodeDownloadButton — builds an in-memory Blob and triggers download.
// ─────────────────────────────────────────────────────────────────────────────

function BackupCodeDownloadButton({ codes, email }: { codes: string[]; email: string }) {
  const blobUrl = useMemo(() => {
    if (typeof window === "undefined") return null;
    const header = email ? `# MMPM backup codes — ${email}\n` : `# MMPM backup codes\n`;
    const body = [
      header,
      `# Generated: ${new Date().toISOString()}\n`,
      `# Each code works exactly once. Keep this file somewhere safe.\n`,
      ``,
      ...codes,
      ``,
    ].join("\n");
    const blob = new Blob([body], { type: "text/plain" });
    return URL.createObjectURL(blob);
  }, [codes, email]);

  // Revoke the blob URL on unmount so we don't leak the codes in memory.
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  if (!blobUrl) return null;

  return (
    <a
      href={blobUrl}
      download="mmpm-backup-codes.txt"
      data-testid="backup-codes-download"
      className="mt-4 inline-flex items-center rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/[0.08]"
    >
      Download as .txt
    </a>
  );
}
