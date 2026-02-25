// Library exports for skills to use — no CLI execution at import time

export { ensureWorkspace, loadConfig, getWorkspacePath, getActiveWorkspace } from './lib/workspace';
export { loadWallet, decryptKey, encryptKey, saveWallet, promptPassword, walletExists } from './lib/wallet';
export { createPublicClient, createWalletClient, getContractAddress } from './lib/contract-client';
export { readActivity, writeActivity, incrementChannels, incrementToolCalls } from './lib/activity';
export { poseidonHash } from './lib/poseidon';
export { buildMerkleTree, buildRoleMerkleTree, ROLE_TREE_DEPTH, ROLE_TREE_SIZE } from './lib/merkle';
export { parseAbi, type Address } from './lib/contract-client';
export * from './lib/abis';
export * from './lib/ui';
export * from './types';
export { registerAttestationCommand } from './commands/attestation';

// Security hardening (ported from OpenClaw v2026.2.24-beta.1)
export {
  sanitizeExecEnv,
  isDangerousEnvKey,
  normalizeFsPath,
  isWithinWorkspace,
  enforceWorkspaceBoundary,
  isTrustedBinDir,
  validateBinPath,
  suppressReasoningPayload,
  containsReasoningPayload,
  normalizeSessionKey,
  isReservedSessionKey,
  validateExecDepth,
  unwrapDispatchChain,
  isHardLink,
  validateMediaPath,
  loadSecurityConfig,
  SecurityError,
  type SecurityConfig,
  DEFAULT_SECURITY_CONFIG,
  DEFAULT_SAFE_BIN_DIRS,
  DANGEROUS_ENV_PATTERNS,
} from './lib/security';
