"use client";

import { useReadContract, useWriteContract, useAccount, useSignTypedData } from "wagmi";
import { type Address, keccak256, toHex, encodePacked } from "viem";

import { getContracts, CHAIN, USDC, FACILITATOR_URL } from "@/config/contracts";
import {
  LOBTokenABI,
  StakingManagerABI,
  ReputationSystemABI,
  ServiceRegistryABI,
  EscrowEngineABI,
  DisputeArbitrationABI,
  TreasuryGovernorABI,
  SybilGuardABI,
  X402EscrowBridgeABI,
  LoanEngineABI,
  ReviewRegistryABI,
  SkillRegistryABI,
  PipelineRouterABI,
  InsurancePoolABI,
  MultiPartyEscrowABI,
  SubscriptionEngineABI,
  StakingRewardsABI,
  LiquidityMiningABI,
  RewardDistributorABI,
  AffiliateManagerABI,
  TeamVestingABI,
  X402CreditFacilityABI,
  RewardSchedulerABI,
  BondingEngineABI,
  LightningGovernorABI,
  DirectiveBoardABI,
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

export function useReputationData(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.reputationSystem,
    abi: ReputationSystemABI,
    functionName: "getReputationData",
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

// --- Service Registry: nextListingId via event logs ---

export function useListingCount() {
  const contracts = useContracts();
  // No on-chain getter for total count; use getProviderListingCount for a specific provider
  // This hook is mainly used for existence checks
  return { contracts };
}

// --- Write hooks ---

export function useApproveToken() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (token: `0x${string}`, spender: `0x${string}`, amount: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: token,
      abi: LOBTokenABI,
      functionName: "approve",
      args: [spender, amount],
    });
  };
}

export function useCreateJobWithHash() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (listingId: bigint, seller: `0x${string}`, amount: bigint, token: `0x${string}`) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.escrowEngine,
      abi: EscrowEngineABI,
      functionName: "createJob",
      args: [listingId, seller, amount, token],
    });
  };
}

export function useSubmitDelivery() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (jobId: bigint, metadataURI: string) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.escrowEngine,
      abi: EscrowEngineABI,
      functionName: "submitDelivery",
      args: [jobId, metadataURI],
    });
  };
}

export function useInitiateDispute() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (jobId: bigint, evidenceURI: string) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.escrowEngine,
      abi: EscrowEngineABI,
      functionName: "initiateDispute",
      args: [jobId, evidenceURI],
    });
  };
}

export function useConfirmDeliveryWithHash() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (jobId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.escrowEngine,
      abi: EscrowEngineABI,
      functionName: "confirmDelivery",
      args: [jobId],
    });
  };
}

export function useApproveAndStake() {
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const contracts = useContracts();

  const approve = async (amount: bigint) => {
    if (!contracts) return;
    return writeContractAsync({
      address: contracts.lobToken,
      abi: LOBTokenABI,
      functionName: "approve",
      args: [contracts.stakingManager, amount],
    });
  };

  const stake = async (amount: bigint) => {
    if (!contracts) return;
    return writeContractAsync({
      address: contracts.stakingManager,
      abi: StakingManagerABI,
      functionName: "stake",
      args: [amount],
    });
  };

  return { approve, stake, isPending, isError, error, reset };
}

export function useRequestUnstake() {
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const contracts = useContracts();

  const requestUnstake = async (amount: bigint) => {
    if (!contracts) return;
    return writeContractAsync({
      address: contracts.stakingManager,
      abi: StakingManagerABI,
      functionName: "requestUnstake",
      args: [amount],
    });
  };

  return { requestUnstake, isPending, isError, error, reset };
}

export function useUnstake() {
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const contracts = useContracts();

  const unstake = async () => {
    if (!contracts) return;
    return writeContractAsync({
      address: contracts.stakingManager,
      abi: StakingManagerABI,
      functionName: "unstake",
      args: [],
    });
  };

  return { unstake, isPending, isError, error, reset };
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

// --- TreasuryGovernor: Admin Proposals ---

export function useAdminProposal(proposalId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.treasuryGovernor,
    abi: TreasuryGovernorABI,
    functionName: "getAdminProposal",
    args: proposalId !== undefined ? [proposalId] : undefined,
    query: { enabled: proposalId !== undefined && !!contracts },
  });
}

export function useAdminProposalApproval(proposalId?: bigint, signer?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.treasuryGovernor,
    abi: TreasuryGovernorABI,
    functionName: "adminProposalApprovals",
    args: proposalId !== undefined && signer ? [proposalId, signer] : undefined,
    query: { enabled: proposalId !== undefined && !!signer && !!contracts },
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
      args: [],
    });
  };
}

// --- TreasuryGovernor: Admin Proposal Write hooks ---

