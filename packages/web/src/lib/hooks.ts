"use client";

import { useReadContract, useWriteContract, useAccount } from "wagmi";

import { getContracts, CHAIN } from "@/config/contracts";
import {
  LOBTokenABI,
  StakingManagerABI,
  ReputationSystemABI,
  ServiceRegistryABI,
  EscrowEngineABI,
  DisputeArbitrationABI,
  TreasuryGovernorABI,
  SybilGuardABI,
} from "@/config/abis";

function useContracts() {
  return getContracts(CHAIN.id);
}

// --- LOB Token ---

export function useLOBBalance(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.lobToken,
    abi: LOBTokenABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useLOBAllowance(owner?: `0x${string}`, spender?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.lobToken,
    abi: LOBTokenABI,
    functionName: "allowance",
    args: owner && spender ? [owner, spender] : undefined,
    query: { enabled: !!owner && !!spender && !!contracts },
  });
}

// --- Staking ---

export function useStakeInfo(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.stakingManager,
    abi: StakingManagerABI,
    functionName: "getStakeInfo",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useStakeTier(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.stakingManager,
    abi: StakingManagerABI,
    functionName: "getTier",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

// --- Reputation ---

export function useReputationScore(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.reputationSystem,
    abi: ReputationSystemABI,
    functionName: "getScore",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

// --- Service Registry ---

export function useListing(listingId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.serviceRegistry,
    abi: ServiceRegistryABI,
    functionName: "getListing",
    args: listingId !== undefined ? [listingId] : undefined,
    query: { enabled: listingId !== undefined && !!contracts },
  });
}

export function useProviderListingCount(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.serviceRegistry,
    abi: ServiceRegistryABI,
    functionName: "getProviderListingCount",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

// --- Escrow ---

export function useJob(jobId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.escrowEngine,
    abi: EscrowEngineABI,
    functionName: "getJob",
    args: jobId !== undefined ? [jobId] : undefined,
    query: { enabled: jobId !== undefined && !!contracts },
  });
}

// --- Dispute ---

export function useDispute(disputeId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.disputeArbitration,
    abi: DisputeArbitrationABI,
    functionName: "getDispute",
    args: disputeId !== undefined ? [disputeId] : undefined,
    query: { enabled: disputeId !== undefined && !!contracts },
  });
}

export function useArbitratorInfo(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.disputeArbitration,
    abi: DisputeArbitrationABI,
    functionName: "getArbitratorInfo",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

// --- Write hooks ---

export function useApproveAndStake() {
  const { writeContract } = useWriteContract();
  const contracts = useContracts();

  const approve = (amount: bigint) => {
    if (!contracts) return;
    writeContract({
      address: contracts.lobToken,
      abi: LOBTokenABI,
      functionName: "approve",
      args: [contracts.stakingManager, amount],
    });
  };

  const stake = (amount: bigint) => {
    if (!contracts) return;
    writeContract({
      address: contracts.stakingManager,
      abi: StakingManagerABI,
      functionName: "stake",
      args: [amount],
    });
  };

  return { approve, stake };
}

export function useCreateJob() {
  const { writeContract } = useWriteContract();
  const contracts = useContracts();

  return (listingId: bigint, seller: `0x${string}`, amount: bigint, token: `0x${string}`) => {
    if (!contracts) return;
    writeContract({
      address: contracts.escrowEngine,
      abi: EscrowEngineABI,
      functionName: "createJob",
      args: [listingId, seller, amount, token],
    });
  };
}

export function useConfirmDelivery() {
  const { writeContract } = useWriteContract();
  const contracts = useContracts();

  return (jobId: bigint) => {
    if (!contracts) return;
    writeContract({
      address: contracts.escrowEngine,
      abi: EscrowEngineABI,
      functionName: "confirmDelivery",
      args: [jobId],
    });
  };
}

// --- TreasuryGovernor: Proposals ---

export function useTreasuryProposal(proposalId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.treasuryGovernor,
    abi: TreasuryGovernorABI,
    functionName: "getProposal",
    args: proposalId !== undefined ? [proposalId] : undefined,
    query: { enabled: proposalId !== undefined && !!contracts },
  });
}

export function useTreasuryBalance(token?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.treasuryGovernor,
    abi: TreasuryGovernorABI,
    functionName: "getBalance",
    args: token ? [token] : undefined,
    query: { enabled: !!token && !!contracts },
  });
}

export function useTreasurySignerCount() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.treasuryGovernor,
    abi: TreasuryGovernorABI,
    functionName: "signerCount",
    query: { enabled: !!contracts },
  });
}

export function useTreasuryRequiredApprovals() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.treasuryGovernor,
    abi: TreasuryGovernorABI,
    functionName: "requiredApprovals",
    query: { enabled: !!contracts },
  });
}

