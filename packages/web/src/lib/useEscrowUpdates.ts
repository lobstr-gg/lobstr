"use client";

import { useReadContract, useWriteContract } from "wagmi";
import { type Address } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";
import { EscrowEngineABI } from "@/config/abis";

function useContracts() {
  return getContracts(CHAIN.id);
}

// ── Read: Token Allowlist ──

/**
 * Check if a token address is on the escrow engine's allowlist.
 * Returns { data: boolean | undefined, ... }
 */
export function useIsTokenAllowed(token?: string) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.escrowEngine,
    abi: EscrowEngineABI,
    functionName: "isTokenAllowed",
    args: token ? [token as Address] : undefined,
    query: { enabled: !!token && !!contracts },
  });
}

// ── Read: Constants ──

/** Minimum escrow amount (in wei) — 10 LOB */
export function useMinEscrowAmount() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.escrowEngine,
    abi: EscrowEngineABI,
    functionName: "MIN_ESCROW_AMOUNT",
    query: { enabled: !!contracts },
  });
}

/** Skill escrow dispute window (in seconds) — 72 hours */
export function useSkillEscrowDisputeWindow() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.escrowEngine,
    abi: EscrowEngineABI,
    functionName: "SKILL_ESCROW_DISPUTE_WINDOW",
    query: { enabled: !!contracts },
  });
}

// ── Write: Admin Token Management ──

/** Allowlist a token for escrow (admin only) */
export function useAllowlistToken() {
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const contracts = useContracts();

  const fn = async (token: Address) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.escrowEngine,
      abi: EscrowEngineABI,
      functionName: "allowlistToken",
      args: [token],
    });
  };

  return { fn, isPending, isError, error, reset };
}

/** Remove a token from the escrow allowlist (admin only) */
export function useRemoveToken() {
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const contracts = useContracts();

  const fn = async (token: Address) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.escrowEngine,
      abi: EscrowEngineABI,
      functionName: "removeToken",
      args: [token],
    });
  };

  return { fn, isPending, isError, error, reset };
}

// ── Escrow Type Enum ──

export const EscrowType = {
  SERVICE_JOB: 0,
  SKILL_PURCHASE: 1,
} as const;

export type EscrowTypeValue = (typeof EscrowType)[keyof typeof EscrowType];

/**
 * Returns a human-readable label for the escrow type.
 */
export function getEscrowTypeLabel(escrowType: number): string {
  switch (escrowType) {
    case EscrowType.SKILL_PURCHASE:
      return "Skill Purchase";
    case EscrowType.SERVICE_JOB:
    default:
      return "Service Job";
  }
}

/**
 * Returns the dispute window description based on escrow type.
 * Service jobs: 1-24 hours (depends on value).
 * Skill purchases: fixed 72-hour window.
 */
export function getDisputeWindowLabel(escrowType: number): string {
  if (escrowType === EscrowType.SKILL_PURCHASE) {
    return "72-hour dispute window";
  }
  return "1-24 hour dispute window";
}
