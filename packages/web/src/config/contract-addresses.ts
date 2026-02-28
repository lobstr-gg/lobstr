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
  bondingEngine: Address;
  rolePayroll: Address;
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

// ── Base Mainnet (V5 — deployed 2026-02-27, block ~42732313, UUPS proxies) ──
const BASE_MAINNET_ADDRESSES: ContractAddressBook = {
  lobToken: "0xD2E0C513f70f0DdEF5f3EC9296cE3B5eB2799c5E" as Address,
  reputationSystem: "0x80aB3BE1A18D6D9c79fD09B85ddA8cB6A280EAAd" as Address,
  stakingManager: "0xcd9d96c85b4Cd4E91d340C3F69aAd80c3cb3d413" as Address,
  treasuryGovernor: "0x66561329C973E8fEe8757002dA275ED1FEa56B95" as Address,
  rewardDistributor: "0xf181A69519684616460b36db44fE4A3A4f3cD913" as Address,
  sybilGuard: "0xd45202b192676BA94Df9C36bA4fF5c63cE001381" as Address,
  serviceRegistry: "0xCa8a4528a7a4c693C19AaB3f39a555150E31013E" as Address,
  disputeArbitration: "0xF5FDA5446d44505667F7eA58B0dca687c7F82b81" as Address,
  escrowEngine: "0xd8654D79C21Fb090Ef30C901db530b127Ef82b4E" as Address,
  loanEngine: "0x2F712Fb743Ee42D37371f245F5E0e7FECBEF7454" as Address,
  x402CreditFacility: "0x86718b82Af266719E493a49e248438DC6F07911a" as Address,
  stakingRewards: "0x723f8483731615350D2C694CBbA027eBC2953B39" as Address,
  liquidityMining: ZERO_ADDRESS, // deferred until DEX LP pool created
  rewardScheduler: ZERO_ADDRESS, // deferred until LiquidityMining deployed
  lightningGovernor: "0xCB3E0BD70686fF1b28925aD55A8044b1b944951c" as Address,
  groth16VerifierV4: "0x07dFaC8Ae61E5460Fc768d1c925476b4A4693C64" as Address, // V5 verifier, key name kept for compat
  airdropClaim: "0x7f4D513119A2b8cCefE1AfB22091062B54866EbA" as Address,
  teamVesting: "0x71BC320F7F5FDdEaf52a18449108021c71365d35" as Address,
  // Phase 2 — need fresh deploys with V5 deps + proxies
  x402EscrowBridge: ZERO_ADDRESS,
  directiveBoard: ZERO_ADDRESS,
  reviewRegistry: ZERO_ADDRESS,
  multiPartyEscrow: ZERO_ADDRESS,
  insurancePool: ZERO_ADDRESS,
  skillRegistry: ZERO_ADDRESS,
  pipelineRouter: ZERO_ADDRESS,
  subscriptionEngine: ZERO_ADDRESS,
  bondingEngine: ZERO_ADDRESS,
  rolePayroll: ZERO_ADDRESS,
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
  bondingEngine: ZERO_ADDRESS,
  rolePayroll: ZERO_ADDRESS,
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
