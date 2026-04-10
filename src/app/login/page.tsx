import type { Metadata } from "next";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Sign In",
  alternates: { canonical: "https://parametric-memory.dev/login" },
};

export default function LoginPage() {
  return <LoginClient />;
}
