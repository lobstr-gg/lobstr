import { Command } from "commander";
import { parseAbi, parseUnits, type Address } from "viem";
import {
  ensureWorkspace,
  createPublicClient,
  createWalletClient,
  getContractAddress,
  LOB_TOKEN_ABI,
  TREASURY_GOVERNOR_ABI,
} from "openclaw";
import * as ui from "openclaw";
import { formatLob, PROPOSAL_STATUS } from "../lib/format";

const govAbi = parseAbi(TREASURY_GOVERNOR_ABI as unknown as string[]);
const tokenAbi = parseAbi(LOB_TOKEN_ABI as unknown as string[]);

export function registerDaoCommands(program: Command): void {
  const dao = program
    .command("dao")
    .description("DAO treasury and governance commands");

  // ── proposals ──────────────────────────────────────

  dao
    .command("proposals")
    .description("List active spending proposals")
    .option("--format <fmt>", "Output format: text, json", "text")
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const govAddr = getContractAddress(ws.config, "treasuryGovernor");

        const spin = opts.format !== "json" ? ui.spinner("Loading proposals...") : null;
        const found: any[] = [];

        for (let i = 1; i <= 100; i++) {
          try {
            const result = (await publicClient.readContract({
              address: govAddr,
              abi: govAbi,
              functionName: "getProposal",
              args: [BigInt(i)],
            })) as any;
            const p = {
              id: result.id ?? result[0],
              proposer: result.proposer ?? result[1],
              token: result.token ?? result[2],
              recipient: result.recipient ?? result[3],
              amount: result.amount ?? result[4],
              description: result.description ?? result[5],
              status: result.status ?? result[6],
              approvalCount: result.approvalCount ?? result[7],
              createdAt: result.createdAt ?? result[8],
              timelockEnd: result.timelockEnd ?? result[9],
            };
            if (p.id === 0n) break;
            found.push(p);
          } catch {
            break;
          }
        }

        if (found.length === 0) {
          if (opts.format === "json") {
            console.log(JSON.stringify([]));
            return;
          }
          spin!.succeed("No proposals found");
          return;
        }

        if (opts.format === "json") {
          console.log(JSON.stringify(found.map((p) => ({
            id: p.id.toString(),
            proposer: p.proposer,
            token: p.token,
            recipient: p.recipient,
            amount: formatLob(p.amount),
            description: p.description,
            status: PROPOSAL_STATUS[p.status] || "Unknown",
            approvalCount: Number(p.approvalCount),
            createdAt: Number(p.createdAt),
            timelockEnd: Number(p.timelockEnd),
          }))));
          return;
        }

        spin!.succeed(`${found.length} proposal(s)`);
        ui.table(
          ["ID", "Proposer", "Recipient", "Amount", "Status", "Approvals"],
          found.map((p) => [
            p.id.toString(),
            p.proposer.slice(0, 10) + "...",
            p.recipient.slice(0, 10) + "...",
            formatLob(p.amount),
            PROPOSAL_STATUS[p.status] || "Unknown",
            p.approvalCount.toString(),
          ])
        );
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── proposal <id> ──────────────────────────────────

  dao
    .command("proposal <id>")
    .description("View proposal details")
    .action(async (id) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const govAddr = getContractAddress(ws.config, "treasuryGovernor");

        const spin = ui.spinner("Loading proposal...");
        const result = (await publicClient.readContract({
          address: govAddr,
          abi: govAbi,
          functionName: "getProposal",
          args: [BigInt(id)],
        })) as any;

        const p = {
          id: result.id ?? result[0],
          proposer: result.proposer ?? result[1],
          token: result.token ?? result[2],
          recipient: result.recipient ?? result[3],
          amount: result.amount ?? result[4],
          description: result.description ?? result[5],
          status: result.status ?? result[6],
          approvalCount: result.approvalCount ?? result[7],
          createdAt: result.createdAt ?? result[8],
          timelockEnd: result.timelockEnd ?? result[9],
        };

        const expired = (await publicClient.readContract({
          address: govAddr,
          abi: govAbi,
          functionName: "isProposalExpired",
          args: [BigInt(id)],
        })) as boolean;

        spin.succeed(`Proposal #${id}`);
        ui.info(`Proposer: ${p.proposer}`);
        ui.info(`Token: ${p.token}`);
        ui.info(`Recipient: ${p.recipient}`);
        ui.info(`Amount: ${formatLob(p.amount)}`);
        ui.info(`Description: ${p.description}`);
        ui.info(`Status: ${PROPOSAL_STATUS[p.status] || "Unknown"}${expired ? " (EXPIRED)" : ""}`);
        ui.info(`Approvals: ${p.approvalCount.toString()}`);
        ui.info(`Created: ${new Date(Number(p.createdAt) * 1000).toISOString()}`);
        if (p.timelockEnd > 0n) {
          ui.info(`Timelock ends: ${new Date(Number(p.timelockEnd) * 1000).toISOString()}`);
        }
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── propose ────────────────────────────────────────

  dao
    .command("propose")
    .description("Create a spending proposal")
    .requiredOption("--recipient <address>", "Recipient address")
    .requiredOption("--amount <amount>", "Amount in LOB")
    .requiredOption("--description <desc>", "Proposal description")
    .option("--token <address>", "Token address (defaults to LOB)")
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );
        const govAddr = getContractAddress(ws.config, "treasuryGovernor");
        const tokenAddr = opts.token || getContractAddress(ws.config, "lobToken");
        const parsedAmount = parseUnits(opts.amount, 18);

        const spin = ui.spinner("Creating proposal...");
        const tx = await walletClient.writeContract({
          address: govAddr,
          abi: govAbi,
          functionName: "createProposal",
          args: [
            tokenAddr as Address,
            opts.recipient as Address,
            parsedAmount,
            opts.description,
          ],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed("Proposal created");
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── approve ────────────────────────────────────────

  dao
    .command("approve <id>")
    .description("Approve a pending proposal")
    .action(async (id) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );
        const govAddr = getContractAddress(ws.config, "treasuryGovernor");

        const spin = ui.spinner(`Approving proposal #${id}...`);
        const tx = await walletClient.writeContract({
          address: govAddr,
          abi: govAbi,
          functionName: "approveProposal",
          args: [BigInt(id)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed(`Approved proposal #${id}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── execute ────────────────────────────────────────

  dao
    .command("execute <id>")
    .description("Execute an approved proposal (after timelock)")
    .action(async (id) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );
        const govAddr = getContractAddress(ws.config, "treasuryGovernor");

        const spin = ui.spinner(`Executing proposal #${id}...`);
        const tx = await walletClient.writeContract({
          address: govAddr,
          abi: govAbi,
          functionName: "executeProposal",
          args: [BigInt(id)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed(`Proposal #${id} executed`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── cancel ─────────────────────────────────────────

  dao
    .command("cancel <id>")
    .description("Cancel a proposal (proposer or guardian)")
    .action(async (id) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );
        const govAddr = getContractAddress(ws.config, "treasuryGovernor");

        const spin = ui.spinner(`Cancelling proposal #${id}...`);
        const tx = await walletClient.writeContract({
          address: govAddr,
          abi: govAbi,
          functionName: "cancelProposal",
          args: [BigInt(id)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed(`Proposal #${id} cancelled`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── admin-propose ──────────────────────────────────

  dao
    .command("admin-propose")
    .description("Create an admin proposal (arbitrary contract call)")
    .requiredOption("--target <address>", "Target contract address")
    .requiredOption("--calldata <hex>", "Encoded calldata (0x...)")
    .requiredOption("--description <desc>", "Proposal description")
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );
        const govAddr = getContractAddress(ws.config, "treasuryGovernor");

        const spin = ui.spinner("Creating admin proposal...");
        const tx = await walletClient.writeContract({
          address: govAddr,
          abi: govAbi,
          functionName: "createAdminProposal",
          args: [
            opts.target as Address,
            opts.calldata as `0x${string}`,
            opts.description,
          ],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed("Admin proposal created");
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── admin-approve ──────────────────────────────────

  dao
    .command("admin-approve <id>")
    .description("Approve an admin proposal")
    .action(async (id) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );
        const govAddr = getContractAddress(ws.config, "treasuryGovernor");

        const spin = ui.spinner(`Approving admin proposal #${id}...`);
        const tx = await walletClient.writeContract({
          address: govAddr,
          abi: govAbi,
          functionName: "approveAdminProposal",
          args: [BigInt(id)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed(`Admin proposal #${id} approved`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── admin-execute ──────────────────────────────────

  dao
    .command("admin-execute <id>")
    .description("Execute an approved admin proposal (after timelock)")
    .action(async (id) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );
        const govAddr = getContractAddress(ws.config, "treasuryGovernor");

        const spin = ui.spinner(`Executing admin proposal #${id}...`);
        const tx = await walletClient.writeContract({
          address: govAddr,
          abi: govAbi,
          functionName: "executeAdminProposal",
          args: [BigInt(id)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed(`Admin proposal #${id} executed`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── streams ────────────────────────────────────────

  dao
    .command("streams")
    .description("List your payment streams")
    .option("--format <fmt>", "Output format: text, json", "text")
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { address } = await createWalletClient(ws.config, ws.path);
        const govAddr = getContractAddress(ws.config, "treasuryGovernor");

        const spin = opts.format !== "json" ? ui.spinner("Loading streams...") : null;
        const streamIds = (await publicClient.readContract({
          address: govAddr,
          abi: govAbi,
          functionName: "getRecipientStreams",
          args: [address],
        })) as bigint[];

        if (streamIds.length === 0) {
          if (opts.format === "json") {
            console.log(JSON.stringify([]));
            return;
          }
          spin!.succeed("No payment streams");
          return;
        }

        const streams: any[] = [];
        for (const sid of streamIds) {
          const streamResult = await publicClient.readContract({
            address: govAddr,
            abi: govAbi,
            functionName: "getStream",
            args: [sid],
          }) as any;
          const s = {
            id: streamResult.id ?? streamResult[0],
            recipient: streamResult.recipient ?? streamResult[1],
            token: streamResult.token ?? streamResult[2],
            totalAmount: streamResult.totalAmount ?? streamResult[3],
            claimedAmount: streamResult.claimedAmount ?? streamResult[4],
            startTime: streamResult.startTime ?? streamResult[5],
            endTime: streamResult.endTime ?? streamResult[6],
            role: streamResult.role ?? streamResult[7],
            active: streamResult.active ?? streamResult[8],
          };
          const claimable = await publicClient.readContract({
            address: govAddr,
            abi: govAbi,
            functionName: "streamClaimable",
            args: [sid],
          });
          streams.push({ ...s, claimable });
        }

        if (opts.format === "json") {
          console.log(JSON.stringify(streams.map((s: any) => ({
            id: s.id.toString(),
            role: s.role,
            totalAmount: formatLob(s.totalAmount),
            claimedAmount: formatLob(s.claimedAmount),
            claimable: formatLob(s.claimable),
            active: s.active,
            endTime: Number(s.endTime),
          }))));
          return;
        }

        spin!.succeed(`${streams.length} stream(s)`);
        ui.table(
          ["ID", "Role", "Total", "Claimed", "Claimable", "Active", "Ends"],
          streams.map((s: any) => [
            s.id.toString(),
            s.role,
            formatLob(s.totalAmount),
            formatLob(s.claimedAmount),
            formatLob(s.claimable),
            s.active ? "Yes" : "No",
            new Date(Number(s.endTime) * 1000).toLocaleDateString(),
          ])
        );
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── claim ──────────────────────────────────────────

  dao
    .command("claim <streamId>")
    .description("Claim vested funds from a payment stream")
    .action(async (streamId) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );
        const govAddr = getContractAddress(ws.config, "treasuryGovernor");

        const claimable = (await publicClient.readContract({
          address: govAddr,
          abi: govAbi,
          functionName: "streamClaimable",
          args: [BigInt(streamId)],
        })) as bigint;

        if (claimable === 0n) {
          ui.warn("Nothing to claim yet");
          return;
        }

        const spin = ui.spinner(`Claiming ${formatLob(claimable)}...`);
        const tx = await walletClient.writeContract({
          address: govAddr,
          abi: govAbi,
          functionName: "claimStream",
          args: [BigInt(streamId)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed(`Claimed ${formatLob(claimable)} from stream #${streamId}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── treasury ───────────────────────────────────────

  dao
    .command("treasury")
    .description("View treasury balances")
    .option("--format <fmt>", "Output format: text, json", "text")
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const govAddr = getContractAddress(ws.config, "treasuryGovernor");
        const tokenAddr = getContractAddress(ws.config, "lobToken");

        const spin = opts.format !== "json" ? ui.spinner("Loading treasury...") : null;
        const lobBalance = (await publicClient.readContract({
          address: govAddr,
          abi: govAbi,
          functionName: "getBalance",
          args: [tokenAddr],
        })) as bigint;

        const reqApprovals = (await publicClient.readContract({
          address: govAddr,
          abi: govAbi,
          functionName: "requiredApprovals",
        })) as bigint;

        const signers = (await publicClient.readContract({
          address: govAddr,
          abi: govAbi,
          functionName: "signerCount",
        })) as bigint;

        if (opts.format === "json") {
          console.log(JSON.stringify({
            lobBalance: formatLob(lobBalance),
            requiredApprovals: Number(reqApprovals),
            signerCount: Number(signers),
          }));
          return;
        }

        spin!.succeed("Treasury status");
        ui.info(`LOB balance: ${formatLob(lobBalance)}`);
        ui.info(`Multisig: ${reqApprovals.toString()}-of-${signers.toString()}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── signers ────────────────────────────────────────

  dao
    .command("signers")
    .description("View multisig signer info")
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const govAddr = getContractAddress(ws.config, "treasuryGovernor");

        const spin = ui.spinner("Loading signer info...");
        const reqApprovals = (await publicClient.readContract({
          address: govAddr,
          abi: govAbi,
          functionName: "requiredApprovals",
        })) as bigint;

        const signerCount = (await publicClient.readContract({
          address: govAddr,
          abi: govAbi,
          functionName: "signerCount",
        })) as bigint;

        spin.succeed("Multisig configuration");
        ui.info(`Signer count: ${signerCount.toString()}`);
        ui.info(`Required approvals: ${reqApprovals.toString()}`);
        ui.info(`Threshold: ${reqApprovals.toString()}-of-${signerCount.toString()}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
