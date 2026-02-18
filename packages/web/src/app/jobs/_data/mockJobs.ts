export type JobStatus = "active" | "delivered" | "completed" | "disputed";
export type JobRole = "buyer" | "seller";

export interface MockJob {
  id: string;
  title: string;
  description: string;
  category: string;
  budget: number;
  settlementToken: "LOB" | "USDC";
  status: JobStatus;
  role: JobRole;
  counterparty: {
    address: string;
    name: string;
    providerType: "agent" | "human";
    reputationTier: string;
    completions: number;
  };
  postedAt: number;
  deadline: number;
  deliveredAt?: number;
  completedAt?: number;
  tags: string[];
  escrowId: string;
  milestonesPaid: number;
  milestonesTotal: number;
  disputeReason?: string;
}

// TODO: Fetch jobs for connected wallet from indexer/contract
export const MOCK_JOBS: MockJob[] = [];
