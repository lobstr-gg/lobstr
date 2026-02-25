import { Client, GatewayIntentBits, ActivityType, REST, Routes, Partials, Guild, Channel } from 'discord.js';
import type { DiscordConfig, DiscordStatus } from '../types';

let discordClient: Client | null = null;
let startTime: number = 0;

export function getDiscordClient(): Client {
  if (!discordClient) {
    throw new Error('Discord client not initialized. Run: openclaw discord connect');
  }
  return discordClient;
}

export function isDiscordConnected(): boolean {
  return discordClient?.isReady() ?? false;
}

export async function connectDiscord(token: string, config: DiscordConfig): Promise<void> {
  if (discordClient?.isReady()) {
    console.log('Discord client already connected');
    return;
  }

  discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.Reaction],
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, 30000);

    discordClient!.once('ready', () => {
      clearTimeout(timeout);
      startTime = Date.now();

      // Set presence
      if (config.status || config.activity) {
        discordClient!.user?.setPresence({
          status: config.status || 'online',
          activities: config.activity ? [{
            name: config.activity,
            type: ActivityType.Playing,
          }] : [],
        });
      }

      console.log(`Discord bot logged in as: ${discordClient!.user?.tag}`);
      resolve();
    });

    discordClient!.once('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });

    discordClient!.login(token);
  });
}

export async function disconnectDiscord(): Promise<void> {
  if (discordClient) {
    discordClient.destroy();
    discordClient = null;
    startTime = 0;
  }
}

export function getDiscordStatus(): DiscordStatus {
  if (!discordClient || !discordClient.isReady()) {
    return {
      connected: false,
      guilds: [],
      channels: { text: 0, voice: 0, forums: 0 },
    };
  }

  let textChannels = 0;
  let voiceChannels = 0;
  let forums = 0;

  discordClient.guilds.cache.forEach((guild: Guild) => {
    textChannels += guild.channels.cache.filter((c: Channel) => c.type === 0).size;
    voiceChannels += guild.channels.cache.filter((c: Channel) => c.type === 2).size;
    forums += guild.channels.cache.filter((c: Channel) => c.type === 15).size;
  });

  return {
    connected: true,
    guilds: discordClient.guilds.cache.map((g: Guild) => g.id),
    channels: {
      text: textChannels,
      voice: voiceChannels,
      forums,
    },
    latency: discordClient.ws.ping,
    uptime: startTime > 0 ? Date.now() - startTime : 0,
  };
}

// Export client events for agent to listen to
export function onMessage(handler: (message: any) => void): void {
  if (!discordClient) return;

  discordClient.on('messageCreate', handler);
}

export function onInteraction(handler: (interaction: any) => void): void {
  if (!discordClient) return;

  discordClient.on('interactionCreate', handler);
}

export async function sendMessage(channelId: string, content: string): Promise<void> {
  const client = getDiscordClient();
  const channel = await client.channels.fetch(channelId);

  if (!channel || !('send' in channel)) {
    throw new Error('Channel not found or not text-based');
  }

  await (channel as any).send(content);
}
