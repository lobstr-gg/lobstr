"use client";

import { useState, useEffect } from "react";
import { usePublicClient } from "wagmi";
import { formatEther, type Address } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";
import { EscrowEngineABI } from "@/config/abis";
import type { MockJob, JobStatus, JobRole } from "@/app/jobs/_data/mockJobs";

// On-chain JobStatus enum: 0=Active, 1=Delivered, 2=Completed, 3=Disputed, 4=Refunded
const STATUS_MAP: Record<number, JobStatus> = {
  0: "active",
  1: "delivered",
  2: "completed",
  3: "disputed",
};

interface OnChainJob {
  id: bigint;
  listingId: bigint;
  buyer: Address;
  seller: Address;
  amount: bigint;
  token: Address;
  fee: bigint;
  status: number;
  createdAt: bigint;
  disputeWindowEnd: bigint;
  deliveryMetadataURI: string;
}

function mapToMockJob(
  job: OnChainJob,
  userAddress: string,
  lobToken: Address
): MockJob {
  const isBuyer = job.buyer.toLowerCase() === userAddress.toLowerCase();
  const role: JobRole = isBuyer ? "buyer" : "seller";
  const counterpartyAddr = isBuyer ? job.seller : job.buyer;
  const statusNum = Number(job.status);
  const status = STATUS_MAP[statusNum] ?? "active";
  const amount = Number(formatEther(job.amount));
  const isLob = job.token.toLowerCase() === lobToken.toLowerCase();

  return {
    id: job.id.toString(),
    title: `Job #${job.id}`,
    description: `Listing #${job.listingId}`,
    category: "Service",
    budget: amount,
    settlementToken: isLob ? "LOB" : "USDC",
    status,
    role,
    counterparty: {
      address: counterpartyAddr,
      name: counterpartyAddr.slice(0, 6) + "..." + counterpartyAddr.slice(-4),
      providerType: "agent",
      reputationTier: "Bronze",
      completions: 0,
    },
    postedAt: Number(job.createdAt) * 1000,
    deadline: Number(job.disputeWindowEnd) * 1000,
    tags: [`listing-${job.listingId}`],
    escrowId: `ESC-${job.id}`,
    milestonesPaid: statusNum >= 2 ? 1 : 0,
    milestonesTotal: 1,
    ...(statusNum === 1 ? { deliveredAt: Date.now() } : {}),
    ...(statusNum === 2 ? { completedAt: Date.now() } : {}),
    ...(statusNum === 3 ? { disputeReason: "Under arbitration" } : {}),
  };
}

export function useWalletJobs(address?: string) {
  const publicClient = usePublicClient();
  const contracts = getContracts(CHAIN.id);
  const [jobs, setJobs] = useState<MockJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!publicClient || !contracts || !address) {
      setJobs([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchJobs() {
      try {
        // Get JobCreated events where user is buyer
        const buyerLogs = await publicClient!.getContractEvents({
          address: contracts!.escrowEngine,
          abi: EscrowEngineABI,
          eventName: "JobCreated",
          args: { buyer: address as Address },
          fromBlock: 0n,
          toBlock: "latest",
        });

        // Get JobCreated events where user is seller
        // Note: seller is not indexed, so we fetch all and filter
        const allLogs = await publicClient!.getContractEvents({
          address: contracts!.escrowEngine,
          abi: EscrowEngineABI,
          eventName: "JobCreated",
          fromBlock: 0n,
          toBlock: "latest",
        });

        if (cancelled) return;

        // Combine unique job IDs
        const jobIdSet = new Set<bigint>();
        for (const log of buyerLogs) {
          const args = log.args as { jobId?: bigint };
          if (args.jobId !== undefined) jobIdSet.add(args.jobId);
        }
        for (const log of allLogs) {
          const args = log.args as { jobId?: bigint; seller?: Address };
          if (
            args.jobId !== undefined &&
            args.seller?.toLowerCase() === address!.toLowerCase()
          ) {
            jobIdSet.add(args.jobId);
          }
        }

        const jobIds = Array.from(jobIdSet);

        if (jobIds.length === 0) {
          setJobs([]);
          setIsLoading(false);
          return;
        }

        // Multicall to fetch all job details
        const results = await publicClient!.multicall({
          contracts: jobIds.map((id) => ({
            address: contracts!.escrowEngine,
            abi: EscrowEngineABI,
            functionName: "getJob",
            args: [id],
          })),
        });

        if (cancelled) return;

        const mapped: MockJob[] = [];
        for (const result of results) {
          if (result.status === "success" && result.result) {
            const job = result.result as unknown as OnChainJob;
            mapped.push(mapToMockJob(job, address!, contracts!.lobToken));
          }
        }

        // Sort by creation time (newest first)
        mapped.sort((a, b) => b.postedAt - a.postedAt);

        setJobs(mapped);
        setIsError(false);
      } catch (err) {
        console.error("Failed to fetch wallet jobs:", err);
        if (!cancelled) {
          setIsError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchJobs();

    return () => {
      cancelled = true;
    };
  }, [publicClient, contracts, address]);

  return { jobs, isLoading, isError };
}
