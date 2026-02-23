"use client";

/**
 * useSkills.ts — SkillRegistry + PipelineRouter hooks for the /skills marketplace page.
 *
 * Re-exports typed hooks from @/lib/hooks and adds higher-level helpers for
 * scanning SkillListed events, resolving skill data in bulk, and handling
 * the LOB approval -> purchase flow.
 */

import { useState, useEffect, useCallback } from "react";
import { usePublicClient, useAccount } from "wagmi";
import { formatEther, type Address, parseEther } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";
import { SkillRegistryABI, LOBTokenABI } from "@/config/abis";

// Re-export individual hooks from hooks.ts so the skills page can import from one place
export {
  useSkill,
  useSkillAccess,
  useMarketplaceTier,
  useBuyerCredits,
  useSkillDependencies,
  useSellerListingCount,
  useHasActiveAccess,
  useListSkill,
  useUpdateSkill,
  useDeactivateSkill,
  usePurchaseSkill,
  useRenewSubscription,
  useDepositCallCredits,
  useWithdrawCallCredits,
  useClaimSkillEarnings,
  usePipeline,
  usePipelineSteps,
  useCreatePipeline,
  useExecutePipeline,
  useUpdatePipeline,
  useDeactivatePipeline,
  useApproveToken,
  useLOBAllowance,
} from "@/lib/hooks";

// ── Enums ────────────────────────────────────────────────────────────

export enum AssetType {
  SKILL = 0,
  AGENT_TEMPLATE = 1,
  PIPELINE = 2,
}

export enum PricingModel {
  ONE_TIME = 0,
  PER_CALL = 1,
  SUBSCRIPTION = 2,
}

export enum DeliveryMethod {
  HOSTED_API = 0,
  CODE_PACKAGE = 1,
  BOTH = 2,
}

export enum MarketplaceTier {
  None = 0,
  Bronze = 1,
  Silver = 2,
  Gold = 3,
  Platinum = 4,
}

export const TIER_LABELS: Record<number, string> = {
  0: "None",
  1: "Bronze",
  2: "Silver",
  3: "Gold",
  4: "Platinum",
};

export const ASSET_TYPE_LABELS: Record<number, string> = {
  0: "Skill",
  1: "Agent Template",
  2: "Pipeline",
};

export const PRICING_MODEL_LABELS: Record<number, string> = {
  0: "One-Time",
  1: "Per-Call",
  2: "Subscription",
};

export const DELIVERY_METHOD_LABELS: Record<number, string> = {
  0: "Hosted API",
  1: "Code Package",
  2: "Both",
};

/** Max listings per tier: None=0, Bronze=5, Silver=10, Gold=30, Platinum=100 */
export const TIER_MAX_LISTINGS: Record<number, number> = {
  0: 0,
  1: 5,
  2: 10,
  3: 30,
  4: 100,
};

/** Minimum tier required per asset type */
export const ASSET_TYPE_MIN_TIER: Record<number, number> = {
  0: 1, // SKILL -> Bronze+
  1: 2, // AGENT_TEMPLATE -> Silver+
  2: 3, // PIPELINE -> Gold+
};

// ── On-chain skill listing shape ─────────────────────────────────────

export interface SkillListing {
  id: bigint;
  seller: Address;
  assetType: number;
  deliveryMethod: number;
  pricingModel: number;
  title: string;
  description: string;
  metadataURI: string;
  version: bigint;
  price: bigint;
  settlementToken: Address;
  apiEndpointHash: `0x${string}`;
  packageHash: `0x${string}`;
  active: boolean;
  totalPurchases: bigint;
  totalCalls: bigint;
  createdAt: bigint;
  updatedAt: bigint;
}

// ── Scan SkillListed events and batch-fetch active listings ──────────

export function useSkillListings() {
  const publicClient = usePublicClient();
  const contracts = getContracts(CHAIN.id);
  const [skills, setSkills] = useState<SkillListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const refetch = useCallback(async () => {
    if (!publicClient || !contracts?.skillRegistry) {
      setSkills([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setIsError(false);

      // Scan all SkillListed events to discover skill IDs
      const logs = await publicClient.getContractEvents({
        address: contracts.skillRegistry,
        abi: SkillRegistryABI,
        eventName: "SkillListed",
        fromBlock: 0n,
        toBlock: "latest",
      });

      const skillIds = new Set<bigint>();
      for (const log of logs) {
        const args = log.args as { skillId?: bigint };
        if (args.skillId !== undefined) skillIds.add(args.skillId);
      }

      if (skillIds.size === 0) {
        setSkills([]);
        setIsLoading(false);
        return;
      }

      // Batch fetch all skill data via multicall
      const ids = Array.from(skillIds);
      const results = await publicClient.multicall({
        contracts: ids.map((id) => ({
          address: contracts.skillRegistry,
          abi: SkillRegistryABI,
          functionName: "getSkill",
          args: [id],
        })),
      });

      const listings: SkillListing[] = [];
      for (const result of results) {
        if (result.status === "success" && result.result) {
          const skill = result.result as unknown as SkillListing;
          if (skill.active) {
            listings.push(skill);
          }
        }
      }

      // Sort by newest first
      listings.sort((a, b) => Number(b.createdAt - a.createdAt));
      setSkills(listings);
    } catch (err) {
      console.error("Failed to fetch skill listings:", err);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, contracts]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { skills, isLoading, isError, refetch };
}

// ── Check LOB allowance for skill registry ───────────────────────────

export function useSkillRegistryAllowance() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const contracts = getContracts(CHAIN.id);
  const [allowance, setAllowance] = useState<bigint>(0n);

  useEffect(() => {
    if (!publicClient || !contracts?.lobToken || !contracts?.skillRegistry || !address) {
      setAllowance(0n);
      return;
    }

    publicClient
      .readContract({
        address: contracts.lobToken,
        abi: LOBTokenABI,
        functionName: "allowance",
        args: [address, contracts.skillRegistry],
      })
      .then((val) => setAllowance(val as bigint))
      .catch(() => setAllowance(0n));
  }, [publicClient, contracts, address]);

  return allowance;
}

// ── Formatted price helper ───────────────────────────────────────────

export function formatSkillPrice(price: bigint, token: Address, lobToken: Address | undefined): string {
  const isLob = lobToken && token.toLowerCase() === lobToken.toLowerCase();
  const formatted = parseFloat(formatEther(price));
  if (formatted === 0) return "Free";
  return `${formatted.toLocaleString()} ${isLob ? "LOB" : "USDC"}`;
}

export function shortenAddress(addr: string): string {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}
