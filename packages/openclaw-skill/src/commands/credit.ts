import { Command } from 'commander';
import { parseAbi, parseUnits } from 'viem';
import {
  ensureWorkspace,
  createPublicClient,
  createWalletClient,
  getContractAddress,
  loadWallet,
  LOB_TOKEN_ABI,
} from 'openclaw';
import * as ui from 'openclaw';
import { formatLob } from '../lib/format';

const CREDIT_FACILITY_ABI = parseAbi([
  'function openCreditLine(uint256 depositAmount)',
  'function getCreditLine(address account) view returns (uint256 limit, uint256 drawn, uint256 available, bool active)',
  'function drawCredit(uint256 amount)',
  'function repayCredit(uint256 amount)',
  'function closeCreditLine()',
]);

export function registerCreditCommands(program: Command): void {
  const credit = program
    .command('credit')
    .description('X402 credit facility commands');

  // ── open-line ───────────────────────────────────────

  credit
    .command('open-line')
    .description('Open a credit line (approve LOB deposit first)')
    .requiredOption('--deposit <amount>', 'Deposit amount in LOB')
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const tokenAbi = parseAbi(LOB_TOKEN_ABI as unknown as string[]);
        const creditAddr = getContractAddress(ws.config, 'x402CreditFacility');
        const tokenAddr = getContractAddress(ws.config, 'lobToken');

        const parsedAmount = parseUnits(opts.deposit, 18);

        const spin = ui.spinner('Approving LOB deposit...');
        const approveTx = await walletClient.writeContract({
          address: tokenAddr,
          abi: tokenAbi,
          functionName: 'approve',
          args: [creditAddr, parsedAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });

        spin.text = 'Opening credit line...';
        const tx = await walletClient.writeContract({
          address: creditAddr,
          abi: CREDIT_FACILITY_ABI,
          functionName: 'openCreditLine',
          args: [parsedAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed('Credit line opened');
        ui.info(`Deposit: ${opts.deposit} LOB`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── draw ────────────────────────────────────────────

  credit
    .command('draw <amount>')
    .description('Draw from credit line')
    .action(async (amount: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const creditAddr = getContractAddress(ws.config, 'x402CreditFacility');

        const parsedAmount = parseUnits(amount, 18);

        const spin = ui.spinner('Drawing credit...');
        const tx = await walletClient.writeContract({
          address: creditAddr,
          abi: CREDIT_FACILITY_ABI,
          functionName: 'drawCredit',
          args: [parsedAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Drew ${amount} LOB from credit line`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── repay ───────────────────────────────────────────

  credit
    .command('repay <amount>')
    .description('Repay drawn credit')
    .action(async (amount: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const creditAddr = getContractAddress(ws.config, 'x402CreditFacility');

        const parsedAmount = parseUnits(amount, 18);

        const spin = ui.spinner('Repaying credit...');
        const tx = await walletClient.writeContract({
          address: creditAddr,
          abi: CREDIT_FACILITY_ABI,
          functionName: 'repayCredit',
          args: [parsedAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Repaid ${amount} LOB`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── status ──────────────────────────────────────────

  credit
    .command('status')
    .description('View credit line details')
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const wallet = loadWallet(ws.path);
        const address = wallet.address as `0x${string}`;
        const creditAddr = getContractAddress(ws.config, 'x402CreditFacility');

        const spin = ui.spinner('Fetching credit line...');
        const result = await publicClient.readContract({
          address: creditAddr,
          abi: CREDIT_FACILITY_ABI,
          functionName: 'getCreditLine',
          args: [address],
        }) as any;

        const creditLine = {
          limit: result.limit ?? result[0],
          drawn: result.drawn ?? result[1],
          available: result.available ?? result[2],
          active: result.active ?? result[3],
        };

        spin.succeed('Credit Line Status');
        console.log(`  Active:    ${creditLine.active ? 'Yes' : 'No'}`);
        console.log(`  Limit:     ${formatLob(creditLine.limit)}`);
        console.log(`  Drawn:     ${formatLob(creditLine.drawn)}`);
        console.log(`  Available: ${formatLob(creditLine.available)}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
