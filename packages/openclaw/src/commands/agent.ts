import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { ensureWorkspace, getWorkspacePath, loadConfig } from '../lib/workspace';
import { getDiscordClient, isDiscordConnected, connectDiscord, disconnectDiscord } from '../lib/discord-client';
import { runCronJobs } from '../lib/cron-runner';
import { startHeartbeatWorker, stopHeartbeatWorker } from '../lib/heartbeat-worker';
import type { Message } from 'discord.js';
import type { WorkspaceConfig, AgentConfig } from '../types';

let agentRunning = false;
let agentConfig: AgentConfig | null = null;

export function registerAgentCommand(program: Command) {
  const agent = new Command('agent')
    .description('Autonomous agent management')
    .exitOverride();

  agent
    .command('start')
    .description('Start the autonomous agent')
    .option('--no-cron', 'Disable cron jobs')
    .option('--no-heartbeat', 'Disable heartbeat worker')
    .option('--llm <provider>', 'LLM provider: openai, anthropic, ollama')
    .option('--model <model>', 'Model name')
    .option('--api-key <key>', 'LLM API key')
    .action(async (opts) => {
      try {
        const { name, config } = ensureWorkspace();

        if (!config.discord?.botToken) {
          console.log(chalk.yellow('⚠ Discord not configured'));
          console.log(chalk.dim('  Run: openclaw discord configure --token <bot-token>'));
          console.log(chalk.dim('  Then: openclaw discord connect'));
          return;
        }

        console.log(chalk.bold(`\nStarting agent: ${name}\n`));

        // Connect Discord if not already
        if (!isDiscordConnected()) {
          console.log(chalk.dim('Connecting to Discord...'));
          await connectDiscord(config.discord.botToken, config.discord);
        }

        // Build agent config
        agentConfig = {
          llm: {
            provider: (opts.llm || (config.agent as any)?.llm?.provider || 'openai'),
            model: opts.model || (config.agent as any)?.llm?.model || 'gpt-4o',
            apiKey: opts.apiKey || (config.agent as any)?.llm?.apiKey || process.env.OPENAI_API_KEY,
          },
          cron: {
            enabled: opts.cron !== false,
            ...(config.agent?.cron || {}),
          },
          heartbeat: {
            enabled: opts.heartbeat !== false,
            ...(config.agent?.heartbeat || {}),
          },
        };

        agentRunning = true;

        // Start cron jobs if enabled
        if (agentConfig.cron?.enabled) {
          console.log(chalk.dim('Starting cron scheduler...'));
          runCronJobs();
        }

        // Start heartbeat worker if enabled
        if (agentConfig.heartbeat?.enabled) {
          console.log(chalk.dim('Starting heartbeat worker...'));
          await startHeartbeatWorker();
        }

        // Set up message handlers
        setupMessageHandlers(config);

        console.log(chalk.green('\n✓ Agent running'));
        console.log(chalk.dim('  Press Ctrl+C to stop\n'));

        // Keep process alive
        process.on('SIGINT', async () => {
          console.log(chalk.yellow('\n\nShutting down agent...'));
          await stopAgent();
          process.exit(0);
        });

      } catch (err: any) {
        console.error(chalk.red('Error:'), err.message);
      }
    });

  agent
    .command('stop')
    .description('Stop the running agent')
    .action(async () => {
      await stopAgent();
    });

  agent
    .command('status')
    .description('Check agent status')
    .action(async () => {
      try {
        const { name, config } = ensureWorkspace();

        console.log(chalk.bold(`\nAgent Status — ${name}\n`));

        if (!agentRunning) {
          console.log(chalk.yellow('⚠ Agent not running'));
          console.log(chalk.dim('  Run: openclaw agent start'));
          return;
        }

        console.log(chalk.green('✓ Running'));

        if (config.discord?.botToken) {
          console.log(chalk.dim('\nDiscord:') + (isDiscordConnected() ? chalk.green(' connected') : chalk.yellow(' disconnected')));
        }

        if (agentConfig?.cron?.enabled) {
          console.log(chalk.dim('Cron: enabled'));
        }

        if (agentConfig?.heartbeat?.enabled) {
          console.log(chalk.dim('Heartbeat: enabled'));
        }

        if (agentConfig?.llm) {
          console.log(chalk.dim(`LLM: ${agentConfig.llm.provider || 'openai'}/${agentConfig.llm.model || 'gpt-4o'}`));
        }
      } catch (err: any) {
        console.error(chalk.red('Error:'), err.message);
      }
    });

  agent
    .command('configure')
    .description('Configure agent settings')
    .option('--llm <provider>', 'LLM provider: openai, anthropic, ollama')
    .option('--model <model>', 'Model name')
    .option('--api-key <key>', 'API key (or set env var)')
    .option('--no-cron', 'Disable cron jobs')
    .option('--no-heartbeat', 'Disable heartbeat')
    .option('--sandbox <mode>', 'Sandbox mode: all, docker, none')
    .action(async (opts) => {
      try {
        const { path: wsPath, config } = ensureWorkspace();

        // Ensure nested structures exist
        // Ensure all nested structures exist
        config.agent = config.agent || {};
        config.agent.llm = config.agent.llm || {};
        config.agent.cron = config.agent.cron || {};
        config.agent.heartbeat = config.agent.heartbeat || {};
        config.agent.security = config.agent.security || {};

        if (opts.llm) (config.agent.llm as any).provider = opts.llm;
        if (opts.model) config.agent.llm!.model = opts.model;
        if (opts.apiKey) config.agent.llm!.apiKey = opts.apiKey;
        if (opts.cron !== undefined) config.agent.cron!.enabled = opts.cron;
        if (opts.heartbeat !== undefined) config.agent.heartbeat!.enabled = opts.heartbeat;
        if (opts.sandbox) (config.agent.security as any).sandboxMode = opts.sandbox;

        const configPath = path.join(wsPath, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        console.log(chalk.green('✓ Agent configured'));
      } catch (err: any) {
        console.error(chalk.red('Error:'), err.message);
      }
    });

  program.addCommand(agent);
}

async function stopAgent() {
  agentRunning = false;
  agentConfig = null;

  try {
    await stopHeartbeatWorker();
    console.log(chalk.dim('Heartbeat worker stopped'));
  } catch {}

  try {
    await disconnectDiscord();
    console.log(chalk.dim('Discord disconnected'));
  } catch {}

  console.log(chalk.green('\n✓ Agent stopped'));
}

function setupMessageHandlers(config: WorkspaceConfig) {
  const client = getDiscordClient();
  const discordConfig = config.discord;

  // Handle mentions
  if (discordConfig?.autoRespond || discordConfig?.respondToMentions) {
    client.on('messageCreate', async (message: Message) => {
      if (message.author.bot) return;
      if (!message.mentions.has(client.user!)) return;

      // Check if in allowed channel
      if (discordConfig.textChannelId && message.channelId !== discordConfig.textChannelId) {
        return;
      }

      try {
        const response = await processMessage(message.content, message.author.username);
        await message.reply(response);
      } catch (err: any) {
        console.error(chalk.red('Error processing message:'), err.message);
        await message.reply('Sorry, I encountered an error processing your request.');
      }
    });
  }

  // Handle DMs
  if (discordConfig?.respondToDms) {
    client.on('messageCreate', async (message: Message) => {
      if (message.author.bot) return;
      if (!message.guild) {
        // DM
        try {
          const response = await processMessage(message.content, message.author.username);
          await message.reply(response);
        } catch (err: any) {
          console.error(chalk.red('Error processing DM:'), err.message);
        }
      }
    });
  }

  console.log(chalk.dim('Message handlers registered'));
}

async function processMessage(content: string, username: string): Promise<string> {
  // Remove mention from content
  const cleanContent = content.replace(/<@\d+>/g, '').trim();

  // This is where we'd integrate with LLM
  // For now, return a basic acknowledgment
  if (!agentConfig?.llm?.apiKey) {
    return `Hi ${username}! I'm online but need an LLM API key configured. Run: openclaw agent configure --llm openai --api-key <key>`;
  }

  // TODO: Call LLM API
  return `Hi ${username}! I received: "${cleanContent.substring(0, 100)}...". LLM integration coming soon.`;
}
