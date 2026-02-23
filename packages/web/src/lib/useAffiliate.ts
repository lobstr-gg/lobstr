"use client";

import { useReadContract, useWriteContract } from "wagmi";
import { type Address } from "viem";

import { getContracts, CHAIN } from "@/config/contracts";
import { AffiliateManagerABI } from "@/config/abis";

function useContracts() {
  return getContracts(CHAIN.id);
}

// ═══════════════════════════════════════════════════════════════════════
//  AffiliateManager — Read hooks
// ═══════════════════════════════════════════════════════════════════════

/** Fetch ReferralInfo for a referred address (returns: referrer, registeredAt). */
export function useReferralInfo(referred?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.affiliateManager,
    abi: AffiliateManagerABI,
    functionName: "getReferralInfo",
    args: referred ? [referred] : undefined,
    query: { enabled: !!referred && !!contracts },
  });
}

/** Fetch ReferrerStats (totalReferred, totalRewardsCredited, totalRewardsClaimed, pendingRewards). */
export function useReferrerStats(referrer?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.affiliateManager,
    abi: AffiliateManagerABI,
    functionName: "getReferrerStats",
    args: referrer ? [referrer] : undefined,
    query: { enabled: !!referrer && !!contracts },
  });
}

/** Check claimable affiliate reward balance for a referrer + token pair. */
export function useClaimableAffiliateBalance(referrer?: `0x${string}`, token?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.affiliateManager,
    abi: AffiliateManagerABI,
    functionName: "claimableBalance",
    args: referrer && token ? [referrer, token] : undefined,
    query: { enabled: !!referrer && !!token && !!contracts },
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  AffiliateManager — Write hooks
// ═══════════════════════════════════════════════════════════════════════

/** Register a referral relationship (caller is the referrer). */
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

/**
 * Claim accumulated affiliate rewards for a given token.
 * Returns { fn, isPending, isError, error, reset }.
 */
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
