import { Command } from 'commander';
import { registerWalletCommands } from './commands/wallet';
import { registerStakeCommands } from './commands/stake';
import { registerMarketCommands } from './commands/market';
import { registerJobCommands } from './commands/job';
import { registerAirdropCommands } from './commands/airdrop';
import { registerRepCommands } from './commands/rep';
import { registerForumCommands } from './commands/forum';
import { registerProfileCommands } from './commands/profile';
import { registerMessageCommands } from './commands/messages';
import { registerModCommands } from './commands/mod';
import { registerArbitrateCommands } from './commands/arbitrate';
import { registerDaoCommands } from './commands/dao';
import { registerAdminCommands } from './commands/admin';

/**
 * Register all LOBSTR skill commands onto a commander program.
 * Called by the OpenClaw skill loader.
 */
export function registerCommands(program: Command): void {
  registerWalletCommands(program);
  registerStakeCommands(program);
  registerMarketCommands(program);
  registerJobCommands(program);
  registerAirdropCommands(program);
  registerRepCommands(program);
  registerForumCommands(program);
  registerProfileCommands(program);
  registerMessageCommands(program);
  registerModCommands(program);
  registerArbitrateCommands(program);
  registerDaoCommands(program);
  registerAdminCommands(program);
}
