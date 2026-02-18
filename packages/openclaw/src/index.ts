// Library exports for skills to use — no CLI execution at import time

export { ensureWorkspace, loadConfig, getWorkspacePath, getActiveWorkspace } from './lib/workspace';
export { loadWallet, decryptKey, encryptKey, saveWallet, promptPassword, walletExists } from './lib/wallet';
export { createPublicClient, createWalletClient, getContractAddress } from './lib/contract-client';
export { readActivity, writeActivity, incrementChannels, incrementToolCalls } from './lib/activity';
export { poseidonHash } from './lib/poseidon';
export { buildMerkleTree } from './lib/merkle';
export { parseAbi, type Address } from './lib/contract-client';
export * from './lib/abis';
export * from './lib/ui';
export * from './types';
