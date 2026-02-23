import {
  type Address,
  type WalletClient,
  type PublicClient,
  parseAbi,
  decodeEventLog,
} from "viem";
import { CONTRACTS, CHAIN } from "./config.js";

// ─── Credit Facility ABI (write functions used by facilitator) ───────────────

const CREDIT_FACILITY_ABI = parseAbi([
  "function drawCreditForAgent(address agent, uint256 listingId, address seller, uint256 amount) returns (uint256 drawId)",
  "function getCreditLine(address agent) view returns ((address agent, uint256 creditLimit, uint256 totalDrawn, uint256 totalRepaid, uint256 interestRateBps, uint256 collateralDeposited, uint8 status, uint256 openedAt, uint256 defaults, uint256 activeDraws))",
  "function getAvailableCredit(address agent) view returns (uint256)",
  "function escrowJobToDraw(uint256 escrowJobId) view returns (uint256)",
  "event CreditDrawn(uint256 indexed drawId, address indexed agent, uint256 amount, uint256 indexed escrowJobId)",
]);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreditExtension {
  agent: string;
  listingId: number;
  seller: string;
  amount: string;
}

export interface CreditSettlementResult {
  drawId: bigint;
  escrowJobId: bigint;
  txHash: `0x${string}`;
}

// ─── Settlement Function ─────────────────────────────────────────────────────

/**
 * Settles a payment through the X402CreditFacility.
 *
 * The facilitator calls drawCreditForAgent on behalf of the agent,
 * which draws from the lending pool and creates an escrow job on EscrowEngine.
 * The agent must have an active credit line with sufficient available credit.
 */
export async function settleViaCredit(
  creditExt: CreditExtension,
  walletClient: WalletClient,
  readClient: PublicClient,
): Promise<CreditSettlementResult> {
  const facilityAddress = CONTRACTS.x402CreditFacility;
  if (!facilityAddress || facilityAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error("X402CreditFacility address not configured");
  }

  const agentAddr = creditExt.agent as Address;
  const sellerAddr = creditExt.seller as Address;
  const amount = BigInt(creditExt.amount);
  const listingId = BigInt(creditExt.listingId);

  // Check agent has available credit
  const available = await readClient.readContract({
    address: facilityAddress,
    abi: CREDIT_FACILITY_ABI,
    functionName: "getAvailableCredit",
    args: [agentAddr],
  });

  if (available < amount) {
    throw new Error(
      `Insufficient credit: agent has ${available.toString()} available, needs ${amount.toString()}`
    );
  }

  // Draw credit and create escrow job
  const txHash = await walletClient.writeContract({
    chain: CHAIN,
    account: walletClient.account!,
    address: facilityAddress,
    abi: CREDIT_FACILITY_ABI,
    functionName: "drawCreditForAgent",
    args: [agentAddr, listingId, sellerAddr, amount],
  });

  // Wait for receipt and extract drawId + escrowJobId from event
  const receipt = await readClient.waitForTransactionReceipt({ hash: txHash });

  let drawId = 0n;
  let escrowJobId = 0n;

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: CREDIT_FACILITY_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "CreditDrawn") {
        const args = decoded.args as {
          drawId: bigint;
          agent: Address;
          amount: bigint;
          escrowJobId: bigint;
        };
        drawId = args.drawId;
        escrowJobId = args.escrowJobId;
        break;
      }
    } catch {
      // Not our event, skip
    }
  }

  if (drawId === 0n) {
    throw new Error("CreditDrawn event not found in transaction receipt");
  }

  return { drawId, escrowJobId, txHash };
}