export function useApproveAdminProposal() {
  const { writeContract } = useWriteContract();
  const contracts = useContracts();

  return (proposalId: bigint) => {
    if (!contracts) return;
    writeContract({
      address: contracts.treasuryGovernor,
      abi: TreasuryGovernorABI,
      functionName: "approveAdminProposal",
      args: [proposalId],
    });
  };
}

export function useExecuteAdminProposal() {
  const { writeContract } = useWriteContract();
  const contracts = useContracts();

  return (proposalId: bigint) => {
    if (!contracts) return;
    writeContract({
      address: contracts.treasuryGovernor,
      abi: TreasuryGovernorABI,
      functionName: "executeAdminProposal",
      args: [proposalId],
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

export function useUnstakeAsArbitrator() {
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const contracts = useContracts();

  const unstakeAsArbitrator = async (amount: bigint) => {
    if (!contracts) return;
    return writeContractAsync({
      address: contracts.disputeArbitration,
      abi: DisputeArbitrationABI,
      functionName: "unstakeAsArbitrator",
      args: [amount],
    });
  };

  return { unstakeAsArbitrator, isPending, isError, error, reset };
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

export function useSubmitCounterEvidence() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (disputeId: bigint, evidenceURI: string) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.disputeArbitration,
      abi: DisputeArbitrationABI,
      functionName: "submitCounterEvidence",
      args: [disputeId, evidenceURI],
    });
  };
}

export function useExecuteRuling() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (disputeId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.disputeArbitration,
      abi: DisputeArbitrationABI,
      functionName: "executeRuling",
      args: [disputeId],
    });
  };
}

// --- Dispute: Appeal, Finalize, Pause hooks ---

export function useAppealRuling() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (disputeId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.disputeArbitration,
      abi: DisputeArbitrationABI,
      functionName: "appealRuling",
      args: [disputeId],
    });
  };
}

export function useFinalizeRuling() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (disputeId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.disputeArbitration,
      abi: DisputeArbitrationABI,
      functionName: "finalizeRuling",
      args: [disputeId],
    });
  };
}

export function usePauseAsArbitrator() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async () => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.disputeArbitration,
      abi: DisputeArbitrationABI,
      functionName: "pauseAsArbitrator",
    });
  };
}

export function useUnpauseAsArbitrator() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async () => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.disputeArbitration,
      abi: DisputeArbitrationABI,
      functionName: "unpauseAsArbitrator",
    });
  };
}

export function useIsArbitratorPaused(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.disputeArbitration,
    abi: DisputeArbitrationABI,
    functionName: "isArbitratorPaused",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

// --- X402 Escrow Bridge ---

export function useJobPayer(jobId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.x402EscrowBridge,
    abi: X402EscrowBridgeABI,
    functionName: "jobPayer",
    args: jobId !== undefined ? [jobId] : undefined,
    query: { enabled: jobId !== undefined && !!contracts },
  });
}

export function useJobRefundCredit(jobId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.x402EscrowBridge,
    abi: X402EscrowBridgeABI,
    functionName: "jobRefundCredit",
    args: jobId !== undefined ? [jobId] : undefined,
    query: { enabled: jobId !== undefined && !!contracts },
  });
}

export function useRefundClaimed(jobId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.x402EscrowBridge,
    abi: X402EscrowBridgeABI,
    functionName: "refundClaimed",
    args: jobId !== undefined ? [jobId] : undefined,
    query: { enabled: jobId !== undefined && !!contracts },
  });
}

export function useBridgeConfirmDelivery() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (jobId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.x402EscrowBridge,
      abi: X402EscrowBridgeABI,
      functionName: "confirmDelivery",
      args: [jobId],
    });
  };
}

export function useBridgeInitiateDispute() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (jobId: bigint, evidenceURI: string) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.x402EscrowBridge,
      abi: X402EscrowBridgeABI,
      functionName: "initiateDispute",
      args: [jobId, evidenceURI],
    });
  };
}

export function useClaimEscrowRefund() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (jobId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.x402EscrowBridge,
      abi: X402EscrowBridgeABI,
      functionName: "claimEscrowRefund",
      args: [jobId],
    });
  };
}

// --- USDC ---

export function useUSDCBalance(address?: `0x${string}`) {
  const usdcAddress = USDC[CHAIN.id];
  return useReadContract({
    address: usdcAddress,
    abi: LOBTokenABI, // ERC-20 balanceOf is the same
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!usdcAddress },
  });
}

export function useUSDCAllowance(owner?: `0x${string}`, spender?: `0x${string}`) {
  const usdcAddress = USDC[CHAIN.id];
  return useReadContract({
    address: usdcAddress,
    abi: LOBTokenABI,
    functionName: "allowance",
    args: owner && spender ? [owner, spender] : undefined,
    query: { enabled: !!owner && !!spender && !!usdcAddress },
  });
}

// --- x402 Bridge Settlement ---

