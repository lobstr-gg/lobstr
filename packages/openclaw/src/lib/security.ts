/**
 * Security hardening module — ported from OpenClaw v2026.2.24-beta.1
 *
 * Covers:
 *   - Exec environment sanitization (strip LD_*, DYLD_*, SSLKEYLOGFILE)
 *   - Workspace FS guard with @-prefix path normalization
 *   - Safe-bin trusted directory restriction
 *   - Reasoning payload suppression
 *   - Hook session-key normalization (Unicode NFKC)
 *   - Exec approval depth cap (fail-closed)
 *   - Sandbox media path validation (reject hardlink aliases)
 */

import * as path from 'path';
import * as fs from 'fs';

// ── Dangerous environment variable patterns ──────────────────────────
// Injection vectors: dynamic linker, SSL sniffing, Node.js preload, shell hijack

const DANGEROUS_ENV_PATTERNS: RegExp[] = [
  /^LD_PRELOAD$/i,
  /^LD_LIBRARY_PATH$/i,
  /^LD_AUDIT$/i,
  /^LD_[A-Z_]+$/i,
  /^DYLD_INSERT_LIBRARIES$/i,
  /^DYLD_FRAMEWORK_PATH$/i,
  /^DYLD_LIBRARY_PATH$/i,
  /^DYLD_[A-Z_]+$/i,
  /^SSLKEYLOGFILE$/i,
  /^NODE_OPTIONS$/i,
  /^ELECTRON_RUN_AS_NODE$/i,
  /^BASH_ENV$/i,
  /^ENV$/i,
  /^CDPATH$/i,
  /^GLOBIGNORE$/i,
  /^BASH_FUNC_/i,
  /^PYTHONSTARTUP$/i,
  /^PERL5OPT$/i,
  /^RUBYOPT$/i,
];

const DEFAULT_SAFE_BIN_DIRS = ['/bin', '/usr/bin'];
const SHELL_WRAPPERS = ['/usr/bin/env', '/bin/env'];
const MAX_DISPATCH_WRAPPER_DEPTH = 5;

// ── Types ────────────────────────────────────────────────────────────

export interface SecurityConfig {
  trustModel?: {
    multiUserHeuristic?: boolean;
  };
  sandbox?: {
    mode?: 'off' | 'exec' | 'all';
    workspaceOnly?: boolean;
  };
  exec?: {
    safeBinTrustedDirs?: string[];
    maxDispatchWrapperDepth?: number;
    allowlist?: string[];
  };
  heartbeat?: {
    deliveryTarget?: 'none' | 'last' | string;
    blockDirectChat?: boolean;
  };
}

const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  trustModel: { multiUserHeuristic: false },
  sandbox: { mode: 'off', workspaceOnly: true },
  exec: {
    safeBinTrustedDirs: DEFAULT_SAFE_BIN_DIRS,
    maxDispatchWrapperDepth: MAX_DISPATCH_WRAPPER_DEPTH,
    allowlist: [],
  },
  heartbeat: {
    deliveryTarget: 'none',
    blockDirectChat: true,
  },
};

// ── Security Error ───────────────────────────────────────────────────

export class SecurityError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'SecurityError';
    this.code = code;
  }
}

// ── 1. Exec Environment Sanitizer ────────────────────────────────────

export function isDangerousEnvKey(key: string): boolean {
  return DANGEROUS_ENV_PATTERNS.some((p) => p.test(key));
}

export function sanitizeExecEnv(
  env?: NodeJS.ProcessEnv,
): Record<string, string> {
  const source = env || process.env;
  const clean: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (!isDangerousEnvKey(key)) {
      clean[key] = value;
    }
  }

  if (clean['PATH']) {
    clean['PATH'] = canonicalizePath(clean['PATH']);
  }

  return clean;
}

function canonicalizePath(pathStr: string): string {
  const entries = pathStr.split(path.delimiter);
  const seen = new Set<string>();
  const canonical: string[] = [];

  for (const entry of entries) {
    const resolved = path.resolve(entry);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      canonical.push(resolved);
    }
  }

  return canonical.join(path.delimiter);
}

