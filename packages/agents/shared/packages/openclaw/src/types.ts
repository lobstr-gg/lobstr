export interface WorkspaceConfig {
  name: string;
  chain: 'base-sepolia' | 'base';
  rpc: string;
  apiUrl: string;
  contracts: ContractAddresses;
  workspaceId: string; // bigint as string
  salt: string; // bigint as string
  createdAt: string;
}

export interface ContractAddresses {
  lobToken: string;
  reputationSystem: string;
  stakingManager: string;
  serviceRegistry: string;
  disputeArbitration: string;
  escrowEngine: string;
  airdropClaimV2: string;
  treasuryGovernor: string;
  sybilGuard: string;
  // V3 contracts
  x402CreditFacility?: string;
  rewardDistributor?: string;
  loanEngine?: string;
  stakingRewards?: string;
  liquidityMining?: string;
  rewardScheduler?: string;
  lightningGovernor?: string;
  airdropClaimV3?: string;
  teamVesting?: string;
  insurancePool?: string;
  reviewRegistry?: string;
  skillRegistry?: string;
  subscriptionEngine?: string;
  directiveBoard?: string;
  // V4 contracts
  multiPartyEscrow?: string;
  bondingEngine?: string;
  x402EscrowBridge?: string;
  // Payroll system
  rolePayroll?: string;
  uptimeVerifier?: string;
}

export interface EncryptedWallet {
  address: string;
  encryptedKey: string; // hex
  iv: string; // hex
  salt: string; // hex
  authTag: string; // hex
}

export interface HeartbeatEntry {
  timestamp: number;
  hash: string; // hex string or bigint as string
  status?: string;
  version?: string;
}

export interface ActivityData {
  channelCount: number;
  toolCallCount: number;
  lastUpdated: string;
}

export interface HeartbeatData {
  leaf: string;
  pathElements: string[];
  pathIndices: number[];
}

export interface AttestationInput {
  workspaceId: string;
  salt: string;
  uptimeDays: number;
  channelCount: number;
  toolCallCount: number;
  heartbeats: HeartbeatData[];
  heartbeatMerkleRoot: string;
  claimantAddress: string;
}