export interface X402SettleResult {
  success: boolean;
  txHash?: string;
  jobId?: string;
  errorReason?: string;
}

/**
 * Signs a PaymentIntent EIP-712 message and POSTs to the facilitator /settle endpoint.
 * Used for x402 bridge payments where the facilitator calls depositAndCreateJob on-chain.
 */
export function useX402Settle() {
  const { signTypedDataAsync } = useSignTypedData();
  const contracts = useContracts();

  return async (params: {
    payer: Address;
    token: Address;
    amount: bigint;
    listingId: bigint;
    seller: Address;
  }): Promise<X402SettleResult> => {
    if (!contracts) throw new Error("Contracts not loaded");

    const nonce = keccak256(
      encodePacked(
        ["address", "uint256", "uint256"],
        [params.payer, params.listingId, BigInt(Date.now())]
      )
    );
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

    // Sign EIP-712 PaymentIntent
    const signature = await signTypedDataAsync({
      domain: {
        name: "X402EscrowBridge",
        version: "1",
        chainId: CHAIN.id,
        verifyingContract: contracts.x402EscrowBridge,
      },
      types: {
        PaymentIntent: [
          { name: "x402Nonce", type: "bytes32" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "listingId", type: "uint256" },
          { name: "seller", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "PaymentIntent",
      message: {
        x402Nonce: nonce,
        token: params.token,
        amount: params.amount,
        listingId: params.listingId,
        seller: params.seller,
        deadline,
      },
    });

    // Parse v, r, s from signature
    const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
    const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
    const v = parseInt(signature.slice(130, 132), 16);

    // POST to facilitator
    const res = await fetch(`${FACILITATOR_URL}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentPayload: {
          x402Version: 1,
          extensions: {
            "lobstr-escrow": {
              listingId: Number(params.listingId),
              paymentIntent: {
                x402Nonce: nonce,
                payer: params.payer,
                token: params.token,
                amount: params.amount.toString(),
                listingId: Number(params.listingId),
                seller: params.seller,
                deadline: Number(deadline),
              },
              intentSignature: { v, r, s },
            },
          },
        },
        paymentRequirements: {
          scheme: "exact",
          network: `eip155:${CHAIN.id}`,
          maxAmountRequired: params.amount.toString(),
          resource: `lobstr://listing/${params.listingId}`,
          payTo: params.seller,
        },
      }),
    });

    return res.json();
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  LoanEngine
// ═══════════════════════════════════════════════════════════════════════

export function useLoan(loanId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.loanEngine,
    abi: LoanEngineABI,
    functionName: "getLoan",
    args: loanId !== undefined ? [loanId] : undefined,
    query: { enabled: loanId !== undefined && !!contracts },
  });
}

export function useBorrowerProfile(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.loanEngine,
    abi: LoanEngineABI,
    functionName: "getBorrowerProfile",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useMaxBorrow(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.loanEngine,
    abi: LoanEngineABI,
    functionName: "getMaxBorrow",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useInterestRate(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.loanEngine,
    abi: LoanEngineABI,
    functionName: "getInterestRate",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useCollateralRequired(principal?: bigint, borrower?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.loanEngine,
    abi: LoanEngineABI,
    functionName: "getCollateralRequired",
    args: principal !== undefined && borrower ? [principal, borrower] : undefined,
    query: { enabled: principal !== undefined && !!borrower && !!contracts },
  });
}

export function useOutstandingAmount(loanId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.loanEngine,
    abi: LoanEngineABI,
    functionName: "getOutstandingAmount",
    args: loanId !== undefined ? [loanId] : undefined,
    query: { enabled: loanId !== undefined && !!contracts },
  });
}

export function useActiveLoanIds(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.loanEngine,
    abi: LoanEngineABI,
    functionName: "getActiveLoanIds",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

// LoanEngine: term is a uint8 enum (0=SevenDays, 1=FourteenDays, 2=ThirtyDays, 3=NinetyDays)
export function useRequestLoan() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (principal: bigint, term: number) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.loanEngine as Address,
      abi: LoanEngineABI,
      functionName: "requestLoan",
      args: [principal, term],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useCancelLoan() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (loanId: bigint) => {
    writeContract({
      address: contracts?.loanEngine as Address,
      abi: LoanEngineABI,
      functionName: "cancelLoan",
      args: [loanId],
    });
  };
}

