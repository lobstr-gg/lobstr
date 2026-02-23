export type JobStatus = "active" | "delivered" | "completed" | "disputed";
export type JobRole = "buyer" | "seller";

export interface WalletJob {
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
  isX402?: boolean;
  /** EscrowType enum: 0 = SERVICE_JOB, 1 = SKILL_PURCHASE */
  escrowType?: number;
  /** Skill ID for SKILL_PURCHASE escrow type */
  skillId?: string;
}
