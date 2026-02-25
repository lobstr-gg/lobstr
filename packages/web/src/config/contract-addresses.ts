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

// ── Base Mainnet (V4 — deployed 2026-02-25, block 42598375) ──
const BASE_MAINNET_ADDRESSES: ContractAddressBook = {
  lobToken: "0x6a9ebf62c198c252be0c814224518b2def93a937" as Address,
  reputationSystem: "0x21e96019dd46e07b694ee28999b758e3c156b7c2" as Address,
  stakingManager: "0x7fd4cb4b4ed7446bfd319d80f5bb6b8aeed6e408" as Address,
  treasuryGovernor: "0x905f8b6bd8264cca4d7f5a5b834af45a1b9fce27" as Address,
  rewardDistributor: "0xeb8b276fccbb982c55d1a18936433ed875783ffe" as Address,
  sybilGuard: "0xb216314338f291a0458e1d469c1c904ec65f1b21" as Address,
  serviceRegistry: "0xcfbdfad104b8339187af3d84290b59647cf4da74" as Address,
  disputeArbitration: "0x5a5c510db582546ef17177a62a604cbafceba672" as Address,
  escrowEngine: "0xada65391bb0e1c7db6e0114b3961989f3f3221a1" as Address,
  loanEngine: "0x472ec915cd56ef94e0a163a74176ef9a336cdbe9" as Address,
  x402CreditFacility: "0x124dd81b5d0e903704e5854a6fbc2dc8f954e6ca" as Address,
  stakingRewards: "0xfe5ca8efb8a79e8ef22c5a2c4e43f7592fa93323" as Address,
  liquidityMining: ZERO_ADDRESS, // deferred until DEX LP pool created
  rewardScheduler: ZERO_ADDRESS, // deferred until LiquidityMining deployed
  lightningGovernor: "0xcae6aec8d63479bde5c0969241c959b402f5647d" as Address,
  groth16VerifierV4: "0xea24fbedab58f1552962a41eed436c96a7116571" as Address,
  airdropClaim: "0xc7917624fa0cf6f4973b887de5e670d7661ef297" as Address,
  teamVesting: "0x053945d387b80b92f7a9e6b3c8c25beb41bdf14d" as Address,
  // Phase 2 — deployed standalone (block 42598375+)
  x402EscrowBridge: "0x62baf62c541fa1c1d11c4a9dad733db47485ca12" as Address,
  directiveBoard: "0xa30a2da1016a6beb573f4d4529a0f68257ed0aed" as Address,
  reviewRegistry: "0x8d8e0e86a704cecc7614abe4ad447112f2c72e3d" as Address,
  multiPartyEscrow: "0x9812384d366337390dbaeb192582d6dab989319d" as Address,
  insurancePool: "0xe01d6085344b1d90b81c7ba4e7ff3023d609bb65" as Address,
  skillRegistry: ZERO_ADDRESS, // deploy later
  pipelineRouter: ZERO_ADDRESS, // deploy later
  subscriptionEngine: "0x90d2a7737633eb0191d2c95bc764f596a0be9912" as Address,
  bondingEngine: "0xb6d23b546921cce8e4494ae6ec62722930d6547e" as Address,
  rolePayroll: "0xc1cd28c36567869534690b992d94e58daee736ab" as Address,
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
