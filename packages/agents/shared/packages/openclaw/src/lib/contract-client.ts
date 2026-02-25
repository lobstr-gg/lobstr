import {
  createPublicClient as viemCreatePublicClient,
  createWalletClient as viemCreateWalletClient,
  http,
  parseAbi,
  type Address,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, base } from 'viem/chains';
import { WorkspaceConfig } from '../types';
import { loadWallet, decryptKey, promptPassword } from './wallet';

const CHAIN_MAP: Record<string, Chain> = {
  'base-sepolia': baseSepolia,
  base: base,
};

// Return `any` to avoid deep viem generic issues in downstream CLI code.
// Runtime behavior is correct — chain and account are always set.

export function createPublicClient(config: WorkspaceConfig): any {
  const chain = CHAIN_MAP[config.chain];
  if (!chain) throw new Error(`Unsupported chain: ${config.chain}`);

  const rpcUrl = process.env.OPENCLAW_RPC_URL || config.rpc;

  return viemCreatePublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

export async function createWalletClient(
  config: WorkspaceConfig,
  workspacePath: string,
  password?: string
): Promise<{ client: any; address: Address }> {
  const chain = CHAIN_MAP[config.chain];
  if (!chain) throw new Error(`Unsupported chain: ${config.chain}`);

  const wallet = loadWallet(workspacePath);
  const pwd = password || process.env.OPENCLAW_PASSWORD || await promptPassword('Wallet password: ');
  const privateKey = decryptKey(wallet, pwd);

  const rpcUrl = process.env.OPENCLAW_RPC_URL || config.rpc;
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const client = viemCreateWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  return { client, address: account.address };
}

export function getContractAddress(config: WorkspaceConfig, name: keyof WorkspaceConfig['contracts']): Address {
  const addr = config.contracts[name];
  if (!addr || addr === '0x0000000000000000000000000000000000000000') {
    throw new Error(`Contract "${name}" not configured. Update workspace config with deployed address.`);
  }
  return addr as Address;
}

export { parseAbi, type Address };
