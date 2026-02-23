import { Command } from "commander";
import { parseAbi, parseUnits, formatUnits, type Address } from "viem";
import {
  ensureWorkspace,
  createPublicClient,
  createWalletClient,
  getContractAddress,
  LOB_TOKEN_ABI,
  DISPUTE_ARBITRATION_ABI,
} from "openclaw";
import * as ui from "openclaw";
import {
  formatLob,
  ARBITRATOR_RANK,
  DISPUTE_STATUS,
  RULING,
} from "../lib/format";

const arbAbi = parseAbi(DISPUTE_ARBITRATION_ABI as unknown as string[]);
const tokenAbi = parseAbi(LOB_TOKEN_ABI as unknown as string[]);

export function registerArbitrateCommands(program: Command): void {
  const arb = program
    .command("arbitrate")
    .description("Dispute arbitration commands");

  // ── stake ──────────────────────────────────────────

  arb
    .command("stake <amount>")
    .description("Stake LOB to become an arbitrator")
    .action(async (amount) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient, address } = await createWalletClient(
          ws.config,
          ws.path
        );

        const arbAddr = getContractAddress(ws.config, "disputeArbitration");
        const tokenAddr = getContractAddress(ws.config, "lobToken");
        const parsedAmount = parseUnits(amount, 18);

        const spin = ui.spinner("Approving LOB...");

        const approveTx = await walletClient.writeContract({
          address: tokenAddr,
          abi: tokenAbi,
          functionName: "approve",
          args: [arbAddr, parsedAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        spin.text = "Staking as arbitrator...";

        const stakeTx = await walletClient.writeContract({
          address: arbAddr,
          abi: arbAbi,
          functionName: "stakeAsArbitrator",
          args: [parsedAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: stakeTx });

        spin.succeed(`Staked ${amount} LOB as arbitrator`);

        // Show updated info
        const info = (await publicClient.readContract({
          address: arbAddr,
          abi: arbAbi,
          functionName: "getArbitratorInfo",
          args: [address],
        })) as [bigint, number, bigint, bigint, boolean];

        ui.info(`Total stake: ${formatLob(info[0])}`);
        ui.info(`Rank: ${ARBITRATOR_RANK[info[1]] || "Unknown"}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── unstake ────────────────────────────────────────

  arb
    .command("unstake <amount>")
    .description("Withdraw arbitrator stake")
    .action(async (amount) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );

        const arbAddr = getContractAddress(ws.config, "disputeArbitration");
        const parsedAmount = parseUnits(amount, 18);

        const spin = ui.spinner("Unstaking...");
        const tx = await walletClient.writeContract({
          address: arbAddr,
          abi: arbAbi,
          functionName: "unstakeAsArbitrator",
          args: [parsedAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed(`Unstaked ${amount} LOB from arbitrator pool`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── status ─────────────────────────────────────────

  arb
    .command("status")
    .description("Show your arbitrator info (rank, stake, accuracy)")
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { address } = await createWalletClient(ws.config, ws.path);

        const arbAddr = getContractAddress(ws.config, "disputeArbitration");

        const spin = ui.spinner("Loading arbitrator info...");
        const info = (await publicClient.readContract({
          address: arbAddr,
          abi: arbAbi,
          functionName: "getArbitratorInfo",
          args: [address],
        })) as [bigint, number, bigint, bigint, boolean];

        spin.succeed("Arbitrator status");
        ui.info(`Stake: ${formatLob(info[0])}`);
        ui.info(`Rank: ${ARBITRATOR_RANK[info[1]] || "None"}`);
        ui.info(`Disputes handled: ${info[2].toString()}`);
        ui.info(`Majority votes: ${info[3].toString()}`);
        ui.info(`Active: ${info[4] ? "Yes" : "No"}`);

        if (info[2] > 0n) {
          const accuracy = Number((info[3] * 100n) / info[2]);
          ui.info(`Accuracy: ${accuracy}%`);
        }
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── disputes ───────────────────────────────────────

  arb
    .command("disputes")
    .description("List disputes assigned to you")
    .option("--format <fmt>", "Output format: text, json", "text")
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { address } = await createWalletClient(ws.config, ws.path);

        const arbAddr = getContractAddress(ws.config, "disputeArbitration");

        const spin = opts.format !== "json" ? ui.spinner("Scanning disputes...") : null;
        const found: any[] = [];

        // Scan recent disputes (last 200 IDs)
        for (let i = 1; i <= 200; i++) {
          try {
            const dispute = (await publicClient.readContract({
              address: arbAddr,
              abi: arbAbi,
              functionName: "getDispute",
              args: [BigInt(i)],
            })) as any;

            const arbitrators = dispute[13] as string[];
            const isAssigned = arbitrators.some(
              (a: string) => a.toLowerCase() === address.toLowerCase()
            );
            if (isAssigned) {
              found.push(dispute);
            }
          } catch {
            break; // ID doesn't exist, stop scanning
          }
        }

        if (found.length === 0) {
          if (opts.format === "json") {
            console.log(JSON.stringify([]));
            return;
          }
          spin!.succeed("No disputes assigned to you");
          return;
        }

        if (opts.format === "json") {
          console.log(JSON.stringify(found.map((d) => ({
            id: d[0].toString(),
            jobId: d[1].toString(),
            buyer: d[2],
            seller: d[3],
            amount: formatLob(d[4]),
            token: d[5],
            buyerEvidence: d[6],
            sellerEvidence: d[7],
            status: DISPUTE_STATUS[d[8]] || "Unknown",
            ruling: RULING[d[9]] || "Pending",
            createdAt: Number(d[10]),
            counterDeadline: Number(d[11]),
            votingDeadline: Number(d[12]),
            votesForBuyer: Number(d[14]),
            votesForSeller: Number(d[15]),
            totalVotes: Number(d[16]),
          }))));
          return;
        }

        spin!.succeed(`${found.length} dispute(s) found`);
        ui.table(
          ["ID", "Job", "Amount", "Status", "Ruling", "Votes"],
          found.map((d) => [
            d[0].toString(),
            d[1].toString(),
            formatLob(d[4]),
            DISPUTE_STATUS[d[8]] || "Unknown",
            RULING[d[9]] || "Pending",
            `B:${d[14]} S:${d[15]} / ${d[16]}`,
          ])
        );
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── dispute <id> ───────────────────────────────────

  arb
    .command("dispute <id>")
    .description("View dispute details and evidence")
    .action(async (id) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const arbAddr = getContractAddress(ws.config, "disputeArbitration");

        const spin = ui.spinner("Loading dispute...");
        const d = (await publicClient.readContract({
          address: arbAddr,
          abi: arbAbi,
          functionName: "getDispute",
          args: [BigInt(id)],
        })) as any;

        spin.succeed(`Dispute #${id}`);
        ui.info(`Job ID: ${d[1].toString()}`);
        ui.info(`Buyer: ${d[2]}`);
        ui.info(`Seller: ${d[3]}`);
        ui.info(`Amount: ${formatLob(d[4])}`);
        ui.info(`Token: ${d[5]}`);
        ui.info(`Status: ${DISPUTE_STATUS[d[8]] || "Unknown"}`);
        ui.info(`Ruling: ${RULING[d[9]] || "Pending"}`);
        ui.info(
          `Created: ${new Date(Number(d[10]) * 1000).toISOString()}`
        );
        ui.info(
          `Counter-evidence deadline: ${new Date(Number(d[11]) * 1000).toISOString()}`
        );
        ui.info(
          `Voting deadline: ${new Date(Number(d[12]) * 1000).toISOString()}`
        );

        console.log();
        ui.header("Evidence");
        ui.info(`Buyer evidence: ${d[6] || "(none)"}`);
        ui.info(`Seller evidence: ${d[7] || "(none)"}`);

        console.log();
        ui.header("Arbitrators");
        const arbitrators = d[13] as string[];
        arbitrators.forEach((a: string, i: number) => {
          ui.info(`  ${i + 1}. ${a}`);
        });

        console.log();
        ui.header("Votes");
        ui.info(`For buyer: ${d[14]}`);
        ui.info(`For seller: ${d[15]}`);
        ui.info(`Total cast: ${d[16]}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── vote ───────────────────────────────────────────

  arb
    .command("vote <disputeId> <side>")
    .description("Vote on a dispute (buyer or seller)")
    .action(async (disputeId, side) => {
      try {
        const favorBuyer = side.toLowerCase() === "buyer";
        if (
          side.toLowerCase() !== "buyer" &&
          side.toLowerCase() !== "seller"
        ) {
          ui.error('Side must be "buyer" or "seller"');
          process.exit(1);
        }

        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );
        const arbAddr = getContractAddress(ws.config, "disputeArbitration");

        const spin = ui.spinner(
          `Voting for ${side} on dispute #${disputeId}...`
        );
        const tx = await walletClient.writeContract({
          address: arbAddr,
          abi: arbAbi,
          functionName: "vote",
          args: [BigInt(disputeId), favorBuyer],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed(`Voted for ${side} on dispute #${disputeId}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── execute ────────────────────────────────────────

  arb
    .command("execute <disputeId>")
    .description("Execute ruling after voting concludes")
    .action(async (disputeId) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );
        const arbAddr = getContractAddress(ws.config, "disputeArbitration");

        const spin = ui.spinner(`Executing ruling for dispute #${disputeId}...`);
        const tx = await walletClient.writeContract({
          address: arbAddr,
          abi: arbAbi,
          functionName: "executeRuling",
          args: [BigInt(disputeId)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed(`Ruling executed for dispute #${disputeId}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── counter-evidence ─────────────────────────────────

  arb
    .command("counter-evidence <disputeId>")
    .description("Submit counter-evidence for a dispute (seller)")
    .requiredOption("--evidence <uri>", "Evidence URI (IPFS or HTTPS)")
    .action(async (disputeId, opts) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );
        const arbAddr = getContractAddress(ws.config, "disputeArbitration");

        const spin = ui.spinner(
          `Submitting counter-evidence for dispute #${disputeId}...`
        );
        const tx = await walletClient.writeContract({
          address: arbAddr,
          abi: arbAbi,
          functionName: "submitCounterEvidence",
          args: [BigInt(disputeId), opts.evidence],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed(
          `Counter-evidence submitted for dispute #${disputeId}`
        );
        ui.info(`Evidence URI: ${opts.evidence}`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── appeal ──────────────────────────────────────────

  arb
    .command("appeal <disputeId>")
    .description("Appeal a dispute ruling (requires 500 LOB bond)")
    .action(async (disputeId) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );
        const arbAddr = getContractAddress(ws.config, "disputeArbitration");
        const tokenAddr = getContractAddress(ws.config, "lobToken");
        const bondAmount = parseUnits("500", 18);

        const spin = ui.spinner("Approving 500 LOB bond...");
        const approveTx = await walletClient.writeContract({
          address: tokenAddr,
          abi: tokenAbi,
          functionName: "approve",
          args: [arbAddr, bondAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });

        spin.text = `Filing appeal for dispute #${disputeId}...`;
        const tx = await walletClient.writeContract({
          address: arbAddr,
          abi: arbAbi,
          functionName: "appealRuling",
          args: [BigInt(disputeId)],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Appeal filed for dispute #${disputeId}`);
        ui.info("500 LOB bond locked");
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── history ────────────────────────────────────────

  arb
    .command("history")
    .description("View your arbitration history and accuracy")
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { address } = await createWalletClient(ws.config, ws.path);
        const arbAddr = getContractAddress(ws.config, "disputeArbitration");

        const spin = ui.spinner("Loading history...");
        const info = (await publicClient.readContract({
          address: arbAddr,
          abi: arbAbi,
          functionName: "getArbitratorInfo",
          args: [address],
        })) as [bigint, number, bigint, bigint, boolean];

        spin.succeed("Arbitration history");
        ui.info(`Total disputes handled: ${info[2].toString()}`);
        ui.info(`Majority votes (correct): ${info[3].toString()}`);
        ui.info(`Rank: ${ARBITRATOR_RANK[info[1]] || "None"}`);
        ui.info(`Current stake: ${formatLob(info[0])}`);

        if (info[2] > 0n) {
          const accuracy = Number((info[3] * 100n) / info[2]);
          const minority = info[2] - info[3];
          ui.info(`Minority votes (incorrect): ${minority.toString()}`);
          ui.info(`Accuracy rate: ${accuracy}%`);
        }
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
