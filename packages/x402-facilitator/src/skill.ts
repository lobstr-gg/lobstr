import {
  type Address,
  type WalletClient,
  type PublicClient,
  parseAbi,
  decodeEventLog,
} from "viem";
import { CONTRACTS, CHAIN } from "./config.js";

// ─── Skill Registry ABI (functions used by facilitator) ─────────────────────

const SKILL_REGISTRY_ABI = parseAbi([
  "function getSkill(uint256 skillId) view returns ((uint256 id, address seller, uint8 assetType, uint8 deliveryMethod, uint8 pricingModel, string title, string description, string metadataURI, uint256 version, uint256 price, address settlementToken, bytes32 apiEndpointHash, bytes32 packageHash, bool active, uint256 totalPurchases, uint256 totalCalls, uint256 createdAt, uint256 updatedAt))",
  "function purchaseSkill(uint256 skillId) returns (uint256 accessId)",
  "function hasActiveAccess(address buyer, uint256 skillId) view returns (bool)",
  "function recordUsage(uint256 accessId, uint256 calls)",
  "function getAccessByBuyer(address buyer, uint256 skillId) view returns ((uint256 id, uint256 skillId, address buyer, uint8 pricingModel, uint256 purchasedAt, uint256 expiresAt, uint256 callsUsed, uint256 callsLimit, bool active))",
  "event SkillPurchased(uint256 indexed skillId, address indexed buyer, uint256 accessId, uint8 pricingModel, uint256 amount)",
  "event UsageRecorded(uint256 indexed accessId, uint256 calls, uint256 totalCalls)",
]);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SkillExtension {
  skillId: string;
  buyer: string;
}

export interface SkillSettlementResult {
  accessId: string;
  txHash: `0x${string}`;
}

// PricingModel enum values from SkillRegistry contract
const PricingModel = {
  ONE_TIME: 0,
  SUBSCRIPTION: 1,
  PER_CALL: 2,
} as const;

// ─── Settlement Function ────────────────────────────────────────────────────

/**
 * Settles a payment through the SkillRegistry.
 *
 * If the buyer doesn't have active access to the skill, the facilitator calls
 * purchaseSkill on their behalf. For PER_CALL skills where the buyer already
 * has access, it records a single usage call instead.
 */
export async function settleViaSkill(
  skillExt: SkillExtension,
  walletClient: WalletClient,
  readClient: PublicClient,
): Promise<SkillSettlementResult> {
  const registryAddress = CONTRACTS.skillRegistry;
  if (!registryAddress || registryAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error("SkillRegistry address not configured");
  }

  const skillId = BigInt(skillExt.skillId);
  const buyerAddr = skillExt.buyer as Address;

  // 1. Read skill data and verify it's active
  const skill = await readClient.readContract({
    address: registryAddress,
    abi: SKILL_REGISTRY_ABI,
    functionName: "getSkill",
    args: [skillId],
  });

  if (!skill.active) {
    throw new Error(`Skill ${skillId} is not active`);
  }

  // 2. Check if buyer already has access
  const hasAccess = await readClient.readContract({
    address: registryAddress,
    abi: SKILL_REGISTRY_ABI,
    functionName: "hasActiveAccess",
    args: [buyerAddr, skillId],
  });

  // 3. If PER_CALL and buyer already has access, record usage instead of purchasing
  if (hasAccess && skill.pricingModel === PricingModel.PER_CALL) {
    // Fetch the existing access record to get accessId
    const access = await readClient.readContract({
      address: registryAddress,
      abi: SKILL_REGISTRY_ABI,
      functionName: "getAccessByBuyer",
      args: [buyerAddr, skillId],
    });

    const txHash = await walletClient.writeContract({
      chain: CHAIN,
      account: walletClient.account!,
      address: registryAddress,
      abi: SKILL_REGISTRY_ABI,
      functionName: "recordUsage",
      args: [access.id, 1n],
    });

    await readClient.waitForTransactionReceipt({ hash: txHash });

    console.log(`[settle] Skill usage recorded: accessId=${access.id}, tx=${txHash}`);
    return { accessId: access.id.toString(), txHash };
  }

  // 4. If buyer already has access (non-PER_CALL), just return existing access
  if (hasAccess) {
    const access = await readClient.readContract({
      address: registryAddress,
      abi: SKILL_REGISTRY_ABI,
      functionName: "getAccessByBuyer",
      args: [buyerAddr, skillId],
    });

    // No on-chain tx needed — buyer already owns access
    return { accessId: access.id.toString(), txHash: "0x0" as `0x${string}` };
  }

  // 5. No access — purchase the skill
  const txHash = await walletClient.writeContract({
    chain: CHAIN,
    account: walletClient.account!,
    address: registryAddress,
    abi: SKILL_REGISTRY_ABI,
    functionName: "purchaseSkill",
    args: [skillId],
  });

  // Wait for receipt and extract accessId from SkillPurchased event
  const receipt = await readClient.waitForTransactionReceipt({ hash: txHash });

  let accessId = "0";
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: SKILL_REGISTRY_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "SkillPurchased") {
        const args = decoded.args as {
          skillId: bigint;
          buyer: Address;
          accessId: bigint;
          pricingModel: number;
          amount: bigint;
        };
        accessId = args.accessId.toString();
        break;
      }
    } catch {
      // Not our event, skip
    }
  }

  if (accessId === "0") {
    throw new Error("SkillPurchased event not found in transaction receipt");
  }

  return { accessId, txHash };
}
