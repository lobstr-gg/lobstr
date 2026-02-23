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
import { formatLob, LOAN_STATUS } from '../lib/format';

const LOAN_ENGINE_ABI = parseAbi([
  'function requestLoan(uint256 amount, uint256 collateral, uint256 durationDays, string purpose) returns (uint256)',
  'function repayLoan(uint256 loanId)',
  'function getLoan(uint256 loanId) view returns (uint256 id, address borrower, uint256 amount, uint256 collateral, uint256 repaid, uint256 dueDate, uint8 status, string purpose)',
  'function loanCount() view returns (uint256)',
  'function getBorrowerLoans(address borrower) view returns (uint256[])',
]);

export function registerLoanCommands(program: Command): void {
  const loan = program
    .command('loan')
    .description('Loan engine commands');

  // ── request ─────────────────────────────────────────

  loan
    .command('request')
    .description('Request a loan (approve LOB collateral first)')
    .requiredOption('--amount <amt>', 'Loan amount in LOB')
    .requiredOption('--collateral <col>', 'Collateral amount in LOB')
    .requiredOption('--duration <days>', 'Loan duration in days')
    .requiredOption('--purpose <desc>', 'Loan purpose description')
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const tokenAbi = parseAbi(LOB_TOKEN_ABI as unknown as string[]);
        const loanAddr = getContractAddress(ws.config, 'loanEngine');
        const tokenAddr = getContractAddress(ws.config, 'lobToken');

        const parsedAmount = parseUnits(opts.amount, 18);
        const parsedCollateral = parseUnits(opts.collateral, 18);

        const spin = ui.spinner('Approving LOB collateral...');
        const approveTx = await walletClient.writeContract({
          address: tokenAddr,
          abi: tokenAbi,
          functionName: 'approve',
          args: [loanAddr, parsedCollateral],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });

        spin.text = 'Requesting loan...';
        const tx = await walletClient.writeContract({
          address: loanAddr,
          abi: LOAN_ENGINE_ABI,
          functionName: 'requestLoan',
          args: [parsedAmount, parsedCollateral, BigInt(opts.duration), opts.purpose],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed('Loan requested');
        ui.info(`Amount: ${opts.amount} LOB`);
        ui.info(`Collateral: ${opts.collateral} LOB`);
        ui.info(`Duration: ${opts.duration} days`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── repay ───────────────────────────────────────────

  loan
    .command('repay <id>')
    .description('Repay a loan')
    .action(async (id: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const loanAddr = getContractAddress(ws.config, 'loanEngine');

        const spin = ui.spinner(`Repaying loan #${id}...`);
        const tx = await walletClient.writeContract({
          address: loanAddr,
          abi: LOAN_ENGINE_ABI,
          functionName: 'repayLoan',
          args: [BigInt(id)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Loan #${id} repaid`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── status ──────────────────────────────────────────

  loan
    .command('status <id>')
    .description('View loan details')
    .action(async (id: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const loanAddr = getContractAddress(ws.config, 'loanEngine');

        const spin = ui.spinner(`Fetching loan #${id}...`);
        const result = await publicClient.readContract({
          address: loanAddr,
          abi: LOAN_ENGINE_ABI,
          functionName: 'getLoan',
          args: [BigInt(id)],
        }) as any;

        const loanData = {
          id: result.id ?? result[0],
          borrower: result.borrower ?? result[1],
          amount: result.amount ?? result[2],
          collateral: result.collateral ?? result[3],
          repaid: result.repaid ?? result[4],
          dueDate: result.dueDate ?? result[5],
          status: result.status ?? result[6],
          purpose: result.purpose ?? result[7],
        };

        spin.succeed(`Loan #${id}`);
        console.log(`  Borrower:   ${loanData.borrower}`);
        console.log(`  Amount:     ${formatLob(loanData.amount)}`);
        console.log(`  Collateral: ${formatLob(loanData.collateral)}`);
        console.log(`  Repaid:     ${formatLob(loanData.repaid)}`);
        console.log(`  Due date:   ${new Date(Number(loanData.dueDate) * 1000).toISOString()}`);
        console.log(`  Status:     ${LOAN_STATUS[Number(loanData.status)] || 'Unknown'}`);
        console.log(`  Purpose:    ${loanData.purpose}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── list ────────────────────────────────────────────

  loan
    .command('list')
    .description("List user's loans")
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const wallet = loadWallet(ws.path);
        const address = wallet.address as `0x${string}`;
        const loanAddr = getContractAddress(ws.config, 'loanEngine');

        const spin = ui.spinner('Fetching loans...');
        const loanIds = await publicClient.readContract({
          address: loanAddr,
          abi: LOAN_ENGINE_ABI,
          functionName: 'getBorrowerLoans',
          args: [address],
        }) as bigint[];

        if (loanIds.length === 0) {
          spin.succeed('No loans found');
          return;
        }

        const loans: any[] = [];
        for (const lid of loanIds) {
          const result = await publicClient.readContract({
            address: loanAddr,
            abi: LOAN_ENGINE_ABI,
            functionName: 'getLoan',
            args: [lid],
          }) as any;

          loans.push({
            id: result.id ?? result[0],
            amount: result.amount ?? result[2],
            collateral: result.collateral ?? result[3],
            dueDate: result.dueDate ?? result[5],
            status: result.status ?? result[6],
            purpose: result.purpose ?? result[7],
          });
        }

        spin.succeed(`${loans.length} loan(s)`);
        ui.table(
          ['ID', 'Amount', 'Collateral', 'Due', 'Status', 'Purpose'],
          loans.map((l: any) => [
            l.id.toString(),
            formatLob(l.amount),
            formatLob(l.collateral),
            new Date(Number(l.dueDate) * 1000).toLocaleDateString(),
            LOAN_STATUS[Number(l.status)] || 'Unknown',
            l.purpose.length > 30 ? l.purpose.slice(0, 30) + '...' : l.purpose,
          ])
        );
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
