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
import { SUBSCRIPTION_STATUS } from '../lib/format';

const SUBSCRIPTION_ENGINE_ABI = parseAbi([
  'function createSubscription(uint256 listingId, uint256 intervalDays, uint256 maxPayments)',
  'function cancelSubscription(uint256 subscriptionId)',
  'function renewSubscription(uint256 subscriptionId)',
  'function getSubscription(uint256 subId) view returns (uint256 id, address subscriber, uint256 listingId, uint256 intervalDays, uint256 paymentsLeft, uint256 nextPayment, uint8 status)',
  'function getSubscriberSubs(address subscriber) view returns (uint256[])',
  'function pauseSubscription(uint256 subscriptionId)',
  'function resumeSubscription(uint256 subscriptionId)',
]);

export function registerSubscribeCommands(program: Command): void {
  const subscribe = program
    .command('subscribe')
    .description('Subscription engine commands');

  // ── create ──────────────────────────────────────────

  subscribe
    .command('create')
    .description('Create a subscription')
    .requiredOption('--listing <id>', 'Listing ID')
    .requiredOption('--interval <days>', 'Payment interval in days')
    .requiredOption('--max-payments <n>', 'Maximum number of payments')
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const subAddr = getContractAddress(ws.config, 'subscriptionEngine');

        const spin = ui.spinner('Creating subscription...');
        const tx = await walletClient.writeContract({
          address: subAddr,
          abi: SUBSCRIPTION_ENGINE_ABI,
          functionName: 'createSubscription',
          args: [BigInt(opts.listing), BigInt(opts.interval), BigInt(opts.maxPayments)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed('Subscription created');
        ui.info(`Listing: #${opts.listing}`);
        ui.info(`Interval: ${opts.interval} days`);
        ui.info(`Max payments: ${opts.maxPayments}`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── cancel ──────────────────────────────────────────

  subscribe
    .command('cancel <id>')
    .description('Cancel a subscription')
    .action(async (id: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const subAddr = getContractAddress(ws.config, 'subscriptionEngine');

        const spin = ui.spinner(`Cancelling subscription #${id}...`);
        const tx = await walletClient.writeContract({
          address: subAddr,
          abi: SUBSCRIPTION_ENGINE_ABI,
          functionName: 'cancelSubscription',
          args: [BigInt(id)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Subscription #${id} cancelled`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── renew ───────────────────────────────────────────

  subscribe
    .command('renew <id>')
    .description('Renew a subscription')
    .action(async (id: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const subAddr = getContractAddress(ws.config, 'subscriptionEngine');

        const spin = ui.spinner(`Renewing subscription #${id}...`);
        const tx = await walletClient.writeContract({
          address: subAddr,
          abi: SUBSCRIPTION_ENGINE_ABI,
          functionName: 'renewSubscription',
          args: [BigInt(id)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Subscription #${id} renewed`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── pause ──────────────────────────────────────────

  subscribe
    .command('pause <id>')
    .description('Pause a subscription')
    .action(async (id: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const subAddr = getContractAddress(ws.config, 'subscriptionEngine');

        const spin = ui.spinner(`Pausing subscription #${id}...`);
        const tx = await walletClient.writeContract({
          address: subAddr,
          abi: SUBSCRIPTION_ENGINE_ABI,
          functionName: 'pauseSubscription',
          args: [BigInt(id)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Subscription #${id} paused`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── resume ─────────────────────────────────────────

  subscribe
    .command('resume <id>')
    .description('Resume a paused subscription')
    .action(async (id: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const subAddr = getContractAddress(ws.config, 'subscriptionEngine');

        const spin = ui.spinner(`Resuming subscription #${id}...`);
        const tx = await walletClient.writeContract({
          address: subAddr,
          abi: SUBSCRIPTION_ENGINE_ABI,
          functionName: 'resumeSubscription',
          args: [BigInt(id)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Subscription #${id} resumed`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── status ──────────────────────────────────────────

  subscribe
    .command('status <id>')
    .description('View subscription details')
    .action(async (id: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const subAddr = getContractAddress(ws.config, 'subscriptionEngine');

        const spin = ui.spinner(`Fetching subscription #${id}...`);
        const result = await publicClient.readContract({
          address: subAddr,
          abi: SUBSCRIPTION_ENGINE_ABI,
          functionName: 'getSubscription',
          args: [BigInt(id)],
        }) as any;

        const sub = {
          id: result.id ?? result[0],
          subscriber: result.subscriber ?? result[1],
          listingId: result.listingId ?? result[2],
          intervalDays: result.intervalDays ?? result[3],
          paymentsLeft: result.paymentsLeft ?? result[4],
          nextPayment: result.nextPayment ?? result[5],
          status: result.status ?? result[6],
        };

        spin.succeed(`Subscription #${id}`);
        console.log(`  Subscriber:    ${sub.subscriber}`);
        console.log(`  Listing:       #${sub.listingId}`);
        console.log(`  Interval:      ${sub.intervalDays.toString()} days`);
        console.log(`  Payments left: ${sub.paymentsLeft.toString()}`);
        console.log(`  Next payment:  ${new Date(Number(sub.nextPayment) * 1000).toISOString()}`);
        console.log(`  Status:        ${SUBSCRIPTION_STATUS[Number(sub.status)] || 'Unknown'}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── list ───────────────────────────────────────────

  subscribe
    .command('list')
    .description('List your subscriptions')
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const w = loadWallet(ws.path);
        const address = w.address as `0x${string}`;
        const subAddr = getContractAddress(ws.config, 'subscriptionEngine');

        const spin = ui.spinner('Loading subscriptions...');
        const ids = await publicClient.readContract({
          address: subAddr,
          abi: SUBSCRIPTION_ENGINE_ABI,
          functionName: 'getSubscriberSubs',
          args: [address],
        }) as bigint[];

        if (ids.length === 0) {
          spin.succeed('No subscriptions found');
          return;
        }

        const subs: any[] = [];
        for (const subId of ids) {
          const result = await publicClient.readContract({
            address: subAddr,
            abi: SUBSCRIPTION_ENGINE_ABI,
            functionName: 'getSubscription',
            args: [subId],
          }) as any;

          subs.push({
            id: (result.id ?? result[0]).toString(),
            listingId: (result.listingId ?? result[2]).toString(),
            intervalDays: (result.intervalDays ?? result[3]).toString(),
            paymentsLeft: (result.paymentsLeft ?? result[4]).toString(),
            nextPayment: Number(result.nextPayment ?? result[5]),
            status: Number(result.status ?? result[6]),
          });
        }

        spin.succeed(`${subs.length} subscription(s)`);
        ui.table(
          ['ID', 'Listing', 'Interval', 'Payments Left', 'Next Payment', 'Status'],
          subs.map((s) => [
            s.id,
            `#${s.listingId}`,
            `${s.intervalDays}d`,
            s.paymentsLeft,
            new Date(s.nextPayment * 1000).toLocaleDateString(),
            SUBSCRIPTION_STATUS[s.status] || 'Unknown',
          ])
        );
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
