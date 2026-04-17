import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminClient from "./AdminClient";

export const metadata: Metadata = {
  title: "Substrate Admin",
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

interface SubstrateDetail {
  id: string | null;
  slug: string | null;
  tier: string;
  status: string;
  mcpEndpoint: string | null;
  hostingModel: string;
  provisioning: {
    queueStatus: string;
    phase: string | null;
    dropletId: number | null;
    dropletIp: string | null;
    startedAt: string | null;
  } | null;
  health: {
    droplet?: { status: string; ip: string | null; sshReady: boolean };
    substrate: { status: string; mcpEndpoint: string | null; reachable: boolean | null };
    https: { configured: boolean; endpoint: string | null };
  } | null;
  maxAtoms: number;
  maxBootstrapsMonth: number;
  maxStorageMB: number;
  atomCount: number;
  bootstrapCountMonth: number;
  storageUsedMB: number;
  provisionedAt: string | null;
  gracePeriodEndsAt: string | null;
  cancelAt: string | null;
  keyUnclaimed: boolean;
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

async function getSubstrateDetail(
  slug: string,
  sessionToken: string,
): Promise<SubstrateDetail | null> {
  try {
    // Use slug-scoped endpoint — NOT the legacy /api/v1/my-substrate
    const res = await fetch(`${COMPUTE_URL}/api/v1/substrates/${encodeURIComponent(slug)}`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    // The slug-scoped endpoint wraps the response in { substrate: ... }
    return data.substrate ?? data;
  } catch {
    return null;
  }
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminPage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    redirect("/login?redirect=/admin");
  }

  const account = await getAccount(sessionToken);

  if (!account) {
    cookieStore.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
    redirect("/login?error=session_expired");
  }

  const params = await searchParams;
  const slug = params.slug as string | undefined;

  if (!slug) {
    redirect("/dashboard");
  }

  const substrate = await getSubstrateDetail(slug, sessionToken);

  return <AdminClient account={account} slug={slug} initialSubstrate={substrate} />;
}
