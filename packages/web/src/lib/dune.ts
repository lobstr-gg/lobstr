/**
 * Dune Analytics API client for LOBSTR Protocol monitoring.
 *
 * Usage:
 *   const dune = new DuneClient(process.env.DUNE_API_KEY!);
 *   const results = await dune.executeQuery(LOBSTR_QUERIES.PROTOCOL_KPI);
 *   const cached = await dune.getLatestResults(LOBSTR_QUERIES.STAKING_TVL);
 */

const DUNE_API_BASE = "https://api.dune.com/api/v1";

// ---------------------------------------------------------------------------
// Saved-query IDs — fill these in after creating each query on Dune
// ---------------------------------------------------------------------------
export const LOBSTR_QUERIES = {
  /** Protocol-wide KPIs (master dashboard) */
  PROTOCOL_KPI: 0,
  /** Cumulative staked $LOB (TVL line chart) */
  STAKING_TVL: 0,
  /** Staker tier breakdown (pie chart) */
  STAKERS_BY_TIER: 0,
  /** Daily job creation + escrow value */
  DAILY_JOBS: 0,
  /** Job lifecycle funnel */
  JOB_FUNNEL: 0,
  /** Payment token split ($LOB vs USDC/ETH) */
  PAYMENT_SPLIT: 0,
  /** Dispute activity (weekly) */
  DISPUTE_ACTIVITY: 0,
  /** Ruling outcomes distribution */
  RULING_OUTCOMES: 0,
  /** Top arbitrators by votes */
  ARBITRATOR_LEADERBOARD: 0,
  /** Provider reputation leaderboard */
  PROVIDER_LEADERBOARD: 0,
  /** Service category popularity */
  CATEGORY_POPULARITY: 0,
  /** Treasury inflows */
  TREASURY_INFLOWS: 0,
  /** Governance proposal activity */
  GOVERNANCE_PROPOSALS: 0,
  /** Airdrop claims by tier */
  AIRDROP_CLAIMS: 0,
  /** Sybil reports & bans */
  SYBIL_ACTIVITY: 0,
} as const;

