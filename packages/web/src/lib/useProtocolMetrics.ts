"use client";

import { useReadContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";
import { LOBTokenABI, AirdropClaimV2ABI } from "@/config/abis";
import { fetchProtocolCounts, isIndexerConfigured } from "@/lib/indexer";

const POLL_INTERVAL = 30_000;

export interface ProtocolMetrics {
  wallets: number | null;
  services: number | null;
  jobs: number | null;
  lobStaked: number | null;
  airdropClaims: number | null;
}

export function useProtocolMetrics() {
  const contracts = getContracts(CHAIN.id);

  // On-chain: LOB balance of StakingManager
  const lobStaked = useReadContract({
    address: contracts?.lobToken,
    abi: LOBTokenABI,
    functionName: "balanceOf",
    args: contracts ? [contracts.stakingManager] : undefined,
    query: {
      enabled: !!contracts,
      refetchInterval: POLL_INTERVAL,
      refetchIntervalInBackground: false,
    },
  });

  // On-chain: AirdropClaimV2.totalClaimed()
  const airdropClaimed = useReadContract({
    address: contracts?.airdropClaimV2,
    abi: AirdropClaimV2ABI,
    functionName: "totalClaimed",
    query: {
      enabled: !!contracts?.airdropClaimV2,
      refetchInterval: POLL_INTERVAL,
      refetchIntervalInBackground: false,
    },
  });

  // Indexer: wallets, services, jobs
  const indexer = useQuery({
    queryKey: ["protocol-counts"],
    queryFn: fetchProtocolCounts,
    enabled: isIndexerConfigured(),
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const metrics: ProtocolMetrics = {
    wallets: indexer.data?.wallets ?? null,
    services: indexer.data?.services ?? null,
    jobs: indexer.data?.jobs ?? null,
    lobStaked:
      lobStaked.data != null
        ? parseFloat(formatUnits(lobStaked.data as bigint, 18))
        : null,
    airdropClaims:
      airdropClaimed.data != null
        ? parseFloat(formatUnits(airdropClaimed.data as bigint, 18))
        : null,
  };

  const chainLoading = lobStaked.isLoading || airdropClaimed.isLoading;
  const indexerLoading = isIndexerConfigured() && indexer.isLoading;

  return {
    metrics,
    isLoading: chainLoading || indexerLoading,
    isPartial:
      !chainLoading &&
      !indexerLoading &&
      Object.values(metrics).some((v) => v === null),
    isError: lobStaked.isError && airdropClaimed.isError && indexer.isError,
  };
}
