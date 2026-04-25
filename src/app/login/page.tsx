import type { Metadata } from "next";
import LoginClient from "./LoginClient";
import { config } from "@/config";
import { getEnabledOauthProviders } from "@/lib/auth/providers/enabled";

export const metadata: Metadata = {
  title: "Sign In",
  alternates: { canonical: "https://parametric-memory.dev/login" },
};

/**
 * Force per-request server rendering.
 *
 * Why this is mandatory
 * ─────────────────────
 * The OAuth provider list comes from `getEnabledOauthProviders(config)`,
 * which reads `process.env` (AUTH_OAUTH_ENABLED, GOOGLE_OAUTH_*,
 * GITHUB_OAUTH_*, COMPUTE_OAUTH_BRIDGE_SIGNING_KEY) at server-render
 * time.
 *
 * Without `force-dynamic`, Next.js 15's app router will statically
 * generate this page during `npm run build` — and our Docker build
 * (Dockerfile RUN npm run build) executes WITHOUT the OAuth env vars
 * in scope (only GIT_COMMIT_SHA is passed via --build-arg). That bakes
 * `oauthProviders=[]` into the static HTML inside the image. The
 * running container has the env vars set via docker-compose, but they
 * don't matter — the HTML is frozen.
 *
 * With `force-dynamic`, the server component runs per request, reads
 * the live container env, and the buttons appear/disappear in line
 * with the actual deployed feature flag. Trade-off is a sub-10ms SSR
 * step on each /login GET — negligible for a low-traffic auth page.
 *
 * Do NOT remove this without first either:
 *   (a) wiring all OAuth env vars into the Dockerfile build-args AND
 *       the docker-build CI step, OR
 *   (b) confirming the OAuth surface is permanently gone.
 */
export const dynamic = "force-dynamic";

export default function LoginPage() {
  // Resolve OAuth provider list server-side so the feature flag and
  // client credentials never reach the browser bundle. Returns `[]`
  // when AUTH_OAUTH_ENABLED=false — in that mode LoginClient falls
  // back cleanly to the email magic-link form alone.
  const oauthProviders = getEnabledOauthProviders(config);
  return <LoginClient oauthProviders={oauthProviders} />;
}
