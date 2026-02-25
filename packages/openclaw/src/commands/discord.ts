import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { ensureWorkspace, getWorkspacePath, loadConfig } from '../lib/workspace';
import type { Guild } from 'discord.js';
import { getDiscordClient, isDiscordConnected, disconnectDiscord } from '../lib/discord-client';

export function registerDiscordCommand(program: Command) {
  const discord = new Command('discord')
    .description('Discord bot management and status')
    .aliases(['d'])
    .exitOverride();

  discord
    .command('status')
    .description('Check Discord bot connection status')
    .action(async () => {
      try {
        const { name, config, path: wsPath } = ensureWorkspace();

        console.log(chalk.bold(`\nDiscord Status — ${name}\n`));

        if (!config.discord) {
          console.log(chalk.yellow('⚠ Discord not configured'));
          console.log(chalk.dim('  Run: openclaw discord configure --token <bot-token>'));
          return;
        }

        console.log(chalk.dim('Bot Token:') + ' ' + (config.discord.botToken ? '***' + config.discord.botToken.slice(-4) : 'not set'));
        console.log(chalk.dim('Application ID:') + ' ' + (config.discord.applicationId || 'not set'));
        console.log(chalk.dim('Guild ID:') + ' ' + (config.discord.guildId || 'not set'));
        console.log(chalk.dim('Text Channel:') + ' ' + (config.discord.textChannelId || 'not set'));
        console.log(chalk.dim('Forum Channel:') + ' ' + (config.discord.forumChannelId || 'not set'));

        const client = getDiscordClient();
        if (isDiscordConnected()) {
          console.log(chalk.green('\n✓ Connected'));

          const guilds: string[] = client.guilds.cache.map((g: Guild) => g.name);
          console.log(chalk.dim(`  Guilds: ${guilds.length}`));
          guilds.forEach((g: string) => console.log(chalk.dim(`    - ${g}`)));

          console.log(chalk.dim(`  Latency: ${client.ws.ping}ms`));
          console.log(chalk.dim(`  Uptime: ${Math.floor(client.uptime! / 1000 / 60)}min`));
        } else {
          console.log(chalk.yellow('\n⚠ Not connected'));
          console.log(chalk.dim('  Run: openclaw discord connect'));
        }
      } catch (err: any) {
        console.error(chalk.red('Error:'), err.message);
      }
    });

  discord
    .command('configure')
    .description('Configure Discord bot settings')
    .requiredOption('--token <token>', 'Discord bot token')
    .option('--app-id <id>', 'Application ID (Discord Developer Portal)')
    .option('--guild <id>', 'Guild ID')
    .option('--text-channel <id>', 'Text channel ID for commands')
    .option('--forum-channel <id>', 'Forum channel ID for posts')
    .option('--auto-respond', 'Enable auto-respond to mentions', false)
    .option('--respond-dms', 'Enable respond to DMs', false)
    .action(async (opts) => {
      try {
        const { name, config, path: wsPath } = ensureWorkspace();

        config.discord = {
          botToken: opts.token,
          applicationId: opts.appId || '',
          guildId: opts.guild,
          textChannelId: opts.textChannel,
          forumChannelId: opts.forumChannel,
          autoRespond: opts.autoRespond,
          respondToMentions: true,
          respondToDms: opts.respondDms,
          status: 'online',
          activity: `LOBSTR Protocol | ${name}`,
        };

        const configPath = path.join(wsPath, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        console.log(chalk.green('✓ Discord configured'));
        console.log(chalk.dim(`  Run: openclaw discord connect`));
      } catch (err: any) {
        console.error(chalk.red('Error:'), err.message);
      }
    });

  discord
    .command('connect')
    .description('Connect Discord bot to Discord')
    .action(async () => {
      try {
        const { name, config } = ensureWorkspace();

        if (!config.discord?.botToken) {
          console.log(chalk.yellow('⚠ Discord not configured'));
          console.log(chalk.dim('  Run: openclaw discord configure --token <bot-token>'));
          return;
        }

        console.log(chalk.bold(`\nConnecting ${name} to Discord...\n`));

        // This will be implemented in the discord-client lib
        const { connectDiscord } = await import('../lib/discord-client');
        await connectDiscord(config.discord.botToken, config.discord);

        console.log(chalk.green('✓ Connected'));
        console.log(chalk.dim(`  Run: openclaw agent start`));
      } catch (err: any) {
        console.error(chalk.red('Error:'), err.message);
      }
    });

  discord
    .command('disconnect')
    .description('Disconnect Discord bot')
    .action(async () => {
      try {
        console.log(chalk.bold('\nDisconnecting Discord bot...\n'));

        await disconnectDiscord();

        console.log(chalk.green('✓ Disconnected'));
      } catch (err: any) {
        console.error(chalk.red('Error:'), err.message);
      }
    });

  program.addCommand(discord);
}
