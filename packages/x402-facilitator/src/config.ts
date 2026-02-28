import { type Address } from "viem";
import { base, baseSepolia } from "viem/chains";

// ─── Chain ────────────────────────────────────────────────────────────────────

export const NETWORK = process.env.NETWORK === "testnet" ? "testnet" : "mainnet";

export const CHAIN = NETWORK === "testnet" ? baseSepolia : base;
export const CHAIN_ID = CHAIN.id;
export const CAIP2_NETWORK = `eip155:${CHAIN_ID}` as const;

export const RPC_URL = process.env.RPC_URL ?? (
  NETWORK === "testnet"
    ? "https://sepolia.base.org"
    : "https://mainnet.base.org"
);

// ─── Contract Addresses ──────────────────────────────────────────────────────

const MAINNET_CONTRACTS = {
  lobToken: "0xD2E0C513f70f0DdEF5f3EC9296cE3B5eB2799c5E" as Address,
  stakingManager: "0xcd9d96c85b4Cd4E91d340C3F69aAd80c3cb3d413" as Address,
  reputationSystem: "0x80aB3BE1A18D6D9c79fD09B85ddA8cB6A280EAAd" as Address,
  serviceRegistry: "0xCa8a4528a7a4c693C19AaB3f39a555150E31013E" as Address,
  disputeArbitration: "0xF5FDA5446d44505667F7eA58B0dca687c7F82b81" as Address,
  escrowEngine: "0xd8654D79C21Fb090Ef30C901db530b127Ef82b4E" as Address,
  x402EscrowBridge: "0x0000000000000000000000000000000000000000" as Address, // Phase 2 - not redeployed for V5
  x402CreditFacility: "0x86718b82Af266719E493a49e248438DC6F07911a" as Address,
  skillRegistry: "0x0000000000000000000000000000000000000000" as Address, // deploy standalone
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
} as const;

const TESTNET_CONTRACTS = {
  lobToken: "0x6024B53f6f8afD433dc434D95be42A45Ed9b4a59" as Address,
  stakingManager: "0x0c8390c6ef1a7Dd07Cc2bE9C0C06D49FC5439c58" as Address,
  reputationSystem: "0xbbBd9c388b6bdCA4772bC5297f4E72d76d5fE21C" as Address,
  serviceRegistry: "0xa309769426C90f27Cc32E62BdBF6313E35c5c660" as Address,
  disputeArbitration: "0x0060D7828ace2B594Bb5e56F80d7757BC473cf72" as Address,
  escrowEngine: "0x072EdB0526027A48f6A2aC5CeE3A5375142Bedc0" as Address,
  x402EscrowBridge: "0x0000000000000000000000000000000000000000" as Address, // TODO: deploy on testnet
  x402CreditFacility: "0x0000000000000000000000000000000000000000" as Address, // TODO: deploy on testnet
  skillRegistry: "0x0000000000000000000000000000000000000000" as Address, // TODO: deploy on testnet
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
} as const;

export const CONTRACTS = NETWORK === "testnet" ? TESTNET_CONTRACTS : MAINNET_CONTRACTS;

// ─── Trust Thresholds ────────────────────────────────────────────────────────

export const MIN_REPUTATION_SCORE = Number(process.env.MIN_REPUTATION_SCORE ?? "0");
export const REQUIRE_STAKE = process.env.REQUIRE_STAKE !== "false";

// ─── Server ──────────────────────────────────────────────────────────────────

export const PORT = Number(process.env.PORT ?? "3402");
export const FACILITATOR_PRIVATE_KEY = process.env.FACILITATOR_PRIVATE_KEY as `0x${string}` | undefined;
