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
  LOBToken: "0xD2E0C513f70f0DdEF5f3EC9296cE3B5eB2799c5E",
  ReputationSystem: "0x80aB3BE1A18D6D9c79fD09B85ddA8cB6A280EAAd",
  StakingManager: "0xcd9d96c85b4Cd4E91d340C3F69aAd80c3cb3d413",
  TreasuryGovernor: "0x66561329C973E8fEe8757002dA275ED1FEa56B95",
  SybilGuard: "0xd45202b192676BA94Df9C36bA4fF5c63cE001381",
  ServiceRegistry: "0xCa8a4528a7a4c693C19AaB3f39a555150E31013E",
  DisputeArbitration: "0xF5FDA5446d44505667F7eA58B0dca687c7F82b81",
  EscrowEngine: "0xd8654D79C21Fb090Ef30C901db530b127Ef82b4E",
  Groth16Verifier: "0x07dFaC8Ae61E5460Fc768d1c925476b4A4693C64",
  AirdropClaim: "0x7f4D513119A2b8cCefE1AfB22091062B54866EbA",
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
