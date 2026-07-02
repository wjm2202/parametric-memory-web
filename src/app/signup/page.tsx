import type { Metadata } from "next";
import SignupClient from "./SignupClient";

export const metadata: Metadata = {
  title: "Sign Up",
  // Low-value auth page — keep out of the index (still crawlable/followable).
  robots: { index: false, follow: true },
  alternates: { canonical: "https://parametric-memory.dev/signup" },
};

export default function SignupPage() {
  return <SignupClient />;
}
