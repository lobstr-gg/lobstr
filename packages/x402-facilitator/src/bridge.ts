import {
  type Address,
  type WalletClient,
  type PublicClient,
  type Chain,
  parseAbi,
  decodeEventLog,
} from "viem";
import { CONTRACTS, CHAIN } from "./config.js";

// ─── Bridge ABI (write functions used by facilitator) ────────────────────────

const BRIDGE_ABI = parseAbi([
  "function depositAndCreateJob((bytes32 x402Nonce, address payer, address token, uint256 amount, uint256 listingId, address seller, uint256 deadline) intent, uint8 v, bytes32 r, bytes32 s) returns (uint256 jobId)",
  "function depositWithAuthorization((address from, address token, uint256 amount, uint256 validAfter, uint256 validBefore, bytes32 eip3009Nonce) auth, uint8 v, bytes32 r, bytes32 s, (bytes32 x402Nonce, address payer, address token, uint256 amount, uint256 listingId, address seller, uint256 deadline) intent, uint8 intentV, bytes32 intentR, bytes32 intentS) returns (uint256 jobId)",
  "function nonceUsed(bytes32) view returns (bool)",
  "function paymentToJob(bytes32) view returns (uint256)",
  "event EscrowedJobCreated(bytes32 indexed x402Nonce, uint256 indexed jobId, address indexed payer, address seller, uint256 amount, address token)",
]);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PaymentIntent {
  x402Nonce: `0x${string}`;
  payer: Address;
  token: Address;
  amount: bigint;
  listingId: bigint;
  seller: Address;
  deadline: bigint;
}

export interface ERC3009Auth {
  from: Address;
  token: Address;
  amount: bigint;
  validAfter: bigint;
  validBefore: bigint;
  eip3009Nonce: `0x${string}`;
}

export interface BridgeExtension {
  listingId: number;
  paymentIntent: {
    x402Nonce: string;
    payer: string;
    token: string;
    amount: string;
    listingId: number;
    seller: string;
    deadline: number;
  };
  intentSignature: {
    v: number;
    r: string;
    s: string;
  };
  // Optional: EIP-3009 fields for USDC transfer-with-authorization flow
  erc3009Auth?: {
    from: string;
    token: string;
    amount: string;
    validAfter: number;
    validBefore: number;
    eip3009Nonce: string;
  };
  erc3009Signature?: {
    v: number;
    r: string;
    s: string;
  };
}

export interface BridgeSettlementResult {
  jobId: bigint;
  txHash: `0x${string}`;
}

// ─── Settlement Functions ────────────────────────────────────────────────────

/**
 * Settles a payment through the X402EscrowBridge.
 *
 * Mode A (depositAndCreateJob): Payer has approved the bridge. Facilitator
 * submits their EIP-712 PaymentIntent signature.
 *
 * Mode B (depositWithAuthorization): Payer signed an EIP-3009
 * receiveWithAuthorization + PaymentIntent. Facilitator submits both.
 */
export async function settleViaBridge(
  bridgeExt: BridgeExtension,
  walletClient: WalletClient,
  readClient: PublicClient,
): Promise<BridgeSettlementResult> {
  const bridgeAddress = CONTRACTS.x402EscrowBridge;
  const { paymentIntent: pi, intentSignature: sig } = bridgeExt;

  // Build the PaymentIntent struct
  const intent: PaymentIntent = {
    x402Nonce: pi.x402Nonce as `0x${string}`,
    payer: pi.payer as Address,
    token: pi.token as Address,
    amount: BigInt(pi.amount),
    listingId: BigInt(pi.listingId),
    seller: pi.seller as Address,
    deadline: BigInt(pi.deadline),
  };

  // Check nonce hasn't been used
  const used = await readClient.readContract({
    address: bridgeAddress,
    abi: BRIDGE_ABI,
    functionName: "nonceUsed",
    args: [intent.x402Nonce],
  });
  if (used) {
    throw new Error(`x402 nonce already used: ${intent.x402Nonce}`);
  }

  let txHash: `0x${string}`;

  if (bridgeExt.erc3009Auth && bridgeExt.erc3009Signature) {
    // Mode B: EIP-3009 deposit
    const auth3009 = bridgeExt.erc3009Auth;
    const sig3009 = bridgeExt.erc3009Signature;

    txHash = await walletClient.writeContract({
      chain: CHAIN,
      account: walletClient.account!,
      address: bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: "depositWithAuthorization",
      args: [
        {
          from: auth3009.from as Address,
          token: auth3009.token as Address,
          amount: BigInt(auth3009.amount),
          validAfter: BigInt(auth3009.validAfter),
          validBefore: BigInt(auth3009.validBefore),
          eip3009Nonce: auth3009.eip3009Nonce as `0x${string}`,
        },
        sig3009.v,
        sig3009.r as `0x${string}`,
        sig3009.s as `0x${string}`,
        intent,
        sig.v,
        sig.r as `0x${string}`,
        sig.s as `0x${string}`,
      ],
    });
  } else {
    // Mode A: Pull deposit (payer pre-approved bridge)
    txHash = await walletClient.writeContract({
      chain: CHAIN,
      account: walletClient.account!,
      address: bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: "depositAndCreateJob",
      args: [
        intent,
        sig.v,
        sig.r as `0x${string}`,
        sig.s as `0x${string}`,
      ],
    });
  }

  // Wait for receipt and extract jobId from event logs
  const receipt = await readClient.waitForTransactionReceipt({ hash: txHash });

  let jobId = 0n;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: BRIDGE_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "EscrowedJobCreated") {
        jobId = (decoded.args as { jobId: bigint }).jobId;
        break;
      }
    } catch {
      // Not our event, skip
    }
  }

  if (jobId === 0n) {
    throw new Error("EscrowedJobCreated event not found in transaction receipt");
  }

  return { jobId, txHash };
}
