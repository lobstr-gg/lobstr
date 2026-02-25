import { Command } from 'commander';
import { parseAbi } from 'viem';
import {
  ensureWorkspace,
  createPublicClient,
  createWalletClient,
  getContractAddress,
  loadWallet,
} from 'openclaw';
import * as ui from 'openclaw';

const SKILL_REGISTRY_ABI = parseAbi([
  'function registerSkill(string name, string description, string metadataURI) returns (uint256)',
  'function updateSkill(uint256 skillId, string description, string metadataURI)',
  'function getSkill(uint256 skillId) view returns (uint256 id, address owner, string name, string description, string metadataURI, bool active, uint256 createdAt)',
  'function skillCount() view returns (uint256)',
  'function getOwnerSkills(address owner) view returns (uint256[])',
]);

export function registerSkillCommands(program: Command): void {
  const skill = program
    .command('skill')
    .description('Skill registry commands');

  // ── register ────────────────────────────────────────

  skill
    .command('register')
    .description('Register a new skill')
    .requiredOption('--name <name>', 'Skill name')
    .requiredOption('--description <desc>', 'Skill description')
    .requiredOption('--metadata <uri>', 'Metadata URI')
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const skillAddr = getContractAddress(ws.config, 'skillRegistry');

        const spin = ui.spinner('Registering skill...');
        const tx = await walletClient.writeContract({
          address: skillAddr,
          abi: SKILL_REGISTRY_ABI,
          functionName: 'registerSkill',
          args: [opts.name, opts.description, opts.metadata],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed('Skill registered');
        ui.info(`Name: ${opts.name}`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── update ──────────────────────────────────────────

  skill
    .command('update <id>')
    .description('Update an existing skill')
    .requiredOption('--description <desc>', 'New description')
    .requiredOption('--metadata <uri>', 'New metadata URI')
    .action(async (id: string, opts) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const skillAddr = getContractAddress(ws.config, 'skillRegistry');

        const spin = ui.spinner(`Updating skill #${id}...`);
        const tx = await walletClient.writeContract({
          address: skillAddr,
          abi: SKILL_REGISTRY_ABI,
          functionName: 'updateSkill',
          args: [BigInt(id), opts.description, opts.metadata],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Skill #${id} updated`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── list ────────────────────────────────────────────

  skill
    .command('list [address]')
    .description('List skills (own or for an address)')
    .action(async (address?: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const skillAddr = getContractAddress(ws.config, 'skillRegistry');

        let ownerAddr: `0x${string}`;
        if (address) {
          ownerAddr = address as `0x${string}`;
        } else {
          const wallet = loadWallet(ws.path);
          ownerAddr = wallet.address as `0x${string}`;
        }

        const spin = ui.spinner('Fetching skills...');
        const skillIds = await publicClient.readContract({
          address: skillAddr,
          abi: SKILL_REGISTRY_ABI,
          functionName: 'getOwnerSkills',
          args: [ownerAddr],
        }) as bigint[];

        if (skillIds.length === 0) {
          spin.succeed('No skills found');
          return;
        }

        const skills: any[] = [];
        for (const sid of skillIds) {
          const result = await publicClient.readContract({
            address: skillAddr,
            abi: SKILL_REGISTRY_ABI,
            functionName: 'getSkill',
            args: [sid],
          }) as any;

          skills.push({
            id: result.id ?? result[0],
            owner: result.owner ?? result[1],
            name: result.name ?? result[2],
            description: result.description ?? result[3],
            metadataURI: result.metadataURI ?? result[4],
            active: result.active ?? result[5],
            createdAt: result.createdAt ?? result[6],
          });
        }

        spin.succeed(`${skills.length} skill(s)`);
        ui.table(
          ['ID', 'Name', 'Description', 'Active', 'Created'],
          skills.map((s: any) => [
            s.id.toString(),
            s.name,
            s.description.length > 40 ? s.description.slice(0, 40) + '...' : s.description,
            s.active ? 'Yes' : 'No',
            new Date(Number(s.createdAt) * 1000).toLocaleDateString(),
          ])
        );
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── view ────────────────────────────────────────────

  skill
    .command('view <id>')
    .description('View skill details')
    .action(async (id: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const skillAddr = getContractAddress(ws.config, 'skillRegistry');

        const spin = ui.spinner(`Fetching skill #${id}...`);
        const result = await publicClient.readContract({
          address: skillAddr,
          abi: SKILL_REGISTRY_ABI,
          functionName: 'getSkill',
          args: [BigInt(id)],
        }) as any;

        const skillData = {
          id: result.id ?? result[0],
          owner: result.owner ?? result[1],
          name: result.name ?? result[2],
          description: result.description ?? result[3],
          metadataURI: result.metadataURI ?? result[4],
          active: result.active ?? result[5],
          createdAt: result.createdAt ?? result[6],
        };

        spin.succeed(`Skill #${id}`);
        console.log(`  Name:        ${skillData.name}`);
        console.log(`  Owner:       ${skillData.owner}`);
        console.log(`  Description: ${skillData.description}`);
        console.log(`  Metadata:    ${skillData.metadataURI}`);
        console.log(`  Active:      ${skillData.active ? 'Yes' : 'No'}`);
        console.log(`  Created:     ${new Date(Number(skillData.createdAt) * 1000).toISOString()}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
