import type { Address } from "viem";
import { base, baseSepolia } from "viem/chains";

export type ContractAddressBook = {
  // ── V3 Core (DeployAll.s.sol) ──
  lobToken: Address;
  reputationSystem: Address;
  stakingManager: Address;
  treasuryGovernor: Address;
  rewardDistributor: Address;
  sybilGuard: Address;
  serviceRegistry: Address;
  disputeArbitration: Address;
  escrowEngine: Address;
  loanEngine: Address;
  x402CreditFacility: Address;
  stakingRewards: Address;
  liquidityMining: Address;
  rewardScheduler: Address;
  lightningGovernor: Address;
  groth16VerifierV4: Address;
  airdropClaim: Address;
  teamVesting: Address;
  // ── Not yet deployed ──
  x402EscrowBridge: Address;
  directiveBoard: Address;
  reviewRegistry: Address;
  multiPartyEscrow: Address;
  insurancePool: Address;
  skillRegistry: Address;
  pipelineRouter: Address;
  subscriptionEngine: Address;
  affiliateManager: Address;
  bondingEngine: Address;
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

// ── Base Mainnet (V3 — deployed 2026-02-22, block 42509758) ──
const BASE_MAINNET_ADDRESSES: ContractAddressBook = {
  lobToken: "0xD84Ace4eA3F111F8c5606e9F0A200506A5b714d1" as Address,
  reputationSystem: "0xd41a40145811915075F6935A4755f8688e53c8dB" as Address,
  stakingManager: "0xCB7790D3f9b5bfe171eb30C253Ab3007d43C441b" as Address,
  treasuryGovernor: "0x9b7E2b8cf7de5ef1f85038b050952DC1D4596319" as Address,
  rewardDistributor: "0x6D96dF45Ad39A38fd00C7e22bdb33C87B69923Ac" as Address,
  sybilGuard: "0x545A01E48cFB6A76699Ef12Ec1e998C1a275c84E" as Address,
  serviceRegistry: "0x5426e673b58674B41B8a3B6Ff14cC01D97d69e3c" as Address,
  disputeArbitration: "0xFfBded2DbA5e27Ad5A56c6d4C401124e942Ada04" as Address,
  escrowEngine: "0x576235a56e0e25feb95Ea198d017070Ad7f78360" as Address,
  loanEngine: "0xf5Ab9F1A5c6CC60e1A68d50B4C943D72fd97487a" as Address,
  x402CreditFacility: "0x0d1d8583561310ADeEfe18cb3a5729e2666aC14C" as Address,
  stakingRewards: "0xac09C8c327321Ef52CA4D5837A109e327933c0d8" as Address,
  liquidityMining: "0x4b534d01Ca4aCfa7189D4f61ED3A6bB488FB208D" as Address,
  rewardScheduler: "0x6A7b959A96be2abD5C2C866489e217c9153A9D8A" as Address,
  lightningGovernor: "0xBAd7274F05C84deaa16542404C5Da2495F2fa145" as Address,
  groth16VerifierV4: "0x4982F09b7a17c143c5a28D55a3C0FC51e51B25A4" as Address,
  airdropClaim: "0x00aB66216A022aDEb0D72A2e7Ee545D2BA9b1e7C" as Address,
  teamVesting: "0xFB97b85eBaF663c29323BA2499A11a7E524aCcC1" as Address,
  // Not yet deployed
  x402EscrowBridge: ZERO_ADDRESS,
  directiveBoard: ZERO_ADDRESS,
  reviewRegistry: ZERO_ADDRESS,
  multiPartyEscrow: ZERO_ADDRESS,
  insurancePool: "0xE1d68167a15AFA7C4e22dF978Dc4A66A0b4114fe" as Address,
  skillRegistry: ZERO_ADDRESS,
  pipelineRouter: ZERO_ADDRESS,
  subscriptionEngine: ZERO_ADDRESS,
  affiliateManager: ZERO_ADDRESS,
  bondingEngine: ZERO_ADDRESS,
};

// ── Base Sepolia (testnet) ──
const BASE_SEPOLIA_ADDRESSES: ContractAddressBook = {
  lobToken: ZERO_ADDRESS,
  reputationSystem: ZERO_ADDRESS,
  stakingManager: ZERO_ADDRESS,
  treasuryGovernor: ZERO_ADDRESS,
  rewardDistributor: ZERO_ADDRESS,
  sybilGuard: ZERO_ADDRESS,
  serviceRegistry: ZERO_ADDRESS,
  disputeArbitration: ZERO_ADDRESS,
  escrowEngine: ZERO_ADDRESS,
  loanEngine: ZERO_ADDRESS,
  x402CreditFacility: ZERO_ADDRESS,
  stakingRewards: ZERO_ADDRESS,
  liquidityMining: ZERO_ADDRESS,
  rewardScheduler: ZERO_ADDRESS,
  lightningGovernor: ZERO_ADDRESS,
  groth16VerifierV4: ZERO_ADDRESS,
  airdropClaim: ZERO_ADDRESS,
  teamVesting: ZERO_ADDRESS,
  x402EscrowBridge: ZERO_ADDRESS,
  directiveBoard: ZERO_ADDRESS,
  reviewRegistry: ZERO_ADDRESS,
  multiPartyEscrow: ZERO_ADDRESS,
  insurancePool: ZERO_ADDRESS,
  skillRegistry: ZERO_ADDRESS,
  pipelineRouter: ZERO_ADDRESS,
  subscriptionEngine: ZERO_ADDRESS,
  affiliateManager: ZERO_ADDRESS,
  bondingEngine: ZERO_ADDRESS,
};

export const CONTRACTS_BY_CHAIN: Record<number, ContractAddressBook> = {
  [base.id]: BASE_MAINNET_ADDRESSES,
  [baseSepolia.id]: BASE_SEPOLIA_ADDRESSES,
};

export function hasCoreAddresses(contracts: ContractAddressBook | undefined): boolean {
  if (!contracts) return false;
  return (
    contracts.lobToken !== ZERO_ADDRESS &&
    contracts.stakingManager !== ZERO_ADDRESS &&
    contracts.serviceRegistry !== ZERO_ADDRESS &&
    contracts.disputeArbitration !== ZERO_ADDRESS &&
    contracts.escrowEngine !== ZERO_ADDRESS
  );
}
