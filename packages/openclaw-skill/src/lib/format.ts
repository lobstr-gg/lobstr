import { formatUnits } from 'viem';

export const TIER_NAMES: Record<number, string> = {
  0: 'None',
  1: 'Bronze',
  2: 'Silver',
  3: 'Gold',
  4: 'Platinum',
};

export const REPUTATION_TIERS: Record<number, string> = {
  0: 'Bronze',
  1: 'Silver',
  2: 'Gold',
  3: 'Platinum',
};

export const AIRDROP_TIERS: Record<number, string> = {
  0: 'New',
  1: 'Active',
  2: 'PowerUser',
};

export const JOB_STATUS: Record<number, string> = {
  0: 'Created',
  1: 'Active',
  2: 'Delivered',
  3: 'Confirmed',
  4: 'Disputed',
  5: 'Released',
  6: 'Resolved',
};

export const CATEGORIES: Record<string, number> = {
  DATA_SCRAPING: 0,
  TRANSLATION: 1,
  WRITING: 2,
  CODING: 3,
  RESEARCH: 4,
  DESIGN: 5,
  MARKETING: 6,
  LEGAL: 7,
  FINANCE: 8,
  PHYSICAL_TASK: 9,
  OTHER: 10,
};

export const CATEGORY_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(CATEGORIES).map(([k, v]) => [v, k])
);

export function formatLob(amount: bigint): string {
  return formatUnits(amount, 18) + ' LOB';
}

export function formatEth(amount: bigint): string {
  return formatUnits(amount, 18) + ' ETH';
}

export function categoryToIndex(name: string): number {
  const upper = name.toUpperCase();
  if (!(upper in CATEGORIES)) {
    throw new Error(`Unknown category: ${name}. Available: ${Object.keys(CATEGORIES).join(', ')}`);
  }
  return CATEGORIES[upper];
}

// DisputeArbitration enums
export const DISPUTE_STATUS: Record<number, string> = {
  0: 'Open',
  1: 'EvidencePhase',
  2: 'Voting',
  3: 'Resolved',
};

export const RULING: Record<number, string> = {
  0: 'Pending',
  1: 'BuyerWins',
  2: 'SellerWins',
};

export const ARBITRATOR_RANK: Record<number, string> = {
  0: 'None',
  1: 'Junior',
  2: 'Senior',
  3: 'Principal',
};

// TreasuryGovernor enums
export const PROPOSAL_STATUS: Record<number, string> = {
  0: 'Pending',
  1: 'Approved',
  2: 'Executed',
  3: 'Cancelled',
  4: 'Expired',
};

// SybilGuard enums
export const VIOLATION_TYPE: Record<number, string> = {
  0: 'SybilCluster',
  1: 'SelfDealing',
  2: 'CoordinatedVoting',
  3: 'ReputationFarming',
  4: 'MultisigAbuse',
  5: 'StakeManipulation',
  6: 'EvidenceFraud',
  7: 'IdentityFraud',
};

export const REPORT_STATUS: Record<number, string> = {
  0: 'Pending',
  1: 'Confirmed',
  2: 'Rejected',
  3: 'Expired',
};