// --- TreasuryGovernor: Streams ---

export function useTreasuryStream(streamId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.treasuryGovernor,
    abi: TreasuryGovernorABI,
    functionName: "getStream",
    args: streamId !== undefined ? [streamId] : undefined,
    query: { enabled: streamId !== undefined && !!contracts },
  });
}

export function useStreamClaimable(streamId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.treasuryGovernor,
    abi: TreasuryGovernorABI,
    functionName: "streamClaimable",
    args: streamId !== undefined ? [streamId] : undefined,
    query: { enabled: streamId !== undefined && !!contracts },
  });
}

// --- TreasuryGovernor: Bounties ---

export function useTreasuryBounty(bountyId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.treasuryGovernor,
    abi: TreasuryGovernorABI,
    functionName: "getBounty",
    args: bountyId !== undefined ? [bountyId] : undefined,
    query: { enabled: bountyId !== undefined && !!contracts },
  });
}

export function useNextBountyId() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.treasuryGovernor,
    abi: TreasuryGovernorABI,
    functionName: "nextBountyId",
    query: { enabled: !!contracts },
  });
}

// --- TreasuryGovernor: Delegation ---

export function useDelegatee(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.treasuryGovernor,
    abi: TreasuryGovernorABI,
    functionName: "getDelegatee",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useDelegatorCount(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.treasuryGovernor,
    abi: TreasuryGovernorABI,
    functionName: "delegatorCount",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

// --- TreasuryGovernor: Write hooks ---

export function useCreateBounty() {
  const { writeContract } = useWriteContract();
  const contracts = useContracts();

  return (title: string, description: string, reward: bigint, token: `0x${string}`, category: string, difficulty: number, deadline: bigint) => {
    if (!contracts) return;
    writeContract({
      address: contracts.treasuryGovernor,
      abi: TreasuryGovernorABI,
      functionName: "createBounty",
      args: [title, description, reward, token, category, difficulty, deadline],
    });
  };
}

export function useClaimBounty() {
  const { writeContract } = useWriteContract();
  const contracts = useContracts();

  return (bountyId: bigint) => {
    if (!contracts) return;
    writeContract({
      address: contracts.treasuryGovernor,
      abi: TreasuryGovernorABI,
      functionName: "claimBounty",
      args: [bountyId],
    });
  };
}

export function useCompleteBounty() {
  const { writeContract } = useWriteContract();
  const contracts = useContracts();

  return (bountyId: bigint) => {
    if (!contracts) return;
    writeContract({
      address: contracts.treasuryGovernor,
      abi: TreasuryGovernorABI,
      functionName: "completeBounty",
      args: [bountyId],
    });
  };
}

export function useDelegate() {
  const { writeContract } = useWriteContract();
  const contracts = useContracts();

  return (to: `0x${string}`) => {
    if (!contracts) return;
    writeContract({
      address: contracts.treasuryGovernor,
      abi: TreasuryGovernorABI,
      functionName: "delegate",
      args: [to],
    });
  };
}

export function useUndelegate() {
  const { writeContract } = useWriteContract();
  const contracts = useContracts();

  return () => {
    if (!contracts) return;
    writeContract({
      address: contracts.treasuryGovernor,
      abi: TreasuryGovernorABI,
      functionName: "undelegate",
    });
  };
}

// --- SybilGuard ---

export function useSybilBanCheck(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "checkBanned",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useSybilBanRecord(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "getBanRecord",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useSybilReport(reportId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "getReport",
    args: reportId !== undefined ? [reportId] : undefined,
    query: { enabled: reportId !== undefined && !!contracts },
  });
}

export function useSybilTotalBans() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "totalBans",
    query: { enabled: !!contracts },
  });
}

export function useSybilTotalReports() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "totalReports",
    query: { enabled: !!contracts },
  });
}

// --- Dispute: Additional hooks ---

export function useActiveArbitratorCount() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.disputeArbitration,
    abi: DisputeArbitrationABI,
    functionName: "getActiveArbitratorCount",
    query: { enabled: !!contracts },
  });
}

export function useStakeAsArbitrator() {
  const { writeContract } = useWriteContract();
  const contracts = useContracts();

  return (amount: bigint) => {
    if (!contracts) return;
    writeContract({
      address: contracts.disputeArbitration,
      abi: DisputeArbitrationABI,
      functionName: "stakeAsArbitrator",
      args: [amount],
    });
  };
}

export function useVoteOnDispute() {
  const { writeContract } = useWriteContract();
  const contracts = useContracts();

  return (disputeId: bigint, favorBuyer: boolean) => {
    if (!contracts) return;
    writeContract({
      address: contracts.disputeArbitration,
      abi: DisputeArbitrationABI,
      functionName: "vote",
      args: [disputeId, favorBuyer],
    });
  };
}
