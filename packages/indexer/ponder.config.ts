import { createConfig } from "@ponder/core";
import { http, Address } from "viem";
import { base } from "viem/chains";

import { LOBTokenABI } from "./abis/LOBToken";
import { StakingManagerABI } from "./abis/StakingManager";
import { ReputationSystemABI } from "./abis/ReputationSystem";
import { ServiceRegistryABI } from "./abis/ServiceRegistry";
import { DisputeArbitrationABI } from "./abis/DisputeArbitration";
import { EscrowEngineABI } from "./abis/EscrowEngine";
import { X402EscrowBridgeABI } from "./abis/X402EscrowBridge";
import { DirectiveBoardABI } from "./abis/DirectiveBoard";
import { ReviewRegistryABI } from "./abis/ReviewRegistry";
import { LoanEngineABI } from "./abis/LoanEngine";
import { SkillRegistryABI } from "./abis/SkillRegistry";
import { PipelineRouterABI } from "./abis/PipelineRouter";
import { InsurancePoolABI } from "./abis/InsurancePool";
import { MultiPartyEscrowABI } from "./abis/MultiPartyEscrow";
import { SubscriptionEngineABI } from "./abis/SubscriptionEngine";
import { StakingRewardsABI } from "./abis/StakingRewards";
import { LiquidityMiningABI } from "./abis/LiquidityMining";
import { RewardDistributorABI } from "./abis/RewardDistributor";
import { AffiliateManagerABI } from "./abis/AffiliateManager";
import { X402CreditFacilityABI } from "./abis/X402CreditFacility";
import { TeamVestingABI } from "./abis/TeamVesting";
import { RewardSchedulerABI } from "./abis/RewardScheduler";
import { BondingEngineABI } from "./abis/BondingEngine";
import { LightningGovernorABI } from "./abis/LightningGovernor";
import { TreasuryGovernorABI } from "./abis/TreasuryGovernor";
import { AirdropClaimV3ABI } from "./abis/AirdropClaimV3";
import { RolePayrollABI } from "./abis/RolePayroll";
import { SybilGuardABI } from "./abis/SybilGuard";
import { CONTRACTS_BY_CHAIN } from "../web/src/config/contract-addresses";

const CONTRACTS = CONTRACTS_BY_CHAIN[base.id];

// V4 full redeploy — 2026-02-25, block 42598375
const V1_START_BLOCK = 42598375;
const V2_START_BLOCK = 42598375;
const V3_START_BLOCK = 42598375;

