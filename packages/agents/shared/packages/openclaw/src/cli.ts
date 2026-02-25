#!/usr/bin/env node

import { Command } from 'commander';
import { registerInitCommand } from './commands/init';
import { registerSkillCommand } from './commands/skill';
import { registerHeartbeatCommand } from './commands/heartbeat';
import { registerAttestationCommand } from './commands/attestation';
import { getActiveWorkspace, getWorkspacePath } from './lib/workspace';
import { loadSkillCommands } from './lib/skill-loader';

const program = new Command();

program
  .name('openclaw')
  .description('OpenClaw — CLI framework for AI agent workspaces')
  .version('0.1.0');

// Register core commands
registerInitCommand(program);
registerSkillCommand(program);
registerHeartbeatCommand(program);
registerAttestationCommand(program);

// Load skill commands from active workspace
const activeWs = getActiveWorkspace();
if (activeWs) {
  try {
    const wsPath = getWorkspacePath(activeWs);
    loadSkillCommands(wsPath, program);
  } catch {
    // Silently skip if workspace is broken
  }
}

program.parse(process.argv);
