import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { WorkspaceConfig } from '../types';
import { CHAINS, DEFAULT_CHAIN, OPENCLAW_DIR } from './config';

function getOpenClawRoot(): string {
  return path.join(os.homedir(), OPENCLAW_DIR);
}

export function getWorkspacePath(name: string): string {
  return path.join(getOpenClawRoot(), name);
}

export function getActiveWorkspacePath(): string {
  return path.join(getOpenClawRoot(), '.active');
}

export function createWorkspace(name: string, chain?: string): WorkspaceConfig {
  const chainKey = chain || DEFAULT_CHAIN;
  const chainConfig = CHAINS[chainKey];
  if (!chainConfig) {
    throw new Error(`Unknown chain: ${chainKey}. Available: ${Object.keys(CHAINS).join(', ')}`);
  }

  const wsPath = getWorkspacePath(name);
  if (fs.existsSync(wsPath)) {
    throw new Error(`Workspace "${name}" already exists at ${wsPath}`);
  }

  // Create workspace directories
  fs.mkdirSync(wsPath, { recursive: true });
  fs.mkdirSync(path.join(wsPath, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(wsPath, 'attestation'), { recursive: true });

  // Generate random workspace ID and salt
  const workspaceId = BigInt('0x' + crypto.randomBytes(16).toString('hex')).toString();
  const salt = BigInt('0x' + crypto.randomBytes(16).toString('hex')).toString();

  const config: WorkspaceConfig = {
    name,
    chain: chainKey as 'base-sepolia' | 'base',
    rpc: chainConfig.rpc,
    apiUrl: chainConfig.apiUrl,
    contracts: chainConfig.contracts,
    workspaceId,
    salt,
    createdAt: new Date().toISOString(),
  };

  // Write config
  fs.writeFileSync(
    path.join(wsPath, 'config.json'),
    JSON.stringify(config, null, 2)
  );

  // Initialize empty activity file
  fs.writeFileSync(
    path.join(wsPath, 'activity.json'),
    JSON.stringify({ channelCount: 0, toolCallCount: 0, lastUpdated: new Date().toISOString() }, null, 2)
  );

  // Set as active workspace
  setActiveWorkspace(name);

  return config;
}

export function loadConfig(name: string): WorkspaceConfig {
  const configPath = path.join(getWorkspacePath(name), 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Workspace "${name}" not found. Run: openclaw init ${name}`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

export function getActiveWorkspace(): string | null {
  const activePath = getActiveWorkspacePath();
  if (!fs.existsSync(activePath)) return null;
  return fs.readFileSync(activePath, 'utf-8').trim();
}

export function setActiveWorkspace(name: string): void {
  const root = getOpenClawRoot();
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(getActiveWorkspacePath(), name);
}

export function ensureWorkspace(): { name: string; config: WorkspaceConfig; path: string } {
  const name = getActiveWorkspace();
  if (!name) {
    throw new Error('No active workspace. Run: openclaw init <name>');
  }
  const config = loadConfig(name);
  const wsPath = getWorkspacePath(name);
  return { name, config, path: wsPath };
}

export function listWorkspaces(): string[] {
  const root = getOpenClawRoot();
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter(f => {
    if (f.startsWith('.')) return false;
    const stat = fs.statSync(path.join(root, f));
    return stat.isDirectory() && fs.existsSync(path.join(root, f, 'config.json'));
  });
}
