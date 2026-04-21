import type { Metadata } from "next";
import LoginClient from "./LoginClient";
import { config } from "@/config";
import { getEnabledOauthProviders } from "@/lib/auth/providers/enabled";

export const metadata: Metadata = {
  title: "Sign In",
  alternates: { canonical: "https://parametric-memory.dev/login" },
};

export default function LoginPage() {
  // Resolve OAuth provider list server-side so the feature flag and
  // client credentials never reach the browser bundle. Returns `[]`
  // when AUTH_OAUTH_ENABLED=false — in that mode LoginClient falls
  // back cleanly to the email magic-link form alone.
  const oauthProviders = getEnabledOauthProviders(config);
  return <LoginClient oauthProviders={oauthProviders} />;
}