// ── 2. Workspace FS Guard ────────────────────────────────────────────

export function normalizeFsPath(inputPath: string): string {
  let normalized = inputPath;

  // Strip @-prefix escape (prevents bypass via "@/etc/passwd")
  if (normalized.startsWith('@')) {
    normalized = normalized.slice(1);
  }

  normalized = path.resolve(normalized);

  try {
    normalized = fs.realpathSync(normalized);
  } catch {
    // Path may not exist yet — resolve to nearest existing ancestor
    const sep = path.sep as string;
    const parts = normalized.split(sep);
    let resolved: string = sep;
    for (let i = 1; i < parts.length; i++) {
      const candidate = path.join(resolved, parts[i]);
      try {
        resolved = fs.realpathSync(candidate);
      } catch {
        resolved = path.join(resolved, ...parts.slice(i));
        break;
      }
    }
    normalized = resolved;
  }

  return normalized;
}

export function isWithinWorkspace(
  targetPath: string,
  workspacePath: string,
): boolean {
  const normalizedTarget = normalizeFsPath(targetPath);
  const normalizedWorkspace = normalizeFsPath(workspacePath);
  return (
    normalizedTarget.startsWith(normalizedWorkspace + path.sep) ||
    normalizedTarget === normalizedWorkspace
  );
}

export function enforceWorkspaceBoundary(
  targetPath: string,
  workspacePath: string,
): string {
  const normalized = normalizeFsPath(targetPath);
  if (!isWithinWorkspace(normalized, workspacePath)) {
    throw new SecurityError(
      `Path "${targetPath}" resolves outside workspace boundary "${workspacePath}"`,
      'WORKSPACE_ESCAPE',
    );
  }
  return normalized;
}

// ── 3. Safe-Bin Trusted Directory Restriction ────────────────────────

export function isTrustedBinDir(
  binPath: string,
  trustedDirs?: string[],
): boolean {
  const dirs = trustedDirs || DEFAULT_SAFE_BIN_DIRS;
  const resolved = path.resolve(binPath);
  const dir = path.dirname(resolved);

  for (const trusted of dirs) {
    const trustedResolved = path.resolve(trusted);
    if (
      dir === trustedResolved ||
      dir.startsWith(trustedResolved + path.sep)
    ) {
      return true;
    }
  }
  return false;
}

export function validateBinPath(
  executable: string,
  config?: SecurityConfig,
): { safe: boolean; resolvedPath: string; reason?: string } {
  const resolved = path.resolve(executable);
  const trustedDirs =
    config?.exec?.safeBinTrustedDirs || DEFAULT_SAFE_BIN_DIRS;

  if (!isTrustedBinDir(resolved, trustedDirs)) {
    return {
      safe: false,
      resolvedPath: resolved,
      reason: `Binary "${executable}" not in trusted directories: ${trustedDirs.join(', ')}`,
    };
  }

  try {
    const dirStat = fs.statSync(path.dirname(resolved));
    const mode = dirStat.mode;
    if (mode & 0o022) {
      return {
        safe: false,
        resolvedPath: resolved,
        reason: `Directory containing "${executable}" is group/world writable (mode 0${(mode & 0o777).toString(8)})`,
      };
    }
  } catch {
    return {
      safe: false,
      resolvedPath: resolved,
      reason: `Cannot stat directory for "${executable}"`,
    };
  }

  return { safe: true, resolvedPath: resolved };
}

// ── 4. Reasoning Payload Suppression ─────────────────────────────────

export function suppressReasoningPayload(text: string): string {
  let result = text;

  // <thinking>...</thinking> blocks
  result = result.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');

  // Lines starting with "Reasoning:"
  result = result.replace(/^Reasoning:.*$/gm, '');

  // [reasoning]...[/reasoning] blocks
  result = result.replace(/\[reasoning\][\s\S]*?\[\/reasoning\]/gi, '');

  return result.trim();
}

