import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";
const SESSION_COOKIE = "mmpm_session";

interface AccountInfo {
  id: string;
  email: string;
  name: string | null;
  tier: string | null;
  status: string;
  balanceCents: number;
  createdAt: string;
}

interface SubstrateSummary {
  id: string;
  slug: string;
  tier: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  hasActiveSubscription: boolean;
  renewsAt: string | null;
}

interface SubstratesResponse {
  substrates: SubstrateSummary[];
}

async function getAccount(sessionToken: string): Promise<AccountInfo | null> {
  try {
    const res = await fetch(`${COMPUTE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getSubstrates(sessionToken: string): Promise<SubstrateSummary[]> {
  try {
    const res = await fetch(`${COMPUTE_URL}/api/v1/substrates`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data: SubstratesResponse = await res.json();
    return data.substrates ?? [];
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) redirect("/login?redirect=/dashboard");

  const account = await getAccount(sessionToken);
  if (!account) {
    cookieStore.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
    redirect("/login?error=session_expired");
  }

  const substrates = await getSubstrates(sessionToken);

  return <DashboardClient account={account} substrates={substrates} />;
}
