import { Command } from 'commander';
import { ensureWorkspace } from '../lib/workspace';
import { startDaemon, stopDaemon, getDaemonStatus } from '../lib/heartbeat-daemon';
import * as ui from '../lib/ui';

export function registerHeartbeatCommand(program: Command): void {
  const hb = program
    .command('heartbeat')
    .description('Manage heartbeat daemon');

  hb.command('start')
    .description('Start the heartbeat daemon')
    .action(() => {
      try {
        const ws = ensureWorkspace();
        const pid = startDaemon(ws.path);
        ui.success(`Heartbeat daemon started (PID ${pid})`);
        ui.info('Recording heartbeats every 5 minutes');
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  hb.command('stop')
    .description('Stop the heartbeat daemon')
    .action(() => {
      try {
        const ws = ensureWorkspace();
        stopDaemon(ws.path);
        ui.success('Heartbeat daemon stopped');
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  hb.command('status')
    .description('Show heartbeat daemon status')
    .action(() => {
      try {
        const ws = ensureWorkspace();
        const status = getDaemonStatus(ws.path);

        ui.header('Heartbeat Status');
        console.log(`  Running:     ${status.running ? 'yes' : 'no'}`);
        if (status.pid) {
          console.log(`  PID:         ${status.pid}`);
        }
        console.log(`  Heartbeats:  ${status.heartbeatCount}`);
        if (status.lastHeartbeat) {
          const ago = Math.floor((Date.now() / 1000) - status.lastHeartbeat);
          console.log(`  Last:        ${ago}s ago (${new Date(status.lastHeartbeat * 1000).toISOString()})`);
        }
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