export function useFundLoan() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (loanId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.loanEngine as Address,
      abi: LoanEngineABI,
      functionName: "fundLoan",
      args: [loanId],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useRepayLoan() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (loanId: bigint, amount: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.loanEngine as Address,
      abi: LoanEngineABI,
      functionName: "repay",
      args: [loanId, amount],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useLiquidateLoan() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (loanId: bigint) => {
    writeContract({
      address: contracts?.loanEngine as Address,
      abi: LoanEngineABI,
      functionName: "liquidate",
      args: [loanId],
    });
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  ReviewRegistry
// ═══════════════════════════════════════════════════════════════════════

export function useReview(reviewId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.reviewRegistry,
    abi: ReviewRegistryABI,
    functionName: "getReview",
    args: reviewId !== undefined ? [reviewId] : undefined,
    query: { enabled: reviewId !== undefined && !!contracts },
  });
}

export function useReviewByJobAndReviewer(jobId?: bigint, reviewer?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.reviewRegistry,
    abi: ReviewRegistryABI,
    functionName: "getReviewByJobAndReviewer",
    args: jobId !== undefined && reviewer ? [jobId, reviewer] : undefined,
    query: { enabled: jobId !== undefined && !!reviewer && !!contracts },
  });
}

export function useRatingStats(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.reviewRegistry,
    abi: ReviewRegistryABI,
    functionName: "getRatingStats",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useAverageRating(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.reviewRegistry,
    abi: ReviewRegistryABI,
    functionName: "getAverageRating",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useSubmitReview() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (jobId: bigint, rating: number, metadataURI: string) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.reviewRegistry as Address,
      abi: ReviewRegistryABI,
      functionName: "submitReview",
      args: [jobId, rating, metadataURI],
    });
  };
  return { fn, isPending, isError, error, reset };
}

// ═══════════════════════════════════════════════════════════════════════
//  SkillRegistry
// ═══════════════════════════════════════════════════════════════════════

export function useSkill(skillId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.skillRegistry,
    abi: SkillRegistryABI,
    functionName: "getSkill",
    args: skillId !== undefined ? [skillId] : undefined,
    query: { enabled: skillId !== undefined && !!contracts },
  });
}

export function useSkillAccess(accessId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.skillRegistry,
    abi: SkillRegistryABI,
    functionName: "getAccess",
    args: accessId !== undefined ? [accessId] : undefined,
    query: { enabled: accessId !== undefined && !!contracts },
  });
}

export function useMarketplaceTier(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.skillRegistry,
    abi: SkillRegistryABI,
    functionName: "getMarketplaceTier",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useBuyerCredits(buyer?: `0x${string}`, token?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.skillRegistry,
    abi: SkillRegistryABI,
    functionName: "getBuyerCredits",
    args: buyer && token ? [buyer, token] : undefined,
    query: { enabled: !!buyer && !!token && !!contracts },
  });
}

export function useSkillDependencies(skillId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.skillRegistry,
    abi: SkillRegistryABI,
    functionName: "getSkillDependencies",
    args: skillId !== undefined ? [skillId] : undefined,
    query: { enabled: skillId !== undefined && !!contracts },
  });
}

export function useSellerListingCount(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.skillRegistry,
    abi: SkillRegistryABI,
    functionName: "getSellerListingCount",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useHasActiveAccess(buyer?: `0x${string}`, skillId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.skillRegistry,
    abi: SkillRegistryABI,
    functionName: "hasActiveAccess",
    args: buyer && skillId !== undefined ? [buyer, skillId] : undefined,
    query: { enabled: !!buyer && skillId !== undefined && !!contracts },
  });
}

// ListSkillParams struct: { assetType, deliveryMethod, pricingModel, price, settlementToken, apiEndpointHash, packageHash }
export function useListSkill() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (
    params: {
      assetType: number;
      deliveryMethod: number;
      pricingModel: number;
      price: bigint;
      settlementToken: `0x${string}`;
      apiEndpointHash: `0x${string}`;
      packageHash: `0x${string}`;
    },
    title: string,
    description: string,
    metadataURI: string,
    requiredSkills: bigint[],
  ) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.skillRegistry as Address,
      abi: SkillRegistryABI,
      functionName: "listSkill",
      args: [params, title, description, metadataURI, requiredSkills],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useUpdateSkill() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (
    skillId: bigint,
    newPrice: bigint,
    newMetadataURI: string,
    newApiEndpointHash: `0x${string}`,
    newPackageHash: `0x${string}`,
  ) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.skillRegistry as Address,
      abi: SkillRegistryABI,
      functionName: "updateSkill",
      args: [skillId, newPrice, newMetadataURI, newApiEndpointHash, newPackageHash],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useDeactivateSkill() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (skillId: bigint) => {
    writeContract({
      address: contracts?.skillRegistry as Address,
      abi: SkillRegistryABI,
      functionName: "deactivateSkill",
      args: [skillId],
    });
  };
}

