import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { getWorkspacePath, loadConfig } from './workspace';
import { getActiveWorkspace } from './workspace';

interface CronJob {
  name: string;
  script: string;
  interval: string; // cron format
  lastRun?: number;
  running?: boolean;
}

const cronJobs: Map<string, CronJob> = new Map();
let cronInterval: NodeJS.Timeout | null = null;

export function runCronJobs(): void {
  const workspace = getActiveWorkspace();
  if (!workspace) {
    console.log('No active workspace, skipping cron');
    return;
  }

  const wsPath = getWorkspacePath(workspace);
  const cronDir = path.join(wsPath, 'cron');

  if (!fs.existsSync(cronDir)) {
    console.log(`Cron directory not found: ${cronDir}`);
    return;
  }

  // Load all cron scripts
  const files = fs.readdirSync(cronDir).filter(f => f.endsWith('.sh'));

  console.log(`Loading ${files.length} cron scripts...`);

  for (const file of files) {
    const scriptPath = path.join(cronDir, file);
    const jobName = file.replace('.sh', '');

    cronJobs.set(jobName, {
      name: jobName,
      script: scriptPath,
      interval: getIntervalForJob(jobName),
    });
  }

  // Start the cron scheduler
  startCronScheduler();

  console.log(`Cron scheduler started with ${cronJobs.size} jobs`);
}

function startCronScheduler(): void {
  // Run every minute
  cronInterval = setInterval(async () => {
    const now = new Date();
    const minute = now.getMinutes();
    const hour = now.getHours();
    const day = now.getDay();

    for (const [name, job] of cronJobs) {
      if (job.running) continue;

      const shouldRun = parseCronExpression(job.interval, minute, hour, day);
      if (shouldRun) {
        runCronJob(name, job);
      }
    }
  }, 60000); // Check every minute
}

function parseCronExpression(interval: string, minute: number, hour: number, day: number): boolean {
  // Simple cron parsing for common patterns
  // Format: "*/N" or "N" or "N,M" or "*"

  const parts = interval.split(' ');
  if (parts.length < 5) return false;

  const [, , , minutePart, hourPart] = parts;

  // Check minute
  if (minutePart === '*') {
    // ok
  } else if (minutePart.startsWith('*/')) {
    const step = parseInt(minutePart.slice(2));
    if (minute % step !== 0) return false;
  } else if (minutePart.includes(',')) {
    if (!minutePart.split(',').map(Number).includes(minute)) return false;
  } else if (minutePart !== minute.toString()) return false;

  // Check hour
  if (hourPart === '*') {
    // ok
  } else if (hourPart.startsWith('*/')) {
    const step = parseInt(hourPart.slice(2));
    if (hour % step !== 0) return false;
  } else if (hourPart.includes(',')) {
    if (!hourPart.split(',').map(Number).includes(hour)) return false;
  } else if (hourPart !== hour.toString()) return false;

  return true;
}

function getIntervalForJob(jobName: string): string {
  // Map job names to their cron intervals
  const intervals: Record<string, string> = {
    'heartbeat-check': '*/5 * * * *',
    'action-runner': '*/1 * * * *',
    'channel-monitor': '*/1 * * * *',
    'notification-poll': '*/5 * * * *',
    'inbox-handler': '*/15 * * * *',
    'forum-patrol': '*/20 * * * *',
    'forum-engage': '*/45 * * * *',
    'forum-post': '0 */8 * * *',
    'mod-queue': '*/15 * * * *',
    'dispute-watcher': '*/30 * * * *',
    'proposal-monitor': '0 * * * *',
    'treasury-health': '0 */4 * * *',
    'security-audit': '0 9 * * *',
    'dao-orchestrator': '*/15 * * * *',
    'lightning-watcher': '*/15 * * * *',
  };

  return intervals[jobName] || '*/15 * * * *';
}

async function runCronJob(name: string, job: CronJob): Promise<void> {
  console.log(chalk.dim(`[cron] Running: ${name}`));
  job.running = true;

  const startTime = Date.now();

  try {
    const { execSync } = await import('child_process');

    execSync(`bash "${job.script}"`, {
      cwd: path.dirname(job.script),
      env: {
        ...process.env,
        WORKSPACE: getActiveWorkspace() || '',
      },
      stdio: 'pipe',
    });

    job.lastRun = Date.now();
    const duration = Date.now() - startTime;
    console.log(chalk.green(`[cron] Completed: ${name} (${duration}ms)`));
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.log(chalk.red(`[cron] Failed: ${name} (${duration}ms) - ${err.message}`));
  } finally {
    job.running = false;
  }
}

export function stopCronJobs(): void {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
  }
  cronJobs.clear();
}

export function getCronStatus(): { jobs: string[]; running: number; lastRun: number } {
  const jobs = Array.from(cronJobs.keys());
  const running = Array.from(cronJobs.values()).filter(j => j.running).length;
  const lastRun = Math.max(...Array.from(cronJobs.values()).map(j => j.lastRun || 0));

  return { jobs, running, lastRun };
}
