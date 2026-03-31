/**
 * Substrate tier definitions for the frontend.
 *
 * These mirror the backend SUBSTRATE_TIERS in mmpm-compute.
 * Used by the pricing page and dashboard for display purposes.
 */

export interface SubstrateTierInfo {
  id: string;
  name: string;
  price: number; // Monthly price in dollars
  description: string;
  features: string[];
  limits: {
    maxAtoms: number;
    maxBootstrapsPerMonth: number;
    maxStorageMB: number;
  };
  popular?: boolean;
}

export const SUBSTRATE_TIERS: SubstrateTierInfo[] = [
  {
    id: "free",
    name: "Free",
    price: 1,
    description: "Get started with MMPM. $1/month, cancel anytime.",
    features: [
      "500 atoms",
      "100 bootstraps/month",
      "50 MB storage",
      "MCP native",
      "Merkle proofs",
      "Community support",
    ],
    limits: { maxAtoms: 500, maxBootstrapsPerMonth: 100, maxStorageMB: 50 },
  },
  {
    id: "indie",
    name: "Indie",
    price: 9,
    description: "For individual developers building with persistent memory.",
    features: [
      "10,000 atoms",
      "1,000 bootstraps/month",
      "500 MB storage",
      "MCP native",
      "Merkle proofs",
      "Markov prediction",
      "Email support",
    ],
    limits: { maxAtoms: 10_000, maxBootstrapsPerMonth: 1_000, maxStorageMB: 500 },
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    description: "For power users with large knowledge bases.",
    features: [
      "100,000 atoms",
      "10,000 bootstraps/month",
      "2 GB storage",
      "MCP native",
      "Merkle proofs",
      "Markov prediction",
      "Knowledge graph edges",
      "Priority support",
    ],
    limits: { maxAtoms: 100_000, maxBootstrapsPerMonth: 10_000, maxStorageMB: 2048 },
  },
  {
    id: "team",
    name: "Team",
    price: 79,
    description: "For teams that need shared memory across agents.",
    features: [
      "500,000 atoms",
      "Unlimited bootstraps",
      "10 GB storage",
      "MCP native",
      "Merkle proofs",
      "Markov prediction",
      "Knowledge graph edges",
      "Custom domain",
      "Dedicated support",
    ],
    limits: { maxAtoms: 500_000, maxBootstrapsPerMonth: -1, maxStorageMB: 10_240 },
  },
];

export const SUBSTRATE_TIERS_BY_ID = Object.fromEntries(
  SUBSTRATE_TIERS.map((t) => [t.id, t]),
) as Record<string, SubstrateTierInfo>;