export function usePurchaseSkill() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (skillId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.skillRegistry as Address,
      abi: SkillRegistryABI,
      functionName: "purchaseSkill",
      args: [skillId],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useRenewSubscription() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (accessId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.skillRegistry as Address,
      abi: SkillRegistryABI,
      functionName: "renewSubscription",
      args: [accessId],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useDepositCallCredits() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (token: `0x${string}`, amount: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.skillRegistry as Address,
      abi: SkillRegistryABI,
      functionName: "depositCallCredits",
      args: [token, amount],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useWithdrawCallCredits() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (token: `0x${string}`, amount: bigint) => {
    writeContract({
      address: contracts?.skillRegistry as Address,
      abi: SkillRegistryABI,
      functionName: "withdrawCallCredits",
      args: [token, amount],
    });
  };
}

export function useClaimSkillEarnings() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (token: `0x${string}`) => {
    writeContract({
      address: contracts?.skillRegistry as Address,
      abi: SkillRegistryABI,
      functionName: "claimEarnings",
      args: [token],
    });
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  PipelineRouter
// ═══════════════════════════════════════════════════════════════════════

export function usePipeline(pipelineId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.pipelineRouter,
    abi: PipelineRouterABI,
    functionName: "getPipeline",
    args: pipelineId !== undefined ? [pipelineId] : undefined,
    query: { enabled: pipelineId !== undefined && !!contracts },
  });
}

export function usePipelineSteps(pipelineId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.pipelineRouter,
    abi: PipelineRouterABI,
    functionName: "getPipelineSteps",
    args: pipelineId !== undefined ? [pipelineId] : undefined,
    query: { enabled: pipelineId !== undefined && !!contracts },
  });
}

export function useCreatePipeline() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (name: string, skillIds: bigint[], stepConfigs: `0x${string}`[], isPublic: boolean) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.pipelineRouter as Address,
      abi: PipelineRouterABI,
      functionName: "createPipeline",
      args: [name, skillIds, stepConfigs, isPublic],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useExecutePipeline() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (pipelineId: bigint) => {
    writeContract({
      address: contracts?.pipelineRouter as Address,
      abi: PipelineRouterABI,
      functionName: "executePipeline",
      args: [pipelineId],
    });
  };
}

export function useUpdatePipeline() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (
    pipelineId: bigint,
    newName: string,
    newSkillIds: bigint[],
    newStepConfigs: `0x${string}`[],
    isPublic: boolean,
  ) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.pipelineRouter as Address,
      abi: PipelineRouterABI,
      functionName: "updatePipeline",
      args: [pipelineId, newName, newSkillIds, newStepConfigs, isPublic],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useDeactivatePipeline() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (pipelineId: bigint) => {
    writeContract({
      address: contracts?.pipelineRouter as Address,
      abi: PipelineRouterABI,
      functionName: "deactivatePipeline",
      args: [pipelineId],
    });
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  InsurancePool
// ═══════════════════════════════════════════════════════════════════════

export function usePoolStats() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.insurancePool,
    abi: InsurancePoolABI,
    functionName: "getPoolStats",
    query: { enabled: !!contracts },
  });
}

export function usePoolStakerInfo(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.insurancePool,
    abi: InsurancePoolABI,
    functionName: "getStakerInfo",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useCoverageCap(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.insurancePool,
    abi: InsurancePoolABI,
    functionName: "getCoverageCap",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useIsInsuredJob(jobId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.insurancePool,
    abi: InsurancePoolABI,
    functionName: "isInsuredJob",
    args: jobId !== undefined ? [jobId] : undefined,
    query: { enabled: jobId !== undefined && !!contracts },
  });
}

export function usePoolEarned(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.insurancePool,
    abi: InsurancePoolABI,
    functionName: "poolEarned",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useDepositToInsurancePool() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (amount: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.insurancePool as Address,
      abi: InsurancePoolABI,
      functionName: "depositToPool",
      args: [amount],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useWithdrawFromInsurancePool() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (amount: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.insurancePool as Address,
      abi: InsurancePoolABI,
      functionName: "withdrawFromPool",
      args: [amount],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useClaimPoolRewards() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return () => {
    writeContract({
      address: contracts?.insurancePool as Address,
      abi: InsurancePoolABI,
      functionName: "claimPoolRewards",
    });
  };
}

export function useCreateInsuredJob() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (listingId: bigint, seller: `0x${string}`, amount: bigint, token: `0x${string}`) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.insurancePool as Address,
      abi: InsurancePoolABI,
      functionName: "createInsuredJob",
      args: [listingId, seller, amount, token],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useFileClaim() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (jobId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.insurancePool as Address,
      abi: InsurancePoolABI,
      functionName: "fileClaim",
      args: [jobId],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useConfirmInsuredDelivery() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (jobId: bigint) => {
    writeContract({
      address: contracts?.insurancePool as Address,
      abi: InsurancePoolABI,
      functionName: "confirmInsuredDelivery",
      args: [jobId],
    });
  };
}

export function useInitiateInsuredDispute() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (jobId: bigint, evidenceURI: string) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.insurancePool as Address,
      abi: InsurancePoolABI,
      functionName: "initiateInsuredDispute",
      args: [jobId, evidenceURI],
    });
  };
  return { fn, isPending, isError, error, reset };
}