// ---------------------------------------------------------------------------
// Contract addresses (Base mainnet)
// ---------------------------------------------------------------------------
export const LOBSTR_CONTRACTS = {
  LOBToken: "0x7FaeC2536E2Afee56AcA568C475927F1E2521B37",
  ReputationSystem: "0xc1374611FB7c6637e30a274073e7dCFf758C76FC",
  StakingManager: "0x0c5bC27a3C3Eb7a836302320755f6B1645C49291",
  TreasuryGovernor: "0x9576dcf9909ec192FC136A12De293Efab911517f",
  SybilGuard: "0xF43E6698cAAf3BFf422137F20541Cd24dfB3ff07",
  ServiceRegistry: "0xa127B684935f1D24C7236ba1FbB3FF140F4eD3C3",
  DisputeArbitration: "0x00Ad7d299F4BF3aE8372f756b86B4dAf63eC3FAa",
  EscrowEngine: "0xBB57d0D0aB24122A87c9a28acdc242927e6189E0",
  Groth16Verifier: "0xfc0563332c3d0969a706E1d55f3d576F1a4c0F04",
  AirdropClaimV2: "0x349790d7f56110765Fccd86790B584c423c0BaA9",
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface DuneQueryResult<T = Record<string, unknown>> {
  execution_id: string;
  query_id: number;
  state: "QUERY_STATE_COMPLETED" | "QUERY_STATE_EXECUTING" | "QUERY_STATE_PENDING" | "QUERY_STATE_FAILED";
  result?: {
    rows: T[];
    metadata: {
      column_names: string[];
      column_types: string[];
      total_row_count: number;
    };
  };
}

export interface DuneExecutionStatus {
  execution_id: string;
  query_id: number;
  state: string;
  submitted_at: string;
  expires_at: string;
  execution_started_at?: string;
  execution_ended_at?: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
export class DuneClient {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("DUNE_API_KEY is required");
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${DUNE_API_BASE}${path}`, {
      ...options,
      headers: {
        "X-Dune-API-Key": this.apiKey,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Dune API ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Execute a saved query and wait for results.
   * Polls until completion (max ~5 min).
   */
  async executeQuery<T = Record<string, unknown>>(
    queryId: number,
    params?: Record<string, string | number>,
  ): Promise<DuneQueryResult<T>> {
    // Trigger execution
    const exec = await this.request<{ execution_id: string }>(
      `/query/${queryId}/execute`,
      {
        method: "POST",
        body: JSON.stringify({
          query_parameters: params ?? {},
        }),
      },
    );

    // Poll for completion
    const maxAttempts = 30;
    const pollInterval = 10_000; // 10s

    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.request<DuneExecutionStatus>(
        `/execution/${exec.execution_id}/status`,
      );

      if (status.state === "QUERY_STATE_COMPLETED") {
        return this.request<DuneQueryResult<T>>(
          `/execution/${exec.execution_id}/results`,
        );
      }

      if (status.state === "QUERY_STATE_FAILED") {
        throw new Error(`Dune query ${queryId} failed`);
      }

      await new Promise((r) => setTimeout(r, pollInterval));
    }

    throw new Error(`Dune query ${queryId} timed out after ${maxAttempts * pollInterval / 1000}s`);
  }

  /**
   * Get the latest cached results for a query (no new execution).
   * Much faster and doesn't cost execution credits.
   */
  async getLatestResults<T = Record<string, unknown>>(
    queryId: number,
  ): Promise<DuneQueryResult<T>> {
    return this.request<DuneQueryResult<T>>(`/query/${queryId}/results`);
  }

  /**
   * Cancel a running execution.
   */
  async cancelExecution(executionId: string): Promise<void> {
    await this.request(`/execution/${executionId}/cancel`, {
      method: "POST",
    });
  }
}

// ---------------------------------------------------------------------------
// Alert helpers — use in agent cron jobs
// ---------------------------------------------------------------------------

export interface ProtocolKPIs {
  total_jobs_created: number;
  total_jobs_completed: number;
  total_disputes: number;
  unique_stakers: number;
  active_providers: number;
  total_listings: number;
  total_bans: number;
  total_airdrop_claims: number;
}

export interface StakingAlert {
  type: "large_unstake" | "large_stake" | "slash_event" | "tier_change";
  address: string;
  amount: number;
  details: string;
}

export interface DisputeAlert {
  type: "new_dispute" | "ruling_executed" | "low_arbitrator_turnout";
  disputeId: number;
  details: string;
}

export interface SybilAlert {
  type: "new_report" | "address_banned" | "funds_seized";
  reportId: number;
  details: string;
}

/**
 * Fetch protocol KPIs from cached Dune results.
 * Intended for agent heartbeat / status checks.
 */
export async function getProtocolKPIs(dune: DuneClient): Promise<ProtocolKPIs | null> {
  if (!LOBSTR_QUERIES.PROTOCOL_KPI) return null;
  const result = await dune.getLatestResults<ProtocolKPIs>(LOBSTR_QUERIES.PROTOCOL_KPI);
  return result.result?.rows[0] ?? null;
}

/**
 * Check for recent staking anomalies (large movements, slashes).
 * Feed into Sentinel agent alerts.
 */
export async function getStakingAlerts(dune: DuneClient): Promise<StakingAlert[]> {
  if (!LOBSTR_QUERIES.STAKING_TVL) return [];
  const result = await dune.getLatestResults<StakingAlert>(LOBSTR_QUERIES.STAKING_TVL);
  return result.result?.rows ?? [];
}

/**
 * Check for active disputes needing attention.
 * Feed into Arbiter agent monitoring.
 */
export async function getDisputeAlerts(dune: DuneClient): Promise<DisputeAlert[]> {
  if (!LOBSTR_QUERIES.DISPUTE_ACTIVITY) return [];
  const result = await dune.getLatestResults<DisputeAlert>(LOBSTR_QUERIES.DISPUTE_ACTIVITY);
  return result.result?.rows ?? [];
}

/**
 * Check for sybil activity.
 * Feed into Sentinel agent monitoring.
 */
export async function getSybilAlerts(dune: DuneClient): Promise<SybilAlert[]> {
  if (!LOBSTR_QUERIES.SYBIL_ACTIVITY) return [];
  const result = await dune.getLatestResults<SybilAlert>(LOBSTR_QUERIES.SYBIL_ACTIVITY);
  return result.result?.rows ?? [];
}
