import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";

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

interface ProvisioningProgress {
  queueStatus: string;
  phase: string | null;
  dropletId: number | null;
  dropletIp: string | null;
  startedAt: string | null;
}

interface HealthInfo {
  droplet?: { status: string; ip: string | null; sshReady: boolean };
  substrate: { status: string; mcpEndpoint: string | null; reachable: boolean | null };
  https: { configured: boolean; endpoint: string | null };
}

interface SubstrateInfo {
  id: string | null;
  slug: string | null;
  tier: string;
  status: string;
  mcpEndpoint: string | null;
  hostingModel: string;
  provisioning: ProvisioningProgress | null;
  health: HealthInfo | null;
  maxAtoms: number;
  maxBootstrapsMonth: number;
  maxStorageMB: number;
  atomCount: number;
  bootstrapCountMonth: number;
  storageUsedMB: number;
  provisionedAt: string | null;
  gracePeriodEndsAt: string | null;
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

async function getSubstrate(
  sessionToken: string,
): Promise<SubstrateInfo | null> {
  try {
    const res = await fetch(
      `${COMPUTE_URL}/api/v1/my-substrate`,
      {
        headers: { Authorization: `Bearer ${sessionToken}` },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
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

  const substrate = await getSubstrate(sessionToken);

  return <DashboardClient account={account} substrate={substrate} />;
}
