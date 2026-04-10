import type { Metadata } from "next";
import SignupClient from "./SignupClient";

export const metadata: Metadata = {
  title: "Sign Up",
  alternates: { canonical: "https://parametric-memory.dev/signup" },
};

export default function SignupPage() {
  return <SignupClient />;
}
