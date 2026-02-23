import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, isAddress } from "viem";
import { base } from "viem/chains";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SKILL_REGISTRY = process.env
  .NEXT_PUBLIC_SKILL_REGISTRY_ADDRESS as `0x${string}`;
const RPC_URL =
  process.env.GATEWAY_RPC_URL ||
  process.env.NEXT_PUBLIC_ALCHEMY_RPC ||
  "https://mainnet.base.org";

// ---------------------------------------------------------------------------
// Minimal ABI
// ---------------------------------------------------------------------------

const SKILL_REGISTRY_ABI = [
  {
    name: "getSkill",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "skillId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "seller", type: "address" },
          { name: "assetType", type: "uint8" },
          { name: "deliveryMethod", type: "uint8" },
          { name: "pricingModel", type: "uint8" },
          { name: "title", type: "string" },
          { name: "description", type: "string" },
          { name: "metadataURI", type: "string" },
          { name: "version", type: "uint256" },
          { name: "price", type: "uint256" },
          { name: "settlementToken", type: "address" },
          { name: "apiEndpointHash", type: "bytes32" },
          { name: "packageHash", type: "bytes32" },
          { name: "active", type: "bool" },
          { name: "totalPurchases", type: "uint256" },
          { name: "totalCalls", type: "uint256" },
          { name: "createdAt", type: "uint256" },
          { name: "updatedAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "hasActiveAccess",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "buyer", type: "address" },
      { name: "skillId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getBuyerCredits",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "buyer", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ---------------------------------------------------------------------------
// RPC client (singleton)
// ---------------------------------------------------------------------------

const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const skillIdRaw = searchParams.get("skillId");
    const buyer = searchParams.get("buyer");

    if (!skillIdRaw) {
      return NextResponse.json(
        { error: "Missing skillId query parameter" },
        { status: 400 },
      );
    }

    if (!buyer || !isAddress(buyer)) {
      return NextResponse.json(
        { error: "Missing or invalid buyer query parameter" },
        { status: 400 },
      );
    }

    const skillId = BigInt(skillIdRaw);
    const buyerAddress = buyer as `0x${string}`;

    // Read skill data, access status, and credits in parallel
    const [skill, hasAccess] = await Promise.all([
      publicClient.readContract({
        address: SKILL_REGISTRY,
        abi: SKILL_REGISTRY_ABI,
        functionName: "getSkill",
        args: [skillId],
      }),
      publicClient.readContract({
        address: SKILL_REGISTRY,
        abi: SKILL_REGISTRY_ABI,
        functionName: "hasActiveAccess",
        args: [buyerAddress, skillId],
      }),
    ]);

    // Fetch credits using the skill's settlement token
    const credits = await publicClient.readContract({
      address: SKILL_REGISTRY,
      abi: SKILL_REGISTRY_ABI,
      functionName: "getBuyerCredits",
      args: [buyerAddress, skill.settlementToken],
    });

    return NextResponse.json({
      hasAccess,
      pricingModel: skill.pricingModel,
      creditsRemaining: credits.toString(),
    });
  } catch (err) {
    console.error("[gateway/verify] Error:", err);
    return NextResponse.json(
      {
        error: `Verification failed: ${err instanceof Error ? err.message : "unknown"}`,
      },
      { status: 500 },
    );
  }
}
