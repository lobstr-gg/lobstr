import { Command } from "commander";
import { parseAbi, type Address } from "viem";
import {
  ensureWorkspace,
  createPublicClient,
  createWalletClient,
  getContractAddress,
  loadWallet,
  ROLE_PAYROLL_ABI,
} from "openclaw";
import * as ui from "openclaw";
import { formatLob, ARBITRATOR_RANK } from "../lib/format";

const payrollAbi = parseAbi(ROLE_PAYROLL_ABI as unknown as string[]);

const ROLE_TYPE: Record<number, string> = {
  0: "Arbitrator",
  1: "Moderator",
};

const ROLE_RANK: Record<number, string> = {
  0: "Junior",
  1: "Senior",
  2: "Principal",
};

const SLOT_STATUS: Record<number, string> = {
  0: "Empty",
  1: "Active",
  2: "Suspended",
  3: "Resigned",
};

export function registerPayrollCommands(program: Command): void {
  const payroll = program
    .command("payroll")
    .description("RolePayroll enrollment, status, and management");

  // ── info [address] ───────────────────────────────

  payroll
    .command("info [address]")
    .description("View payroll slot info for an address (defaults to self)")
    .action(async (addr?: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const payrollAddr = getContractAddress(ws.config, "rolePayroll");

        let target: Address;
        if (addr) {
          target = addr as Address;
        } else {
          const wallet = loadWallet(ws.path);
          target = wallet.address as Address;
        }

        const spin = ui.spinner("Loading payroll info...");

        const slot = (await publicClient.readContract({
          address: payrollAddr,
          abi: payrollAbi,
          functionName: "getRoleSlot",
          args: [target],
        })) as [number, number, number, bigint, bigint, number, bigint];

        const isFounder = (await publicClient.readContract({
          address: payrollAddr,
          abi: payrollAbi,
          functionName: "founderAgents",
          args: [target],
        })) as boolean;

        const lastHeartbeat = (await publicClient.readContract({
          address: payrollAddr,
          abi: payrollAbi,
          functionName: "lastHeartbeatTimestamp",
          args: [target],
        })) as bigint;

        spin.succeed(`Payroll info for ${target}`);
        ui.info(`Role: ${ROLE_TYPE[slot[0]] || "Unknown"}`);
        ui.info(`Rank: ${ROLE_RANK[slot[1]] || "Unknown"}`);
        ui.info(`Status: ${SLOT_STATUS[slot[2]] || "Unknown"}`);
        if (slot[3] > 0n) {
          ui.info(
            `Enrolled: ${new Date(Number(slot[3]) * 1000).toISOString()}`
          );
        }
        if (slot[4] > 0n) {
          ui.info(
            `Suspended until: ${new Date(Number(slot[4]) * 1000).toISOString()}`
          );
        }
        ui.info(`Strikes: ${slot[5]}`);
        ui.info(`Staked amount: ${formatLob(slot[6])}`);
        ui.info(`Founder agent: ${isFounder ? "Yes" : "No"}`);
        if (lastHeartbeat > 0n) {
          ui.info(
            `Last heartbeat: ${new Date(Number(lastHeartbeat) * 1000).toISOString()}`
          );
        }
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── enroll <roleType> <rank> ─────────────────────

  payroll
    .command("enroll <roleType> <rank>")
    .description(
      "Enroll in payroll (roleType: arbitrator|moderator, rank: junior|senior|principal)"
    )
    .action(async (roleType: string, rank: string) => {
      try {
        const roleTypeNum = roleType.toLowerCase() === "arbitrator" ? 0 : 1;
        const rankNum =
          rank.toLowerCase() === "junior"
            ? 0
            : rank.toLowerCase() === "senior"
              ? 1
              : 2;

        if (
          !["arbitrator", "moderator"].includes(roleType.toLowerCase())
        ) {
          ui.error('roleType must be "arbitrator" or "moderator"');
          process.exit(1);
        }
        if (
          !["junior", "senior", "principal"].includes(rank.toLowerCase())
        ) {
          ui.error('rank must be "junior", "senior", or "principal"');
          process.exit(1);
        }

        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );
        const payrollAddr = getContractAddress(ws.config, "rolePayroll");

        const spin = ui.spinner(
          `Enrolling as ${rank} ${roleType}...`
        );
        const tx = await walletClient.writeContract({
          address: payrollAddr,
          abi: payrollAbi,
          functionName: "enroll",
          args: [roleTypeNum, rankNum],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed(`Enrolled as ${rank} ${roleType}`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── set-founder <address> <true|false> ───────────

  payroll
    .command("set-founder <address> <exempt>")
    .description(
      "Set founder agent exemption (requires DEFAULT_ADMIN_ROLE)"
    )
    .action(async (addr: string, exempt: string) => {
      try {
        const isExempt =
          exempt.toLowerCase() === "true" || exempt === "1";

        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );
        const payrollAddr = getContractAddress(ws.config, "rolePayroll");

        const spin = ui.spinner(
          `Setting founder agent ${addr} → ${isExempt ? "exempt" : "not exempt"}...`
        );
        const tx = await walletClient.writeContract({
          address: payrollAddr,
          abi: payrollAbi,
          functionName: "setFounderAgent",
          args: [addr as Address, isExempt],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed(
          `Set founder agent ${addr} → ${isExempt ? "exempt" : "not exempt"}`
        );
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── heartbeat [address] ──────────────────────────

  payroll
    .command("heartbeat [address]")
    .description("Report heartbeat for a payroll holder (permissionless)")
    .action(async (addr?: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient, address } = await createWalletClient(
          ws.config,
          ws.path
        );
        const payrollAddr = getContractAddress(ws.config, "rolePayroll");
        const target = (addr || address) as Address;

        const spin = ui.spinner(`Reporting heartbeat for ${target}...`);
        const tx = await walletClient.writeContract({
          address: payrollAddr,
          abi: payrollAbi,
          functionName: "reportHeartbeat",
          args: [target],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed(`Heartbeat reported for ${target}`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── config <roleType> <rank> ─────────────────────

  payroll
    .command("config <roleType> <rank>")
    .description("View role configuration (slots, fees, pay rates)")
    .action(async (roleType: string, rank: string) => {
      try {
        const roleTypeNum = roleType.toLowerCase() === "arbitrator" ? 0 : 1;
        const rankNum =
          rank.toLowerCase() === "junior"
            ? 0
            : rank.toLowerCase() === "senior"
              ? 1
              : 2;

        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const payrollAddr = getContractAddress(ws.config, "rolePayroll");

        const spin = ui.spinner("Loading role config...");
        const config = (await publicClient.readContract({
          address: payrollAddr,
          abi: payrollAbi,
          functionName: "getRoleConfig",
          args: [roleTypeNum, rankNum],
        })) as [number, bigint, bigint, bigint, bigint, bigint];

        const filled = (await publicClient.readContract({
          address: payrollAddr,
          abi: payrollAbi,
          functionName: "getFilledSlots",
          args: [roleTypeNum, rankNum],
        })) as number;

        spin.succeed(
          `${rank.charAt(0).toUpperCase() + rank.slice(1)} ${roleType.charAt(0).toUpperCase() + roleType.slice(1)} configuration`
        );
        ui.info(`Max slots: ${config[0]}`);
        ui.info(`Filled slots: ${filled}`);
        ui.info(`Cert fee (USDC): ${Number(config[1]) / 1e6}`);
        ui.info(`Min stake: ${formatLob(config[2])}`);
        ui.info(`Weekly base pay: ${formatLob(config[3])}`);
        if (roleTypeNum === 0) {
          ui.info(`Per-dispute pay: ${formatLob(config[4])}`);
          ui.info(`Majority bonus: ${formatLob(config[5])}`);
        }
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── epoch ────────────────────────────────────────

  payroll
    .command("epoch")
    .description("View current and genesis epoch")
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const payrollAddr = getContractAddress(ws.config, "rolePayroll");

        const spin = ui.spinner("Loading epoch info...");
        const current = (await publicClient.readContract({
          address: payrollAddr,
          abi: payrollAbi,
          functionName: "currentEpoch",
          args: [],
        })) as bigint;

        const genesis = (await publicClient.readContract({
          address: payrollAddr,
          abi: payrollAbi,
          functionName: "genesisEpoch",
          args: [],
        })) as bigint;

        spin.succeed("Epoch info");
        ui.info(`Current epoch: ${current.toString()}`);
        ui.info(`Genesis epoch: ${genesis.toString()}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── resign ───────────────────────────────────────

  payroll
    .command("resign")
    .description("Resign from payroll role (7-day cooldown before stake return)")
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );
        const payrollAddr = getContractAddress(ws.config, "rolePayroll");

        const spin = ui.spinner("Resigning from payroll role...");
        const tx = await walletClient.writeContract({
          address: payrollAddr,
          abi: payrollAbi,
          functionName: "resign",
          args: [],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed("Resigned from payroll role");
        ui.info("7-day cooldown before stake return. Run `lobstr payroll complete-resign` after cooldown.");
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── complete-resign ──────────────────────────────

  payroll
    .command("complete-resign")
    .description("Complete resignation after cooldown (returns stake)")
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(
          ws.config,
          ws.path
        );
        const payrollAddr = getContractAddress(ws.config, "rolePayroll");

        const spin = ui.spinner("Completing resignation...");
        const tx = await walletClient.writeContract({
          address: payrollAddr,
          abi: payrollAbi,
          functionName: "completeResignation",
          args: [],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        spin.succeed("Resignation completed — stake returned");
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
