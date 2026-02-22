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