export default createConfig({
  networks: {
    baseMainnet: {
      chainId: 8453,
      transport: http(process.env.PONDER_RPC_URL_8453),
      pollingInterval: 2_000, // Base has 2s block time
    },
  },
  contracts: {
    // ── V1 Core ──
    LOBToken: {
      network: "baseMainnet",
      abi: LOBTokenABI,
      address: CONTRACTS.lobToken,
      startBlock: V1_START_BLOCK,
    },
    StakingManager: {
      network: "baseMainnet",
      abi: StakingManagerABI,
      address: CONTRACTS.stakingManager,
      startBlock: V1_START_BLOCK,
    },
    ReputationSystem: {
      network: "baseMainnet",
      abi: ReputationSystemABI,
      address: CONTRACTS.reputationSystem,
      startBlock: V1_START_BLOCK,
    },
    ServiceRegistry: {
      network: "baseMainnet",
      abi: ServiceRegistryABI,
      address: CONTRACTS.serviceRegistry,
      startBlock: V1_START_BLOCK,
    },
    DisputeArbitration: {
      network: "baseMainnet",
      abi: DisputeArbitrationABI,
      address: CONTRACTS.disputeArbitration,
      startBlock: V1_START_BLOCK,
    },
    SybilGuard: {
      network: "baseMainnet",
      abi: SybilGuardABI,
      address: CONTRACTS.sybilGuard,
      startBlock: V1_START_BLOCK,
    },
    EscrowEngine: {
      network: "baseMainnet",
      abi: EscrowEngineABI,
      address: CONTRACTS.escrowEngine,
      startBlock: V1_START_BLOCK,
    },
    X402EscrowBridge: {
      network: "baseMainnet",
      abi: X402EscrowBridgeABI,
      address: CONTRACTS.x402EscrowBridge,
      startBlock: V1_START_BLOCK,
    },
    // ── V2 Expansion ──
    DirectiveBoard: {
      network: "baseMainnet",
      abi: DirectiveBoardABI,
      address: CONTRACTS.directiveBoard,
      startBlock: V2_START_BLOCK,
    },
    ReviewRegistry: {
      network: "baseMainnet",
      abi: ReviewRegistryABI,
      address: CONTRACTS.reviewRegistry,
      startBlock: V2_START_BLOCK,
    },
    MultiPartyEscrow: {
      network: "baseMainnet",
      abi: MultiPartyEscrowABI,
      address: CONTRACTS.multiPartyEscrow,
      startBlock: V2_START_BLOCK,
    },
    InsurancePool: {
      network: "baseMainnet",
      abi: InsurancePoolABI,
      address: CONTRACTS.insurancePool,
      startBlock: V2_START_BLOCK,
    },
    RewardDistributor: {
      network: "baseMainnet",
      abi: RewardDistributorABI,
      address: CONTRACTS.rewardDistributor,
      startBlock: V2_START_BLOCK,
    },
    RewardScheduler: {
      network: "baseMainnet",
      abi: RewardSchedulerABI,
      address: CONTRACTS.rewardScheduler,
      startBlock: V2_START_BLOCK,
    },
    TeamVesting: {
      network: "baseMainnet",
      abi: TeamVestingABI,
      address: CONTRACTS.teamVesting,
      startBlock: V2_START_BLOCK,
    },
    // ── V3 Expansion ──
    LoanEngine: {
      network: "baseMainnet",
      abi: LoanEngineABI,
      address: CONTRACTS.loanEngine,
      startBlock: V3_START_BLOCK,
    },
    SkillRegistry: {
      network: "baseMainnet",
      abi: SkillRegistryABI,
      address: CONTRACTS.skillRegistry,
      startBlock: V3_START_BLOCK,
    },
    PipelineRouter: {
      network: "baseMainnet",
      abi: PipelineRouterABI,
      address: CONTRACTS.pipelineRouter,
      startBlock: V3_START_BLOCK,
    },
    SubscriptionEngine: {
      network: "baseMainnet",
      abi: SubscriptionEngineABI,
      address: CONTRACTS.subscriptionEngine,
      startBlock: V3_START_BLOCK,
    },
    StakingRewards: {
      network: "baseMainnet",
      abi: StakingRewardsABI,
      address: CONTRACTS.stakingRewards,
      startBlock: V3_START_BLOCK,
    },
    LiquidityMining: {
      network: "baseMainnet",
      abi: LiquidityMiningABI,
      address: CONTRACTS.liquidityMining,
      startBlock: V3_START_BLOCK,
    },
    AffiliateManager: {
      network: "baseMainnet",
      abi: AffiliateManagerABI,
      address: CONTRACTS.affiliateManager,
      startBlock: V3_START_BLOCK,
    },
    X402CreditFacility: {
      network: "baseMainnet",
      abi: X402CreditFacilityABI,
      address: CONTRACTS.x402CreditFacility,
      startBlock: V3_START_BLOCK,
    },
    BondingEngine: {
      network: "baseMainnet",
      abi: BondingEngineABI,
      address: CONTRACTS.bondingEngine,
      startBlock: V3_START_BLOCK,
    },
    LightningGovernor: {
      network: "baseMainnet",
      abi: LightningGovernorABI,
      address: CONTRACTS.lightningGovernor,
      startBlock: V3_START_BLOCK,
    },
    TreasuryGovernor: {
      network: "baseMainnet",
      abi: TreasuryGovernorABI,
      address: CONTRACTS.treasuryGovernor,
      startBlock: V3_START_BLOCK,
    },
    AirdropClaimV3: {
      network: "baseMainnet",
      abi: AirdropClaimV3ABI,
      address: CONTRACTS.airdropClaim,
      startBlock: V3_START_BLOCK,
    },
    RolePayroll: {
      network: "baseMainnet",
      abi: RolePayrollABI,
      address: CONTRACTS.rolePayroll,
      startBlock: V3_START_BLOCK,
    },
  },
});
