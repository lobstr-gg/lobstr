import { type Address } from "viem";
import { baseSepolia, base } from "viem/chains";
import {
  CONTRACTS_BY_CHAIN,
  ZERO_ADDRESS,
  hasCoreAddresses,
} from "./contract-addresses";

const CONFIGURED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || base.id);
export const CHAIN = CONFIGURED_CHAIN_ID === baseSepolia.id ? baseSepolia : base;

export const USDC: Record<number, Address> = {
  [baseSepolia.id]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
  [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
};

export const FACILITATOR_URL =
  process.env.NEXT_PUBLIC_FACILITATOR_URL ?? "https://x402.lobstr.gg";

export const CONTRACTS = CONTRACTS_BY_CHAIN;

/** Returns false for zero address or undefined */
export function isValidContract(address: Address | undefined): boolean {
  return !!address && address !== ZERO_ADDRESS;
}

export function getContracts(chainId: number) {
  const contracts = CONTRACTS[chainId as keyof typeof CONTRACTS];
  if (!contracts) return undefined;

  // Guard: do not return partially configured core wiring.
  if (!hasCoreAddresses(contracts)) {
    return undefined;
  }

  return contracts;
}

// ── Explorer URLs ──

const EXPLORER_URLS: Record<number, string> = {
  [base.id]: "https://basescan.org",
  [baseSepolia.id]: "https://sepolia.basescan.org",
};

export function getExplorerUrl(type: "address" | "tx", value: string): string {
  const baseUrl = EXPLORER_URLS[CHAIN.id] ?? EXPLORER_URLS[base.id];
  return `${baseUrl}/${type}/${value}`;
}
