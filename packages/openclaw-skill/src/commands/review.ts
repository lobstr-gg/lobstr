import { Command } from 'commander';
import { parseAbi } from 'viem';
import {
  ensureWorkspace,
  createPublicClient,
  createWalletClient,
  getContractAddress,
} from 'openclaw';
import * as ui from 'openclaw';

const REVIEW_REGISTRY_ABI = parseAbi([
  'function submitReview(uint256 jobId, uint8 rating, string comment)',
  'function getReview(uint256 reviewId) view returns (uint256 id, uint256 jobId, address reviewer, address reviewee, uint8 rating, string comment, uint256 timestamp)',
  'function getReviewsForProvider(address provider) view returns (uint256[])',
  'function reviewCount() view returns (uint256)',
]);

export function registerReviewCommands(program: Command): void {
  const review = program
    .command('review')
    .description('Review registry commands');

  // ── submit ──────────────────────────────────────────

  review
    .command('submit')
    .description('Submit a review for a completed job')
    .requiredOption('--job <id>', 'Job ID')
    .requiredOption('--rating <1-5>', 'Rating (1-5)')
    .requiredOption('--comment <text>', 'Review comment')
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const reviewAddr = getContractAddress(ws.config, 'reviewRegistry');

        const rating = parseInt(opts.rating, 10);
        if (rating < 1 || rating > 5) {
          ui.error('Rating must be between 1 and 5');
          process.exit(1);
        }

        const spin = ui.spinner('Submitting review...');
        const tx = await walletClient.writeContract({
          address: reviewAddr,
          abi: REVIEW_REGISTRY_ABI,
          functionName: 'submitReview',
          args: [BigInt(opts.job), rating, opts.comment],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed('Review submitted');
        ui.info(`Job: #${opts.job}`);
        ui.info(`Rating: ${'*'.repeat(rating)}${'_'.repeat(5 - rating)} (${rating}/5)`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── list ────────────────────────────────────────────

  review
    .command('list <address>')
    .description('List reviews for a provider')
    .action(async (address: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const reviewAddr = getContractAddress(ws.config, 'reviewRegistry');

        const spin = ui.spinner('Fetching reviews...');
        const reviewIds = await publicClient.readContract({
          address: reviewAddr,
          abi: REVIEW_REGISTRY_ABI,
          functionName: 'getReviewsForProvider',
          args: [address as `0x${string}`],
        }) as bigint[];

        if (reviewIds.length === 0) {
          spin.succeed('No reviews found');
          return;
        }

        const reviews: any[] = [];
        for (const rid of reviewIds) {
          const result = await publicClient.readContract({
            address: reviewAddr,
            abi: REVIEW_REGISTRY_ABI,
            functionName: 'getReview',
            args: [rid],
          }) as any;

          reviews.push({
            id: result.id ?? result[0],
            jobId: result.jobId ?? result[1],
            reviewer: result.reviewer ?? result[2],
            reviewee: result.reviewee ?? result[3],
            rating: result.rating ?? result[4],
            comment: result.comment ?? result[5],
            timestamp: result.timestamp ?? result[6],
          });
        }

        spin.succeed(`${reviews.length} review(s)`);
        ui.table(
          ['ID', 'Job', 'Reviewer', 'Rating', 'Comment', 'Date'],
          reviews.map((r: any) => [
            r.id.toString(),
            r.jobId.toString(),
            r.reviewer.slice(0, 10) + '...',
            `${r.rating}/5`,
            r.comment.length > 40 ? r.comment.slice(0, 40) + '...' : r.comment,
            new Date(Number(r.timestamp) * 1000).toLocaleDateString(),
          ])
        );
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── view ────────────────────────────────────────────

  review
    .command('view <id>')
    .description('View review details')
    .action(async (id: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const reviewAddr = getContractAddress(ws.config, 'reviewRegistry');

        const spin = ui.spinner(`Fetching review #${id}...`);
        const result = await publicClient.readContract({
          address: reviewAddr,
          abi: REVIEW_REGISTRY_ABI,
          functionName: 'getReview',
          args: [BigInt(id)],
        }) as any;

        const reviewData = {
          id: result.id ?? result[0],
          jobId: result.jobId ?? result[1],
          reviewer: result.reviewer ?? result[2],
          reviewee: result.reviewee ?? result[3],
          rating: result.rating ?? result[4],
          comment: result.comment ?? result[5],
          timestamp: result.timestamp ?? result[6],
        };

        spin.succeed(`Review #${id}`);
        console.log(`  Job:      #${reviewData.jobId}`);
        console.log(`  Reviewer: ${reviewData.reviewer}`);
        console.log(`  Reviewee: ${reviewData.reviewee}`);
        console.log(`  Rating:   ${'*'.repeat(Number(reviewData.rating))}${'_'.repeat(5 - Number(reviewData.rating))} (${reviewData.rating}/5)`);
        console.log(`  Comment:  ${reviewData.comment}`);
        console.log(`  Date:     ${new Date(Number(reviewData.timestamp) * 1000).toISOString()}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
