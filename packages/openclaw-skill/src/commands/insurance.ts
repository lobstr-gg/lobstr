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
import { formatLob, INSURANCE_STATUS } from '../lib/format';

const INSURANCE_POOL_ABI = parseAbi([
  'function deposit(uint256 amount)',
  'function withdraw(uint256 amount)',
  'function fileClaim(uint256 jobId, string evidence)',
  'function getDeposit(address account) view returns (uint256)',
  'function getPoolHealth() view returns (uint256 totalDeposits, uint256 totalClaims, uint256 reserveRatio)',
  'function getClaim(uint256 claimId) view returns (uint256 id, address claimant, uint256 jobId, uint256 amount, uint8 status, string evidence)',
]);

export function registerInsuranceCommands(program: Command): void {
  const insurance = program
    .command('insurance')
    .description('Insurance pool commands');

  // ── deposit ─────────────────────────────────────────

  insurance
    .command('deposit <amount>')
    .description('Deposit LOB into insurance pool')
    .action(async (amount: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const tokenAbi = parseAbi(LOB_TOKEN_ABI as unknown as string[]);
        const poolAddr = getContractAddress(ws.config, 'insurancePool');
        const tokenAddr = getContractAddress(ws.config, 'lobToken');

        const parsedAmount = parseUnits(amount, 18);

        const spin = ui.spinner('Approving LOB transfer...');
        const approveTx = await walletClient.writeContract({
          address: tokenAddr,
          abi: tokenAbi,
          functionName: 'approve',
          args: [poolAddr, parsedAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });

        spin.text = 'Depositing into insurance pool...';
        const tx = await walletClient.writeContract({
          address: poolAddr,
          abi: INSURANCE_POOL_ABI,
          functionName: 'deposit',
          args: [parsedAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Deposited ${amount} LOB into insurance pool`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── withdraw ────────────────────────────────────────

  insurance
    .command('withdraw <amount>')
    .description('Withdraw from insurance pool')
    .action(async (amount: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const poolAddr = getContractAddress(ws.config, 'insurancePool');

        const parsedAmount = parseUnits(amount, 18);

        const spin = ui.spinner('Withdrawing from insurance pool...');
        const tx = await walletClient.writeContract({
          address: poolAddr,
          abi: INSURANCE_POOL_ABI,
          functionName: 'withdraw',
          args: [parsedAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Withdrew ${amount} LOB from insurance pool`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── claim ───────────────────────────────────────────

  insurance
    .command('claim')
    .description('File an insurance claim')
    .requiredOption('--job <id>', 'Job ID to claim against')
    .requiredOption('--evidence <uri>', 'Evidence URI')
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const poolAddr = getContractAddress(ws.config, 'insurancePool');

        const spin = ui.spinner('Filing insurance claim...');
        const tx = await walletClient.writeContract({
          address: poolAddr,
          abi: INSURANCE_POOL_ABI,
          functionName: 'fileClaim',
          args: [BigInt(opts.job), opts.evidence],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed('Insurance claim filed');
        ui.info(`Job: #${opts.job}`);
        ui.info(`Evidence: ${opts.evidence}`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── status ──────────────────────────────────────────

  insurance
    .command('status')
    .description('View deposit and pool health')
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const wallet = loadWallet(ws.path);
        const address = wallet.address as `0x${string}`;
        const poolAddr = getContractAddress(ws.config, 'insurancePool');

        const spin = ui.spinner('Fetching insurance status...');

        const [deposit, healthResult] = await Promise.all([
          publicClient.readContract({
            address: poolAddr,
            abi: INSURANCE_POOL_ABI,
            functionName: 'getDeposit',
            args: [address],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: poolAddr,
            abi: INSURANCE_POOL_ABI,
            functionName: 'getPoolHealth',
          }) as Promise<any>,
        ]);

        const health = {
          totalDeposits: healthResult.totalDeposits ?? healthResult[0],
          totalClaims: healthResult.totalClaims ?? healthResult[1],
          reserveRatio: healthResult.reserveRatio ?? healthResult[2],
        };

        spin.succeed('Insurance Pool Status');
        console.log(`  Your deposit:   ${formatLob(deposit)}`);
        console.log(`  Total deposits: ${formatLob(health.totalDeposits)}`);
        console.log(`  Total claims:   ${formatLob(health.totalClaims)}`);
        console.log(`  Reserve ratio:  ${health.reserveRatio.toString()}%`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
