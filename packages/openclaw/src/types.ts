export interface WorkspaceConfig {
  name: string;
  chain: 'base-sepolia' | 'base';
  rpc: string;
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
  hash: string; // bigint as string
  nonce: string; // bigint as string
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