// ═══════════════════════════════════════════════════════════════════════
//  MultiPartyEscrow
// ═══════════════════════════════════════════════════════════════════════

export function useMultiPartyGroup(groupId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.multiPartyEscrow,
    abi: MultiPartyEscrowABI,
    functionName: "getGroup",
    args: groupId !== undefined ? [groupId] : undefined,
    query: { enabled: groupId !== undefined && !!contracts },
  });
}

export function useGroupStatus(groupId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.multiPartyEscrow,
    abi: MultiPartyEscrowABI,
    functionName: "getGroupStatus",
    args: groupId !== undefined ? [groupId] : undefined,
    query: { enabled: groupId !== undefined && !!contracts },
  });
}

export function useGroupJobIds(groupId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.multiPartyEscrow,
    abi: MultiPartyEscrowABI,
    functionName: "getGroupJobIds",
    args: groupId !== undefined ? [groupId] : undefined,
    query: { enabled: groupId !== undefined && !!contracts },
  });
}

export function useJobGroup(jobId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.multiPartyEscrow,
    abi: MultiPartyEscrowABI,
    functionName: "getJobGroup",
    args: jobId !== undefined ? [jobId] : undefined,
    query: { enabled: jobId !== undefined && !!contracts },
  });
}

export function useCreateMultiJob() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (
    sellers: `0x${string}`[],
    shares: bigint[],
    listingIds: bigint[],
    token: `0x${string}`,
    totalAmount: bigint,
    metadataURI: string,
  ) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.multiPartyEscrow as Address,
      abi: MultiPartyEscrowABI,
      functionName: "createMultiJob",
      args: [sellers, shares, listingIds, token, totalAmount, metadataURI],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useMultiPartyConfirmDelivery() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (jobId: bigint) => {
    writeContract({
      address: contracts?.multiPartyEscrow as Address,
      abi: MultiPartyEscrowABI,
      functionName: "confirmDelivery",
      args: [jobId],
    });
  };
}

export function useMultiPartyInitiateDispute() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (jobId: bigint, evidenceURI: string) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.multiPartyEscrow as Address,
      abi: MultiPartyEscrowABI,
      functionName: "initiateDispute",
      args: [jobId, evidenceURI],
    });
  };
  return { fn, isPending, isError, error, reset };
}

// ═══════════════════════════════════════════════════════════════════════
//  SubscriptionEngine
// ═══════════════════════════════════════════════════════════════════════

export function useSubscription(subscriptionId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.subscriptionEngine,
    abi: SubscriptionEngineABI,
    functionName: "getSubscription",
    args: subscriptionId !== undefined ? [subscriptionId] : undefined,
    query: { enabled: subscriptionId !== undefined && !!contracts },
  });
}

export function useSubscriptionsByBuyer(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.subscriptionEngine,
    abi: SubscriptionEngineABI,
    functionName: "getSubscriptionsByBuyer",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useSubscriptionsBySeller(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.subscriptionEngine,
    abi: SubscriptionEngineABI,
    functionName: "getSubscriptionsBySeller",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useCreateSubscription() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (
    seller: `0x${string}`,
    token: `0x${string}`,
    amount: bigint,
    interval: bigint,
    maxCycles: bigint,
    listingId: bigint,
    metadataURI: string,
  ) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.subscriptionEngine as Address,
      abi: SubscriptionEngineABI,
      functionName: "createSubscription",
      args: [seller, token, amount, interval, maxCycles, listingId, metadataURI],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useProcessPayment() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (subscriptionId: bigint) => {
    writeContract({
      address: contracts?.subscriptionEngine as Address,
      abi: SubscriptionEngineABI,
      functionName: "processPayment",
      args: [subscriptionId],
    });
  };
}

export function useCancelSubscription() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (subscriptionId: bigint) => {
    writeContract({
      address: contracts?.subscriptionEngine as Address,
      abi: SubscriptionEngineABI,
      functionName: "cancelSubscription",
      args: [subscriptionId],
    });
  };
}

export function usePauseSubscription() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (subscriptionId: bigint) => {
    writeContract({
      address: contracts?.subscriptionEngine as Address,
      abi: SubscriptionEngineABI,
      functionName: "pauseSubscription",
      args: [subscriptionId],
    });
  };
}

export function useResumeSubscription() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (subscriptionId: bigint) => {
    writeContract({
      address: contracts?.subscriptionEngine as Address,
      abi: SubscriptionEngineABI,
      functionName: "resumeSubscription",
      args: [subscriptionId],
    });
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  StakingRewards
// ═══════════════════════════════════════════════════════════════════════

export function useStakingRewardsEarned(user?: `0x${string}`, token?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.stakingRewards,
    abi: StakingRewardsABI,
    functionName: "earned",
    args: user && token ? [user, token] : undefined,
    query: { enabled: !!user && !!token && !!contracts },
  });
}

