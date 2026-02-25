export interface WorkspaceConfig {
  name: string;
  chain: 'base-sepolia' | 'base';
  rpc: string;
  apiUrl: string;
  contracts: ContractAddresses;
  workspaceId: string; // bigint as string
  salt: string; // bigint as string
  createdAt: string;
  // Discord integration
  discord?: DiscordConfig;
  // Agent config
  agent?: AgentConfig;
}

export interface DiscordConfig {
  botToken: string;
  applicationId: string;
  guildId?: string;
  // Channel IDs
  textChannelId?: string;
  voiceChannelId?: string;
  forumChannelId?: string;
  consensusChannelId?: string;
  // Behavior
  autoRespond?: boolean;
  respondToMentions?: boolean;
  respondToDms?: boolean;
  // Status
  status?: 'online' | 'idle' | 'dnd';
  activity?: string;
  // Consensus
  cruzDiscordUserId?: string;
}

export interface AgentConfig {
  // LLM configuration
  llm?: {
    provider?: 'openai' | 'anthropic' | 'ollama' | 'custom';
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
  };
  // Cron settings
  cron?: {
    enabled?: boolean;
    maxConcurrent?: number;
  };
  // Heartbeat settings
  heartbeat?: {
    enabled?: boolean;
    intervalMinutes?: number;
    delivery?: 'none' | 'announce' | 'last';
  };
  // Security
  security?: {
    sandboxMode?: 'all' | 'docker' | 'none';
    allowExec?: boolean;
    allowedPaths?: string[];
  };
  // Consensus — on-chain transaction approval
  consensus?: {
    memoryApiUrl?: string;
    agentApiKey?: string;
    proposalTimeoutMinutes?: number;
  };
}

export interface DiscordStatus {
  connected: boolean;
  guilds: string[];
  channels: {
    text: number;
    voice: number;
    forums: number;
  };
  latency?: number;
  uptime?: number;
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
  // V4 contracts
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

export interface RoleHeartbeatEntry {
  timestamp: number;
  blockNumber: number;
  blockHash: string;
  blockHashField: string;  // blockHash % SNARK_FIELD, as decimal string
  hash: string;            // Poseidon(timestamp, blockHashField, nonce), as decimal string
  nonce: string;           // random nonce, as decimal string
}

export interface RoleUptimeInput {
  claimantAddress: string;
  uptimeCount: number;
  weekStart: number;
  merkleRoot: string;
  sampledLeaves: string[];
  sampledPathElements: string[][];
  sampledPathIndices: number[][];
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
