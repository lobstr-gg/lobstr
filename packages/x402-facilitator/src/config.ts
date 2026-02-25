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
  lobToken: "0x6a9ebf62c198c252be0c814224518b2def93a937" as Address,
  stakingManager: "0x7fd4cb4b4ed7446bfd319d80f5bb6b8aeed6e408" as Address,
  reputationSystem: "0x21e96019dd46e07b694ee28999b758e3c156b7c2" as Address,
  serviceRegistry: "0xcfbdfad104b8339187af3d84290b59647cf4da74" as Address,
  disputeArbitration: "0x5a5c510db582546ef17177a62a604cbafceba672" as Address,
  escrowEngine: "0xada65391bb0e1c7db6e0114b3961989f3f3221a1" as Address,
  x402EscrowBridge: "0x62baf62c541fa1c1d11c4a9dad733db47485ca12" as Address,
  x402CreditFacility: "0x124dd81b5d0e903704e5854a6fbc2dc8f954e6ca" as Address,
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
