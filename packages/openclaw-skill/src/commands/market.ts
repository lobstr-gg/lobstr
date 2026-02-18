import { Command } from 'commander';
import { parseAbi, parseUnits } from 'viem';
import {
  ensureWorkspace,
  createPublicClient,
  createWalletClient,
  getContractAddress,
  loadWallet,
  SERVICE_REGISTRY_ABI,
} from 'openclaw';
import * as ui from 'openclaw';
import { categoryToIndex, CATEGORY_NAMES, formatLob, CATEGORIES } from '../lib/format';

export function registerMarketCommands(program: Command): void {
  const market = program
    .command('market')
    .description('Manage service listings');

  market
    .command('create')
    .description('Create a new service listing')
    .requiredOption('--title <title>', 'Listing title')
    .requiredOption('--category <category>', `Category (${Object.keys(CATEGORIES).join(', ')})`)
    .requiredOption('--price <price>', 'Price per unit in LOB')
    .option('--description <desc>', 'Listing description', '')
    .option('--delivery <seconds>', 'Estimated delivery time in seconds', '86400')
    .option('--metadata <uri>', 'Metadata URI (IPFS, etc.)', '')
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const registryAbi = parseAbi(SERVICE_REGISTRY_ABI as unknown as string[]);
        const registryAddr = getContractAddress(ws.config, 'serviceRegistry');
        const tokenAddr = getContractAddress(ws.config, 'lobToken');

        const spin = ui.spinner('Creating listing...');
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);

        const categoryIdx = categoryToIndex(opts.category);
        const price = parseUnits(opts.price, 18);
        const delivery = parseInt(opts.delivery, 10);

        const tx = await walletClient.writeContract({
          address: registryAddr,
          abi: registryAbi,
          functionName: 'createListing',
          args: [categoryIdx, opts.title, opts.description, price, tokenAddr, BigInt(delivery), opts.metadata],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed('Listing created');
        ui.info(`Title: ${opts.title}`);
        ui.info(`Category: ${opts.category}`);
        ui.info(`Price: ${opts.price} LOB`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  market
    .command('list')
    .description('List your active listings')
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const registryAbi = parseAbi(SERVICE_REGISTRY_ABI as unknown as string[]);
        const registryAddr = getContractAddress(ws.config, 'serviceRegistry');

        const publicClient = createPublicClient(ws.config);
        const wallet = loadWallet(ws.path);
        const address = wallet.address as `0x${string}`;

        const spin = ui.spinner('Fetching listings...');

        const count = await publicClient.readContract({
          address: registryAddr,
          abi: registryAbi,
          functionName: 'getProviderListingCount',
          args: [address],
        }) as bigint;

        if (count === 0n) {
          spin.succeed('No listings found');
          return;
        }

        // Fetch listings by ID (1-indexed up to count, but we need to search)
        const listings = [];
        for (let i = 1n; i <= count + 10n; i++) {
          try {
            const listing = await publicClient.readContract({
              address: registryAddr,
              abi: registryAbi,
              functionName: 'getListing',
              args: [i],
            }) as any;
            if (listing.provider.toLowerCase() === address.toLowerCase()) {
              listings.push(listing);
            }
          } catch { break; }
          if (BigInt(listings.length) >= count) break;
        }

        spin.succeed(`${listings.length} listing(s)`);

        ui.table(
          ['ID', 'Title', 'Category', 'Price', 'Active'],
          listings.map((l: any) => [
            l.id.toString(),
            l.title,
            CATEGORY_NAMES[Number(l.category)] || 'Unknown',
            formatLob(l.pricePerUnit),
            l.active ? 'Yes' : 'No',
          ])
        );
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  market
    .command('update <id>')
    .description('Update a listing')
    .option('--title <title>', 'New title')
    .option('--description <desc>', 'New description')
    .option('--price <price>', 'New price in LOB')
    .option('--delivery <seconds>', 'New delivery time')
    .option('--metadata <uri>', 'New metadata URI')
    .action(async (id: string, opts) => {
      try {
        const ws = ensureWorkspace();
        const registryAbi = parseAbi(SERVICE_REGISTRY_ABI as unknown as string[]);
        const registryAddr = getContractAddress(ws.config, 'serviceRegistry');
        const tokenAddr = getContractAddress(ws.config, 'lobToken');

        const publicClient = createPublicClient(ws.config);

        // Get current listing values
        const current = await publicClient.readContract({
          address: registryAddr,
          abi: registryAbi,
          functionName: 'getListing',
          args: [BigInt(id)],
        }) as any;

        const spin = ui.spinner('Updating listing...');
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);

        const title = opts.title || current.title;
        const description = opts.description || current.description;
        const price = opts.price ? parseUnits(opts.price, 18) : current.pricePerUnit;
        const delivery = opts.delivery ? BigInt(opts.delivery) : current.estimatedDeliverySeconds;
        const metadata = opts.metadata || current.metadataURI;
        const settlement = current.settlementToken;

        const tx = await walletClient.writeContract({
          address: registryAddr,
          abi: registryAbi,
          functionName: 'updateListing',
          args: [BigInt(id), title, description, price, settlement, delivery, metadata],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Listing #${id} updated`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  market
    .command('deactivate <id>')
    .description('Deactivate a listing')
    .action(async (id: string) => {
      try {
        const ws = ensureWorkspace();
        const registryAbi = parseAbi(SERVICE_REGISTRY_ABI as unknown as string[]);
        const registryAddr = getContractAddress(ws.config, 'serviceRegistry');

        const spin = ui.spinner('Deactivating listing...');
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);

        const tx = await walletClient.writeContract({
          address: registryAddr,
          abi: registryAbi,
          functionName: 'deactivateListing',
          args: [BigInt(id)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Listing #${id} deactivated`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
