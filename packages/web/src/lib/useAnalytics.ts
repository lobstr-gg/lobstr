"use client";

import { useReadContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";
import {
  LOBTokenABI,
  AirdropClaimABI,
  SybilGuardABI,
  TreasuryGovernorABI,
} from "@/config/abis";
import { fetchProtocolCounts, isIndexerConfigured } from "@/lib/indexer";

const POLL_INTERVAL = 60_000;

export interface AnalyticsData {
  // Indexer
  wallets: number | null;
  services: number | null;
  jobs: number | null;
  // Staking
  lobStaked: number | null;
  // Airdrop
  airdropClaimed: number | null;
  airdropMaxPool: number | null;
  claimWindowEnd: number | null;
  // SybilGuard
  totalBans: number | null;
  totalReports: number | null;
  totalSeized: number | null;
  // Treasury
  treasuryLob: number | null;
  treasurySeizedLob: number | null;
  treasurySeizedUsdc: number | null;
  daoBounties: number | null;
}

export function useAnalytics() {
  const contracts = getContracts(CHAIN.id);

  const queryOpts = {
    enabled: !!contracts,
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 3,
    staleTime: POLL_INTERVAL,
  };

  // ── Staking ──
  const lobStaked = useReadContract({
    address: contracts?.lobToken,
    abi: LOBTokenABI,
    functionName: "balanceOf",
    args: contracts ? [contracts.stakingManager] : undefined,
    chainId: CHAIN.id,
    query: queryOpts,
  });

  // ── Airdrop ──
  const airdropClaimed = useReadContract({
    address: contracts?.airdropClaim,
    abi: AirdropClaimABI,
    functionName: "totalClaimed",
    chainId: CHAIN.id,
    query: { ...queryOpts, enabled: !!contracts?.airdropClaim },
  });

  const maxPool = useReadContract({
    address: contracts?.airdropClaim,
    abi: AirdropClaimABI,
    functionName: "maxAirdropPool",
    chainId: CHAIN.id,
    query: { ...queryOpts, enabled: !!contracts?.airdropClaim },
  });

  const windowEnd = useReadContract({
    address: contracts?.airdropClaim,
    abi: AirdropClaimABI,
    functionName: "claimWindowEnd",
    chainId: CHAIN.id,
    query: { ...queryOpts, enabled: !!contracts?.airdropClaim },
  });

  // ── SybilGuard ──
  const totalBans = useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "totalBans",
    chainId: CHAIN.id,
    query: { ...queryOpts, enabled: !!contracts?.sybilGuard },
  });

  const totalReports = useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "totalReports",
    chainId: CHAIN.id,
    query: { ...queryOpts, enabled: !!contracts?.sybilGuard },
  });

  const totalSeized = useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "totalSeized",
    chainId: CHAIN.id,
    query: { ...queryOpts, enabled: !!contracts?.sybilGuard },
  });

  // ── Treasury ──
  const treasuryLob = useReadContract({
    address: contracts?.lobToken,
    abi: LOBTokenABI,
    functionName: "balanceOf",
    args: contracts ? [contracts.treasuryGovernor] : undefined,
    chainId: CHAIN.id,
    query: { ...queryOpts, enabled: !!contracts?.treasuryGovernor },
  });

  const treasurySeizedLob = useReadContract({
    address: contracts?.treasuryGovernor,
    abi: TreasuryGovernorABI,
    functionName: "totalSeizedLOB",
    chainId: CHAIN.id,
    query: { ...queryOpts, enabled: !!contracts?.treasuryGovernor },
  });

  const treasurySeizedUsdc = useReadContract({
    address: contracts?.treasuryGovernor,
    abi: TreasuryGovernorABI,
    functionName: "totalSeizedUSDC",
    chainId: CHAIN.id,
    query: { ...queryOpts, enabled: !!contracts?.treasuryGovernor },
  });

  const daoBounties = useReadContract({
    address: contracts?.treasuryGovernor,
    abi: TreasuryGovernorABI,
    functionName: "nextBountyId",
    chainId: CHAIN.id,
    query: { ...queryOpts, enabled: !!contracts?.treasuryGovernor },
  });

  // ── Indexer ──
  const indexer = useQuery({
    queryKey: ["protocol-counts"],
    queryFn: fetchProtocolCounts,
    enabled: isIndexerConfigured(),
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 3,
    staleTime: POLL_INTERVAL,
  });

  // ── Helpers ──
  const toBigIntNum = (v: unknown, decimals = 18): number | null =>
    v != null ? parseFloat(formatUnits(v as bigint, decimals)) : null;

  const toNum = (v: unknown): number | null =>
    v != null ? Number(v as bigint) : null;

  const data: AnalyticsData = {
    // Indexer
    wallets: indexer.data?.wallets ?? null,
    services: indexer.data?.services ?? null,
    jobs: indexer.data?.jobs ?? null,
    // Staking
    lobStaked: toBigIntNum(lobStaked.data),
    // Airdrop
    airdropClaimed: toBigIntNum(airdropClaimed.data),
    airdropMaxPool: toBigIntNum(maxPool.data),
    claimWindowEnd: toNum(windowEnd.data),
    // SybilGuard
    totalBans: toNum(totalBans.data),
    totalReports: toNum(totalReports.data),
    totalSeized: toBigIntNum(totalSeized.data),
    // Treasury
    treasuryLob: toBigIntNum(treasuryLob.data),
    treasurySeizedLob: toBigIntNum(treasurySeizedLob.data),
    treasurySeizedUsdc: toBigIntNum(treasurySeizedUsdc.data, 6),
    // nextBountyId starts at 1, so subtract 1 to get actual count
    daoBounties:
      daoBounties.data != null
        ? Math.max(0, Number(daoBounties.data as bigint) - 1)
        : null,
  };

  const chainLoading =
    lobStaked.isLoading ||
    airdropClaimed.isLoading ||
    maxPool.isLoading ||
    windowEnd.isLoading ||
    totalBans.isLoading ||
    totalReports.isLoading ||
    totalSeized.isLoading ||
    treasuryLob.isLoading ||
    treasurySeizedLob.isLoading ||
    treasurySeizedUsdc.isLoading ||
    daoBounties.isLoading;

  const indexerLoading = isIndexerConfigured() && indexer.isLoading;

  return {
    data,
    isLoading: chainLoading || indexerLoading,
    isPartial:
      !chainLoading &&
      !indexerLoading &&
      Object.values(data).some((v) => v === null),
  };
}
