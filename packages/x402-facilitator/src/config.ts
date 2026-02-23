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
  lobToken: "0xD84Ace4eA3F111F8c5606e9F0A200506A5b714d1" as Address,
  stakingManager: "0xCB7790D3f9b5bfe171eb30C253Ab3007d43C441b" as Address,
  reputationSystem: "0xd41a40145811915075F6935A4755f8688e53c8dB" as Address,
  serviceRegistry: "0x5426e673b58674B41B8a3B6Ff14cC01D97d69e3c" as Address,
  disputeArbitration: "0xFfBded2DbA5e27Ad5A56c6d4C401124e942Ada04" as Address,
  escrowEngine: "0x576235a56e0e25feb95Ea198d017070Ad7f78360" as Address,
  x402EscrowBridge: "0x0000000000000000000000000000000000000000" as Address, // V1 bridge deprecated in V3
  x402CreditFacility: "0x0d1d8583561310ADeEfe18cb3a5729e2666aC14C" as Address,
  skillRegistry: "0x0000000000000000000000000000000000000000" as Address, // TODO: deploy and update
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
