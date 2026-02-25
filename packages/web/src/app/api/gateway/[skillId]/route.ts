import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  recoverMessageAddress,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
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
const GATEWAY_KEY = process.env.GATEWAY_PRIVATE_KEY as
  | `0x${string}`
  | undefined;

const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000; // 5 minutes

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
  {
    name: "recordUsage",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "accessId", type: "uint256" },
      { name: "calls", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// ---------------------------------------------------------------------------
// Pricing model enum (mirrors SkillRegistry.sol)
// ---------------------------------------------------------------------------

const PRICING_PER_CALL = 2; // PricingModel.PER_CALL

// ---------------------------------------------------------------------------
// RPC client (singleton)
// ---------------------------------------------------------------------------

const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

// ---------------------------------------------------------------------------
// Metadata endpoint cache (module-level, 5-min TTL)
// ---------------------------------------------------------------------------

const endpointCache = new Map<
  string,
  { endpoint: string; expiry: number }
>();

const CACHE_TTL_MS = 5 * 60 * 1000;

async function resolveEndpoint(
  metadataURI: string,
  expectedHash: `0x${string}`,
): Promise<string> {
  const cached = endpointCache.get(metadataURI);
  if (cached && cached.expiry > Date.now()) {
    return cached.endpoint;
  }

  const res = await fetch(metadataURI);
  if (!res.ok) {
    throw new Error(`Failed to fetch metadata: ${res.status}`);
  }

  const metadata = (await res.json()) as { apiEndpoint?: string };
  const endpoint = metadata.apiEndpoint;
  if (!endpoint || typeof endpoint !== "string") {
    throw new Error("Metadata missing apiEndpoint field");
  }

  // Verify the endpoint matches the on-chain hash
  const computedHash = keccak256(toHex(endpoint));
  if (computedHash !== expectedHash) {
    throw new Error("apiEndpoint hash mismatch — metadata may be tampered");
  }

  endpointCache.set(metadataURI, {
    endpoint,
    expiry: Date.now() + CACHE_TTL_MS,
  });

  return endpoint;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ skillId: string }> },
) {
  try {
    // 1. Parse params & headers
    const { skillId: skillIdRaw } = await params;
    const skillId = BigInt(skillIdRaw);

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or malformed Authorization header" },
        { status: 401 },
      );
    }
    const signature = authHeader.slice(7) as `0x${string}`;

    const accessIdRaw = request.headers.get("x-access-id");
    if (!accessIdRaw) {
      return NextResponse.json(
        { error: "Missing X-Access-Id header" },
        { status: 400 },
      );
    }
    const accessId = BigInt(accessIdRaw);

    const timestampRaw = request.headers.get("x-timestamp");
    if (!timestampRaw) {
      return NextResponse.json(
        { error: "Missing X-Timestamp header" },
        { status: 400 },
      );
    }
    const timestamp = Number(timestampRaw);

    // 2. Verify EIP-191 signature
    const now = Date.now();
    if (Math.abs(now - timestamp * 1000) > MAX_TIMESTAMP_DRIFT_MS) {
      return NextResponse.json(
        { error: "Timestamp expired or too far in the future" },
        { status: 401 },
      );
    }

    const message = `lobstr-gateway:${skillIdRaw}:${accessIdRaw}:${timestampRaw}`;

    let buyer: `0x${string}`;
    try {
      buyer = await recoverMessageAddress({ message, signature });
    } catch {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 },
      );
    }

    // 3. Read skill on-chain
    const skill = await publicClient.readContract({
      address: SKILL_REGISTRY,
      abi: SKILL_REGISTRY_ABI,
      functionName: "getSkill",
      args: [skillId],
    });

    if (!skill.active) {
      return NextResponse.json(
        { error: "Skill is not active" },
        { status: 403 },
      );
    }

    // 4. Check access
    const hasAccess = await publicClient.readContract({
      address: SKILL_REGISTRY,
      abi: SKILL_REGISTRY_ABI,
      functionName: "hasActiveAccess",
      args: [buyer, skillId],
    });

    if (!hasAccess) {
      return NextResponse.json(
        { error: "No active access for this skill" },
        { status: 403 },
      );
    }

    // 5. For PER_CALL pricing, verify credits
    const isPerCall = skill.pricingModel === PRICING_PER_CALL;
    if (isPerCall) {
      const credits = await publicClient.readContract({
        address: SKILL_REGISTRY,
        abi: SKILL_REGISTRY_ABI,
        functionName: "getBuyerCredits",
        args: [buyer, skill.settlementToken],
      });

      if (credits < skill.price) {
        return NextResponse.json(
          { error: "Insufficient credits for this call" },
          { status: 403 },
        );
      }
    }

    // 6. Resolve seller endpoint from metadata
    let sellerEndpoint: string;
    try {
      sellerEndpoint = await resolveEndpoint(
        skill.metadataURI,
        skill.apiEndpointHash as `0x${string}`,
      );
    } catch (err) {
      console.error("[gateway] Failed to resolve seller endpoint:", err);
      return NextResponse.json(
        { error: "Failed to resolve seller endpoint" },
        { status: 502 },
      );
    }

    // 7. Proxy request to seller
    let sellerResponse: Response;
    try {
      const body = await request.arrayBuffer();
      sellerResponse = await fetch(sellerEndpoint, {
        method: "POST",
        headers: {
          "content-type":
            request.headers.get("content-type") || "application/json",
        },
        body,
      });
    } catch (err) {
      console.error("[gateway] Seller endpoint unreachable:", err);
      return NextResponse.json(
        { error: "Seller endpoint unreachable" },
        { status: 502 },
      );
    }

    // 8. Record usage for PER_CALL pricing
    if (isPerCall && sellerResponse.ok) {
      if (!GATEWAY_KEY) {
        // Return the seller response but warn about metering failure
        const responseBody = await sellerResponse.arrayBuffer();
        return new NextResponse(responseBody, {
          status: 503,
          headers: {
            "content-type":
              sellerResponse.headers.get("content-type") ||
              "application/json",
            "x-gateway-warning": "Gateway not configured for metered calls",
          },
        });
      }

      try {
        const account = privateKeyToAccount(GATEWAY_KEY);
        const walletClient = createWalletClient({
          account,
          chain: base,
          transport: http(RPC_URL),
        });

        await walletClient.writeContract({
          address: SKILL_REGISTRY,
          abi: SKILL_REGISTRY_ABI,
          functionName: "recordUsage",
          args: [accessId, 1n],
        });
      } catch (err) {
        console.error(
          "[gateway] recordUsage failed:",
          err instanceof Error ? err.message : err,
        );
        // Still return seller response — usage will be reconciled later
      }
    }

    // 9. Return seller response to caller
    const responseBody = await sellerResponse.arrayBuffer();
    return new NextResponse(responseBody, {
      status: sellerResponse.status,
      headers: {
        "content-type":
          sellerResponse.headers.get("content-type") || "application/json",
      },
    });
  } catch (err) {
    console.error("[gateway] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal gateway error" },
      { status: 500 },
    );
  }
}