export function useEffectiveBalance(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.stakingRewards,
    abi: StakingRewardsABI,
    functionName: "getEffectiveBalance",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useRewardTokens() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.stakingRewards,
    abi: StakingRewardsABI,
    functionName: "getRewardTokens",
    query: { enabled: !!contracts },
  });
}

export function useTotalEffectiveBalance() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.stakingRewards,
    abi: StakingRewardsABI,
    functionName: "getTotalEffectiveBalance",
    query: { enabled: !!contracts },
  });
}

export function useStakingRewardPerToken(token?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.stakingRewards,
    abi: StakingRewardsABI,
    functionName: "rewardPerToken",
    args: token ? [token] : undefined,
    query: { enabled: !!token && !!contracts },
  });
}

export function useSyncStake() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return () => {
    writeContract({
      address: contracts?.stakingRewards as Address,
      abi: StakingRewardsABI,
      functionName: "syncStake",
    });
  };
}

export function useClaimStakingRewards() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (token: `0x${string}`) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.stakingRewards as Address,
      abi: StakingRewardsABI,
      functionName: "claimRewards",
      args: [token],
    });
  };
  return { fn, isPending, isError, error, reset };
}

// ═══════════════════════════════════════════════════════════════════════
//  LiquidityMining
// ═══════════════════════════════════════════════════════════════════════

export function useLiquidityMiningEarned(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.liquidityMining,
    abi: LiquidityMiningABI,
    functionName: "earned",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useLiquidityMiningBalance(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.liquidityMining,
    abi: LiquidityMiningABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useLiquidityMiningTotalSupply() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.liquidityMining,
    abi: LiquidityMiningABI,
    functionName: "totalSupply",
    query: { enabled: !!contracts },
  });
}

export function useBoostMultiplier(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.liquidityMining,
    abi: LiquidityMiningABI,
    functionName: "getBoostMultiplier",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useLiquidityMiningRewardPerToken() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.liquidityMining,
    abi: LiquidityMiningABI,
    functionName: "rewardPerToken",
    query: { enabled: !!contracts },
  });
}

export function useLiquidityMiningStake() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (amount: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.liquidityMining as Address,
      abi: LiquidityMiningABI,
      functionName: "stake",
      args: [amount],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useLiquidityMiningWithdraw() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (amount: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.liquidityMining as Address,
      abi: LiquidityMiningABI,
      functionName: "withdraw",
      args: [amount],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useLiquidityMiningGetReward() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return () => {
    writeContract({
      address: contracts?.liquidityMining as Address,
      abi: LiquidityMiningABI,
      functionName: "getReward",
    });
  };
}

export function useLiquidityMiningExit() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async () => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.liquidityMining as Address,
      abi: LiquidityMiningABI,
      functionName: "exit",
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useLiquidityMiningEmergencyWithdraw() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async () => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.liquidityMining as Address,
      abi: LiquidityMiningABI,
      functionName: "emergencyWithdraw",
    });
  };
  return { fn, isPending, isError, error, reset };
}

// ═══════════════════════════════════════════════════════════════════════
//  RewardDistributor
// ═══════════════════════════════════════════════════════════════════════

export function useClaimableBalance(account?: `0x${string}`, token?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.rewardDistributor,
    abi: RewardDistributorABI,
    functionName: "claimableBalance",
    args: account && token ? [account, token] : undefined,
    query: { enabled: !!account && !!token && !!contracts },
  });
}

export function useAvailableBudget(token?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.rewardDistributor,
    abi: RewardDistributorABI,
    functionName: "availableBudget",
    args: token ? [token] : undefined,
    query: { enabled: !!token && !!contracts },
  });
}

export function useClaimDistributorReward() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (token: `0x${string}`) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.rewardDistributor as Address,
      abi: RewardDistributorABI,
      functionName: "claim",
      args: [token],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useDepositToDistributor() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (token: `0x${string}`, amount: bigint) => {
    writeContract({
      address: contracts?.rewardDistributor as Address,
      abi: RewardDistributorABI,
      functionName: "deposit",
      args: [token, amount],
    });
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  AffiliateManager
// ═══════════════════════════════════════════════════════════════════════

export function useReferralInfo(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.affiliateManager,
    abi: AffiliateManagerABI,
    functionName: "getReferralInfo",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useReferrerStats(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.affiliateManager,
    abi: AffiliateManagerABI,
    functionName: "getReferrerStats",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useAffiliateClaimableBalance(address?: `0x${string}`, token?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.affiliateManager,
    abi: AffiliateManagerABI,
    functionName: "claimableBalance",
    args: address && token ? [address, token] : undefined,
    query: { enabled: !!address && !!token && !!contracts },
  });
}

export function useRegisterReferral() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (referred: `0x${string}`) => {
    writeContract({
      address: contracts?.affiliateManager as Address,
      abi: AffiliateManagerABI,
      functionName: "registerReferral",
      args: [referred],
    });
  };
}

