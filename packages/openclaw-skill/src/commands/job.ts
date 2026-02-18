import { Command } from 'commander';
import { parseAbi, parseUnits } from 'viem';
import {
  ensureWorkspace,
  createPublicClient,
  createWalletClient,
  getContractAddress,
  loadWallet,
  ESCROW_ENGINE_ABI,
  SERVICE_REGISTRY_ABI,
  LOB_TOKEN_ABI,
} from 'openclaw';
import * as ui from 'openclaw';
import { JOB_STATUS, formatLob, CATEGORY_NAMES } from '../lib/format';

export function registerJobCommands(program: Command): void {
  const job = program
    .command('job')
    .description('Manage escrow jobs');

  job
    .command('create')
    .description('Create a job from a listing')
    .requiredOption('--listing <id>', 'Listing ID')
    .requiredOption('--amount <amount>', 'Payment amount in LOB')
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const escrowAbi = parseAbi(ESCROW_ENGINE_ABI as unknown as string[]);
        const registryAbi = parseAbi(SERVICE_REGISTRY_ABI as unknown as string[]);
        const tokenAbi = parseAbi(LOB_TOKEN_ABI as unknown as string[]);
        const escrowAddr = getContractAddress(ws.config, 'escrowEngine');
        const registryAddr = getContractAddress(ws.config, 'serviceRegistry');
        const tokenAddr = getContractAddress(ws.config, 'lobToken');

        const publicClient = createPublicClient(ws.config);

        // Get listing to find seller
        const listingResult = await publicClient.readContract({
          address: registryAddr,
          abi: registryAbi,
          functionName: 'getListing',
          args: [BigInt(opts.listing)],
        }) as any;

        const listing = {
          id: listingResult.id ?? listingResult[0],
          provider: listingResult.provider ?? listingResult[1],
          category: listingResult.category ?? listingResult[2],
          title: listingResult.title ?? listingResult[3],
          description: listingResult.description ?? listingResult[4],
          pricePerUnit: listingResult.pricePerUnit ?? listingResult[5],
          settlementToken: listingResult.settlementToken ?? listingResult[6],
          estimatedDeliverySeconds: listingResult.estimatedDeliverySeconds ?? listingResult[7],
          metadataURI: listingResult.metadataURI ?? listingResult[8],
          active: listingResult.active ?? listingResult[9],
          createdAt: listingResult.createdAt ?? listingResult[10],
        };

        const spin = ui.spinner('Creating job...');
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const parsedAmount = parseUnits(opts.amount, 18);

        // Approve token transfer
        spin.text = 'Approving LOB transfer...';
        const approveTx = await walletClient.writeContract({
          address: tokenAddr,
          abi: tokenAbi,
          functionName: 'approve',
          args: [escrowAddr, parsedAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });

        // Create job
        spin.text = 'Creating job...';
        const tx = await walletClient.writeContract({
          address: escrowAddr,
          abi: escrowAbi,
          functionName: 'createJob',
          args: [BigInt(opts.listing), listing.provider, parsedAmount, tokenAddr],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed('Job created');
        ui.info(`Listing: #${opts.listing} — ${listing.title}`);
        ui.info(`Amount: ${opts.amount} LOB`);
        ui.info(`Seller: ${listing.provider}`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  job
    .command('deliver <id>')
    .description('Submit delivery for a job')
    .requiredOption('--evidence <uri>', 'Delivery evidence URI')
    .action(async (id: string, opts) => {
      try {
        const ws = ensureWorkspace();
        const escrowAbi = parseAbi(ESCROW_ENGINE_ABI as unknown as string[]);
        const escrowAddr = getContractAddress(ws.config, 'escrowEngine');

        const spin = ui.spinner('Submitting delivery...');
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);

        const tx = await walletClient.writeContract({
          address: escrowAddr,
          abi: escrowAbi,
          functionName: 'submitDelivery',
          args: [BigInt(id), opts.evidence],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Delivery submitted for job #${id}`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  job
    .command('confirm <id>')
    .description('Confirm delivery as buyer')
    .action(async (id: string) => {
      try {
        const ws = ensureWorkspace();
        const escrowAbi = parseAbi(ESCROW_ENGINE_ABI as unknown as string[]);
        const escrowAddr = getContractAddress(ws.config, 'escrowEngine');

        const spin = ui.spinner('Confirming delivery...');
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);

        const tx = await walletClient.writeContract({
          address: escrowAddr,
          abi: escrowAbi,
          functionName: 'confirmDelivery',
          args: [BigInt(id)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Delivery confirmed for job #${id}`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  job
    .command('dispute <id>')
    .description('Initiate a dispute')
    .requiredOption('--evidence <uri>', 'Evidence URI')
    .action(async (id: string, opts) => {
      try {
        const ws = ensureWorkspace();
        const escrowAbi = parseAbi(ESCROW_ENGINE_ABI as unknown as string[]);
        const escrowAddr = getContractAddress(ws.config, 'escrowEngine');

        const spin = ui.spinner('Initiating dispute...');
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);

        const tx = await walletClient.writeContract({
          address: escrowAddr,
          abi: escrowAbi,
          functionName: 'initiateDispute',
          args: [BigInt(id), opts.evidence],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Dispute initiated for job #${id}`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  job
    .command('status <id>')
    .description('Check job status')
    .action(async (id: string) => {
      try {
        const ws = ensureWorkspace();
        const escrowAbi = parseAbi(ESCROW_ENGINE_ABI as unknown as string[]);
        const escrowAddr = getContractAddress(ws.config, 'escrowEngine');

        const spin = ui.spinner('Fetching job...');
        const publicClient = createPublicClient(ws.config);

        const jobResult = await publicClient.readContract({
          address: escrowAddr,
          abi: escrowAbi,
          functionName: 'getJob',
          args: [BigInt(id)],
        }) as any;

        const jobData = {
          id: jobResult.id ?? jobResult[0],
          listingId: jobResult.listingId ?? jobResult[1],
          buyer: jobResult.buyer ?? jobResult[2],
          seller: jobResult.seller ?? jobResult[3],
          amount: jobResult.amount ?? jobResult[4],
          token: jobResult.token ?? jobResult[5],
          fee: jobResult.fee ?? jobResult[6],
          status: jobResult.status ?? jobResult[7],
          createdAt: jobResult.createdAt ?? jobResult[8],
          disputeWindowEnd: jobResult.disputeWindowEnd ?? jobResult[9],
          deliveryMetadataURI: jobResult.deliveryMetadataURI ?? jobResult[10],
        };

        spin.succeed(`Job #${id}`);
        console.log(`  Listing:  #${jobData.listingId}`);
        console.log(`  Buyer:    ${jobData.buyer}`);
        console.log(`  Seller:   ${jobData.seller}`);
        console.log(`  Amount:   ${formatLob(jobData.amount)}`);
        console.log(`  Fee:      ${formatLob(jobData.fee)}`);
        console.log(`  Status:   ${JOB_STATUS[Number(jobData.status)] || 'Unknown'}`);
        console.log(`  Created:  ${new Date(Number(jobData.createdAt) * 1000).toISOString()}`);
        if (jobData.disputeWindowEnd > 0n) {
          console.log(`  Dispute window: ${new Date(Number(jobData.disputeWindowEnd) * 1000).toISOString()}`);
        }
        if (jobData.deliveryMetadataURI) {
          console.log(`  Delivery: ${jobData.deliveryMetadataURI}`);
        }
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  job
    .command('list')
    .description('List jobs (recent)')
    .option('--status <status>', 'Filter by status')
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const escrowAbi = parseAbi(ESCROW_ENGINE_ABI as unknown as string[]);
        const escrowAddr = getContractAddress(ws.config, 'escrowEngine');

        const publicClient = createPublicClient(ws.config);
        const wallet = loadWallet(ws.path);
        const address = wallet.address.toLowerCase();

        const spin = ui.spinner('Fetching jobs...');

        // Scan recent job IDs
        const jobs = [];
        for (let i = 1n; i <= 100n; i++) {
          try {
            const jobResult = await publicClient.readContract({
              address: escrowAddr,
              abi: escrowAbi,
              functionName: 'getJob',
              args: [i],
            }) as any;

            const jobData = {
              id: jobResult.id ?? jobResult[0],
              listingId: jobResult.listingId ?? jobResult[1],
              buyer: jobResult.buyer ?? jobResult[2],
              seller: jobResult.seller ?? jobResult[3],
              amount: jobResult.amount ?? jobResult[4],
              token: jobResult.token ?? jobResult[5],
              fee: jobResult.fee ?? jobResult[6],
              status: jobResult.status ?? jobResult[7],
              createdAt: jobResult.createdAt ?? jobResult[8],
              disputeWindowEnd: jobResult.disputeWindowEnd ?? jobResult[9],
              deliveryMetadataURI: jobResult.deliveryMetadataURI ?? jobResult[10],
            };

            const isMine =
              jobData.buyer.toLowerCase() === address ||
              jobData.seller.toLowerCase() === address;

            if (isMine) {
              if (opts.status) {
                const statusNum = Object.entries(JOB_STATUS).find(
                  ([, v]) => v.toLowerCase() === opts.status.toLowerCase()
                )?.[0];
                if (statusNum && Number(jobData.status) !== Number(statusNum)) continue;
              }
              jobs.push(jobData);
            }
          } catch { break; }
        }

        spin.succeed(`${jobs.length} job(s)`);

        if (jobs.length === 0) {
          ui.info('No jobs found');
          return;
        }

        ui.table(
          ['ID', 'Role', 'Amount', 'Status', 'Created'],
          jobs.map((j: any) => [
            j.id.toString(),
            j.buyer.toLowerCase() === address ? 'Buyer' : 'Seller',
            formatLob(j.amount),
            JOB_STATUS[Number(j.status)] || 'Unknown',
            new Date(Number(j.createdAt) * 1000).toLocaleDateString(),
          ])
        );
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
