import * as fs from 'fs';
import * as path from 'path';
import { fork } from 'child_process';

function getPidPath(workspacePath: string): string {
  return path.join(workspacePath, 'heartbeat.pid');
}

function getHeartbeatsPath(workspacePath: string): string {
  return path.join(workspacePath, 'heartbeats.jsonl');
}

export function isDaemonRunning(workspacePath: string): boolean {
  const pidPath = getPidPath(workspacePath);
  if (!fs.existsSync(pidPath)) return false;

  const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim(), 10);
  try {
    process.kill(pid, 0); // Signal 0 = just check if process exists
    return true;
  } catch {
    // Process not running, clean up stale PID file
    fs.unlinkSync(pidPath);
    return false;
  }
}

export function startDaemon(workspacePath: string): number {
  if (isDaemonRunning(workspacePath)) {
    const pid = parseInt(fs.readFileSync(getPidPath(workspacePath), 'utf-8').trim(), 10);
    throw new Error(`Heartbeat daemon already running (PID ${pid})`);
  }

  const workerPath = path.join(__dirname, 'heartbeat-worker.js');
  const child = fork(workerPath, [workspacePath], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  const pid = child.pid!;
  fs.writeFileSync(getPidPath(workspacePath), pid.toString());
  return pid;
}

export function stopDaemon(workspacePath: string): void {
  const pidPath = getPidPath(workspacePath);
  if (!fs.existsSync(pidPath)) {
    throw new Error('No heartbeat daemon running');
  }

  const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim(), 10);
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Already dead
  }
  fs.unlinkSync(pidPath);
}

export function getDaemonStatus(workspacePath: string): {
  running: boolean;
  pid: number | null;
  heartbeatCount: number;
  lastHeartbeat: number | null;
} {
  const running = isDaemonRunning(workspacePath);
  let pid: number | null = null;

  if (running) {
    pid = parseInt(fs.readFileSync(getPidPath(workspacePath), 'utf-8').trim(), 10);
  }

  let heartbeatCount = 0;
  let lastHeartbeat: number | null = null;

  const hbPath = getHeartbeatsPath(workspacePath);
  if (fs.existsSync(hbPath)) {
    const lines = fs.readFileSync(hbPath, 'utf-8').trim().split('\n').filter(Boolean);
    heartbeatCount = lines.length;
    if (lines.length > 0) {
      const last = JSON.parse(lines[lines.length - 1]);
      lastHeartbeat = last.timestamp;
    }
  }

  return { running, pid, heartbeatCount, lastHeartbeat };
}