export function containsReasoningPayload(text: string): boolean {
  return (
    /<thinking>/i.test(text) ||
    /^Reasoning:/m.test(text) ||
    /\[reasoning\]/i.test(text)
  );
}

// ── 5. Hook Session-Key Normalization ────────────────────────────────

export function normalizeSessionKey(key: string): string {
  let normalized = key.trim();
  normalized = normalized.normalize('NFKC');
  normalized = normalized.toLowerCase();
  return normalized;
}

const RESERVED_PREFIXES = [
  'hook:',
  'system:',
  'internal:',
  'cron:',
  'exec:',
];

export function isReservedSessionKey(key: string): boolean {
  const normalized = normalizeSessionKey(key);
  return RESERVED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

// ── 6. Exec Approval Depth Cap ───────────────────────────────────────

export function validateExecDepth(
  wrapperChain: string[],
  maxDepth?: number,
): { valid: boolean; depth: number; reason?: string } {
  const limit = maxDepth || MAX_DISPATCH_WRAPPER_DEPTH;

  if (wrapperChain.length > limit) {
    return {
      valid: false,
      depth: wrapperChain.length,
      reason: `Dispatch wrapper depth (${wrapperChain.length}) exceeds cap (${limit}). Failing closed.`,
    };
  }

  return { valid: true, depth: wrapperChain.length };
}

export function unwrapDispatchChain(argv: string[]): {
  executable: string;
  args: string[];
  wrapperChain: string[];
} {
  const wrapperChain: string[] = [];
  let remaining = [...argv];

  while (remaining.length > 0) {
    const candidate = remaining[0];
    if (SHELL_WRAPPERS.includes(candidate)) {
      wrapperChain.push(candidate);
      remaining = remaining.slice(1);
      while (remaining.length > 0 && remaining[0].startsWith('-')) {
        remaining = remaining.slice(1);
      }
    } else {
      break;
    }
  }

  return {
    executable: remaining[0] || '',
    args: remaining.slice(1),
    wrapperChain,
  };
}

// ── 7. Sandbox Media Path Validation ─────────────────────────────────

export function isHardLink(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.nlink > 1;
  } catch {
    return false;
  }
}

export function validateMediaPath(
  mediaPath: string,
  workspacePath: string,
  allowedTmpRoots?: string[],
): { valid: boolean; reason?: string } {
  const normalized = normalizeFsPath(mediaPath);

  if (isWithinWorkspace(normalized, workspacePath)) {
    return { valid: true };
  }

  const tmpRoots = allowedTmpRoots || [];
  for (const root of tmpRoots) {
    if (isWithinWorkspace(normalized, root)) {
      if (isHardLink(normalized)) {
        return {
          valid: false,
          reason: `Hard-linked media alias rejected: ${mediaPath}`,
        };
      }
      return { valid: true };
    }
  }

  return {
    valid: false,
    reason: `Media path "${mediaPath}" outside workspace and allowed tmp roots`,
  };
}

// ── Config Loader ────────────────────────────────────────────────────

export function loadSecurityConfig(workspacePath: string): SecurityConfig {
  const configPath = path.join(workspacePath, 'security.json');
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_SECURITY_CONFIG };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return mergeConfig(DEFAULT_SECURITY_CONFIG, raw);
  } catch {
    return { ...DEFAULT_SECURITY_CONFIG };
  }
}

function mergeConfig(
  defaults: SecurityConfig,
  overrides: Partial<SecurityConfig>,
): SecurityConfig {
  return {
    trustModel: { ...defaults.trustModel, ...overrides.trustModel },
    sandbox: { ...defaults.sandbox, ...overrides.sandbox },
    exec: { ...defaults.exec, ...overrides.exec },
    heartbeat: { ...defaults.heartbeat, ...overrides.heartbeat },
  };
}

export {
  DEFAULT_SECURITY_CONFIG,
  DEFAULT_SAFE_BIN_DIRS,
  DANGEROUS_ENV_PATTERNS,
};
