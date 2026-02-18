import { Command } from 'commander';
import { createWorkspace, listWorkspaces, getActiveWorkspace } from '../lib/workspace';
import * as ui from '../lib/ui';

export function registerInitCommand(program: Command): void {
  program
    .command('init <name>')
    .description('Initialize a new OpenClaw workspace')
    .option('--chain <chain>', 'Target chain (base-sepolia, base)', 'base-sepolia')
    .action((name: string, opts: { chain: string }) => {
      try {
        const config = createWorkspace(name, opts.chain);
        ui.success(`Workspace "${name}" created`);
        ui.info(`Chain: ${opts.chain}`);
        ui.info(`Workspace ID: ${config.workspaceId.slice(0, 16)}...`);
        ui.info(`Path: ~/.openclaw/${name}/`);
        console.log();
        ui.info('Next steps:');
        console.log('  1. openclaw skill add lobstr');
        console.log('  2. lobstr wallet create');
        console.log('  3. openclaw heartbeat start');
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  program
    .command('workspaces')
    .description('List all workspaces')
    .action(() => {
      const workspaces = listWorkspaces();
      const active = getActiveWorkspace();

      if (workspaces.length === 0) {
        ui.info('No workspaces found. Run: openclaw init <name>');
        return;
      }

      ui.header('Workspaces');
      for (const ws of workspaces) {
        const marker = ws === active ? ' (active)' : '';
        console.log(`  ${ws}${marker}`);
      }
    });

  program
    .command('use <name>')
    .description('Switch active workspace')
    .action((name: string) => {
      const { setActiveWorkspace, loadConfig } = require('../lib/workspace');
      try {
        loadConfig(name); // Validate workspace exists
        setActiveWorkspace(name);
        ui.success(`Switched to workspace "${name}"`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
