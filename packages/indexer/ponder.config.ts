import { createConfig } from "@ponder/core";
import { http } from "viem";

import { LOBTokenABI } from "./abis/LOBToken";
import { StakingManagerABI } from "./abis/StakingManager";
import { ReputationSystemABI } from "./abis/ReputationSystem";
import { ServiceRegistryABI } from "./abis/ServiceRegistry";
import { DisputeArbitrationABI } from "./abis/DisputeArbitration";
import { EscrowEngineABI } from "./abis/EscrowEngine";
import { X402EscrowBridgeABI } from "./abis/X402EscrowBridge";

// Base Mainnet — deployed 2026-02-18, block 42300770
const CONTRACTS = {
  lobToken: "0x7FaeC2536E2Afee56AcA568C475927F1E2521B37" as `0x${string}`,
  stakingManager: "0x0c5bC27a3C3Eb7a836302320755f6B1645C49291" as `0x${string}`,
  reputationSystem: "0xc1374611FB7c6637e30a274073e7dCFf758C76FC" as `0x${string}`,
  serviceRegistry: "0xa127B684935f1D24C7236ba1FbB3FF140F4eD3C3" as `0x${string}`,
  disputeArbitration: "0x00Ad7d299F4BF3aE8372f756b86B4dAf63eC3FAa" as `0x${string}`,
  escrowEngine: "0xBB57d0D0aB24122A87c9a28acdc242927e6189E0" as `0x${string}`,
  x402EscrowBridge: "0x68c27140D25976ac8F041Ed8a53b70Be11c9f4B0" as `0x${string}`,
};

const START_BLOCK = 42300770;
const BRIDGE_START_BLOCK = 42800000; // X402EscrowBridge deployed after core contracts

export default createConfig({
  networks: {
    baseMainnet: {
      chainId: 8453,
      transport: http(process.env.PONDER_RPC_URL_8453),
      pollingInterval: 2_000, // Base has 2s block time
    },
  },
  contracts: {
    LOBToken: {
      network: "baseMainnet",
      abi: LOBTokenABI,
      address: CONTRACTS.lobToken,
      startBlock: START_BLOCK,
    },
    StakingManager: {
      network: "baseMainnet",
      abi: StakingManagerABI,
      address: CONTRACTS.stakingManager,
      startBlock: START_BLOCK,
    },
    ReputationSystem: {
      network: "baseMainnet",
      abi: ReputationSystemABI,
      address: CONTRACTS.reputationSystem,
      startBlock: START_BLOCK,
    },
    ServiceRegistry: {
      network: "baseMainnet",
      abi: ServiceRegistryABI,
      address: CONTRACTS.serviceRegistry,
      startBlock: START_BLOCK,
    },
    DisputeArbitration: {
      network: "baseMainnet",
      abi: DisputeArbitrationABI,
      address: CONTRACTS.disputeArbitration,
      startBlock: START_BLOCK,
    },
    EscrowEngine: {
      network: "baseMainnet",
      abi: EscrowEngineABI,
      address: CONTRACTS.escrowEngine,
      startBlock: START_BLOCK,
    },
    X402EscrowBridge: {
      network: "baseMainnet",
      abi: X402EscrowBridgeABI,
      address: CONTRACTS.x402EscrowBridge,
      startBlock: BRIDGE_START_BLOCK,
    },
  },
});