export function useClaimAffiliateRewards() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (token: `0x${string}`) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.affiliateManager as Address,
      abi: AffiliateManagerABI,
      functionName: "claimRewards",
      args: [token],
    });
  };
  return { fn, isPending, isError, error, reset };
}

// ═══════════════════════════════════════════════════════════════════════
//  TeamVesting
// ═══════════════════════════════════════════════════════════════════════

export function useVestedAmount() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.teamVesting,
    abi: TeamVestingABI,
    functionName: "vestedAmount",
    query: { enabled: !!contracts },
  });
}

export function useReleasable() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.teamVesting,
    abi: TeamVestingABI,
    functionName: "releasable",
    query: { enabled: !!contracts },
  });
}

export function useVestingBeneficiary() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.teamVesting,
    abi: TeamVestingABI,
    functionName: "beneficiary",
    query: { enabled: !!contracts },
  });
}

export function useVestingReleased() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.teamVesting,
    abi: TeamVestingABI,
    functionName: "released",
    query: { enabled: !!contracts },
  });
}

export function useVestingTotalAllocation() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.teamVesting,
    abi: TeamVestingABI,
    functionName: "totalAllocation",
    query: { enabled: !!contracts },
  });
}

export function useReleaseVesting() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async () => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.teamVesting as Address,
      abi: TeamVestingABI,
      functionName: "release",
    });
  };
  return { fn, isPending, isError, error, reset };
}

// ═══════════════════════════════════════════════════════════════════════
//  X402CreditFacility
// ═══════════════════════════════════════════════════════════════════════

export function useCreditLine(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.x402CreditFacility,
    abi: X402CreditFacilityABI,
    functionName: "getCreditLine",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useCreditDraw(drawId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.x402CreditFacility,
    abi: X402CreditFacilityABI,
    functionName: "getDraw",
    args: drawId !== undefined ? [drawId] : undefined,
    query: { enabled: drawId !== undefined && !!contracts },
  });
}

export function useActiveDrawIds(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.x402CreditFacility,
    abi: X402CreditFacilityABI,
    functionName: "getActiveDrawIds",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useAvailableCredit(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.x402CreditFacility,
    abi: X402CreditFacilityABI,
    functionName: "getAvailableCredit",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function usePoolUtilization() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.x402CreditFacility,
    abi: X402CreditFacilityABI,
    functionName: "getPoolUtilization",
    query: { enabled: !!contracts },
  });
}

export function useOpenCreditLine() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async () => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.x402CreditFacility as Address,
      abi: X402CreditFacilityABI,
      functionName: "openCreditLine",
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useCloseCreditLine() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async () => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.x402CreditFacility as Address,
      abi: X402CreditFacilityABI,
      functionName: "closeCreditLine",
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useDrawCreditAndCreateEscrow() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (listingId: bigint, seller: `0x${string}`, amount: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.x402CreditFacility as Address,
      abi: X402CreditFacilityABI,
      functionName: "drawCreditAndCreateEscrow",
      args: [listingId, seller, amount],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useCreditConfirmDelivery() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (escrowJobId: bigint) => {
    writeContract({
      address: contracts?.x402CreditFacility as Address,
      abi: X402CreditFacilityABI,
      functionName: "confirmDelivery",
      args: [escrowJobId],
    });
  };
}

export function useCreditInitiateDispute() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (escrowJobId: bigint, evidenceURI: string) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.x402CreditFacility as Address,
      abi: X402CreditFacilityABI,
      functionName: "initiateDispute",
      args: [escrowJobId, evidenceURI],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useRepayDraw() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (drawId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.x402CreditFacility as Address,
      abi: X402CreditFacilityABI,
      functionName: "repayDraw",
      args: [drawId],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useCreditClaimEscrowRefund() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (escrowJobId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.x402CreditFacility as Address,
      abi: X402CreditFacilityABI,
      functionName: "claimEscrowRefund",
      args: [escrowJobId],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useLiquidateDraw() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (drawId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.x402CreditFacility as Address,
      abi: X402CreditFacilityABI,
      functionName: "liquidateDraw",
      args: [drawId],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useDepositToCreditPool() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (amount: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.x402CreditFacility as Address,
      abi: X402CreditFacilityABI,
      functionName: "depositToPool",
      args: [amount],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useWithdrawFromCreditPool() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (amount: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.x402CreditFacility as Address,
      abi: X402CreditFacilityABI,
      functionName: "withdrawFromPool",
      args: [amount],
    });
  };
  return { fn, isPending, isError, error, reset };
}

