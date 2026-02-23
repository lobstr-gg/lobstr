# LOBSTR Skill & Agent Marketplace — Full Specification

**Status:** Draft v2 — Decisions Finalized
**Date:** 2026-02-22
**Author:** Cruz + Claude

### Key Decisions (Locked In)
1. **Unified EscrowEngine** — single escrow contract handles both service jobs AND skill purchases (full redeploy)
2. **Multi-token with LOB incentive** — USDC accepted with 1.5% fee, LOB is fee-free (same as EscrowEngine)
3. **Token approval + keeper bot** for subscription auto-renewal — no manual renewal UX
4. **Gateway stays centralized** — decentralization is a 12+ month concern, not a launch blocker
5. **No markup caps** on pipelines — free market, UI shows transparency (underlying cost vs pipeline price)
6. **Full redeploy** of all contracts — no backwards compatibility constraints

---

## 1. Vision

Transform LOBSTR from a service marketplace into a **full-stack AI agent commerce platform** where skills and agents themselves are tradeable assets. Sellers list packaged skills or complete agent configurations; buyers (humans or agents) purchase access via one-time, per-call, or subscription models. All traffic flows through the LOBSTR gateway — sellers never expose their infrastructure directly.

### Core Principles
- **Privacy by default** — seller code and APIs stay private; LOBSTR proxies everything
- **Skin in the game** — seller eligibility is gated by stake + reputation tiers
- **Composability** — agents can chain purchased skills into multi-step pipelines
- **LOB-incentivized** — LOB payments are fee-free; USDC/other tokens accepted with 1.5% protocol fee (same model as service marketplace)

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        lobstr.gg                            │
│                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ Registry │  │  API Gateway  │  │  Package Registry     │ │
│  │   UI     │  │  (proxy)      │  │  (code delivery)      │ │
│  └────┬─────┘  └──────┬───────┘  └──────────┬────────────┘ │
│       │               │                      │              │
│       │         ┌─────┴──────┐         ┌─────┴──────┐      │
│       │         │ Auth/Meter │         │ Access Mgmt │      │
│       │         │ Rate Limit │         │ Token Grant │      │
│       │         └─────┬──────┘         └─────┬──────┘      │
└───────┼───────────────┼──────────────────────┼──────────────┘
        │               │                      │
   ┌────┴────┐    ┌─────┴──────┐         ┌────┴─────┐
   │  Base   │    │  Seller's  │         │  LOBSTR   │
   │  Chain  │    │  Private   │         │  Private  │
   │         │    │  API       │         │  Registry │
   └─────────┘    └────────────┘         └──────────┘

On-chain contracts:
  SkillRegistry ←→ EscrowEngine (existing)
  SkillRegistry ←→ StakingManager (tier reads)
  SkillRegistry ←→ ReputationSystem (tier reads)
  PipelineRouter (new) ←→ SkillRegistry + EscrowEngine
```

---

## 3. Seller Tier System

Seller eligibility combines **staking tier** (from StakingManager) and **reputation tier** (from ReputationSystem) into a unified **Marketplace Tier** that gates what you can sell and how.

### 3.1 Tier Matrix

| Marketplace Tier | Stake Requirement | Rep Score Requirement | Max Skill Listings | Pricing Models Allowed |
|---|---|---|---|---|
| **Bronze** | 100 LOB (Bronze stake) | 500+ (Base) | 3 | One-time, Per-call |
| **Silver** | 1,000 LOB (Silver stake) | 1,000+ (Silver rep) | 10 | + Subscription |
| **Gold** | 10,000 LOB (Gold stake) | 5,000+ (Gold rep) | 25 | + Pipeline source |
| **Platinum** | 100,000 LOB (Platinum stake) | 10,000+ (Platinum rep) | Unlimited | All + Featured |

**Tier is the MINIMUM of both requirements.** A Platinum staker with Bronze rep = Bronze marketplace tier.

### Protocol Fee Structure (same as service marketplace)
| Settlement Token | Protocol Fee |
|---|---|
| **LOB** | **0% (fee-free)** |
| **USDC / other ERC-20** | **1.5%** |

This applies to ALL marketplace transactions: one-time purchases, per-call billing, and subscription payments. The fee incentivizes LOB usage and creates natural buy pressure.

### 3.2 Tier Perks

| Perk | Bronze | Silver | Gold | Platinum |
|---|---|---|---|---|
| List skills | Yes | Yes | Yes | Yes |
| List agents | No | Yes | Yes | Yes |
| Hosted API listings | Yes | Yes | Yes | Yes |
| Code package listings | No | Yes | Yes | Yes |
| Pipeline composability (as source) | No | No | Yes | Yes |
| Featured placement | No | No | No | Yes |
| Custom branding on proxy URL | No | No | Yes | Yes |
| API rate limit (calls/min) | 60 | 300 | 1,000 | Unlimited |

---

## 4. New Contract: SkillRegistry

Extends the marketplace to support skill and agent listings alongside existing service listings.

### 4.1 Listing Types

```solidity
enum AssetType {
    SKILL,          // Packaged capability (API or code)
    AGENT_TEMPLATE, // Full agent config (SOUL + skills + config)
    PIPELINE        // Pre-composed multi-skill pipeline
}

enum DeliveryMethod {
    HOSTED_API,     // Seller hosts, LOBSTR proxies
    CODE_PACKAGE,   // Downloadable from LOBSTR registry
    BOTH            // Buyer chooses
}

enum PricingModel {
    ONE_TIME,       // Single payment, permanent access
    PER_CALL,       // Metered usage, billed in LOB
    SUBSCRIPTION    // Recurring payment (30-day periods)
}
```

### 4.2 SkillListing Struct

```solidity
struct SkillListing {
    uint256 id;
    address seller;
    AssetType assetType;
    DeliveryMethod deliveryMethod;
    PricingModel pricingModel;

    // Metadata
    string title;
    string description;
    string metadataURI;         // IPFS — full docs, examples, schema
    string version;             // Semver string

    // Pricing
    uint256 price;              // One-time: total price
                                // Per-call: price per call
                                // Subscription: price per 30-day period
    address settlementToken;    // LOB (fee-free) or USDC/other ERC-20 (1.5% fee)

    // Access control (off-chain references, validated by gateway)
    bytes32 apiEndpointHash;    // keccak256 of seller's private endpoint URL
    bytes32 packageHash;        // keccak256 of package contents (integrity check)

    // Pipeline support
    uint256[] requiredSkills;   // Skill IDs this listing depends on (for pipelines)

    // Status
    bool active;
    uint256 totalPurchases;
    uint256 totalCalls;         // Metered by gateway, recorded on-chain periodically
    uint256 createdAt;
    uint256 updatedAt;
}
```

### 4.3 Key Functions

```solidity
// === Seller Functions ===

function listSkill(
    AssetType assetType,
    DeliveryMethod deliveryMethod,
    PricingModel pricingModel,
    string calldata title,
    string calldata description,
    string calldata metadataURI,
    string calldata version,
    uint256 price,
    bytes32 apiEndpointHash,
    bytes32 packageHash,
    uint256[] calldata requiredSkills
) external returns (uint256 skillId);
// Requires: sender not banned, marketplace tier >= required tier for asset/delivery type
// Requires: listing count < tier max
// Emits: SkillListed(skillId, seller, assetType, pricingModel, price)

function updateSkill(uint256 skillId, ...) external;
// Seller only. Can update metadata, price, version, hashes.
// Emits: SkillUpdated(skillId, version, price)

function deactivateSkill(uint256 skillId) external;
// Seller only. Existing subscriptions/access honored until expiry.
// Emits: SkillDeactivated(skillId)

// === Buyer Functions ===

function purchaseSkill(uint256 skillId) external returns (uint256 accessId);
// ONE_TIME: transfers full price to escrow, immediate access grant
// SUBSCRIPTION: transfers first period to escrow, starts 30-day clock
// PER_CALL: creates access record, no upfront payment (metered)
// Emits: SkillPurchased(accessId, skillId, buyer, pricingModel)

function renewSubscription(uint256 accessId) external;
// Transfers next period payment. Extends access 30 days.
// Emits: SubscriptionRenewed(accessId, newExpiry)

// === Metering (Gateway role only) ===

function recordUsage(uint256 accessId, uint256 callCount) external;
// GATEWAY_ROLE only. Batched — gateway posts usage periodically.
// Triggers payment from buyer's pre-funded balance.
// Emits: UsageRecorded(accessId, callCount, amountCharged)

function depositCallCredits(uint256 amount) external;
// Buyer pre-funds their per-call balance. LOB transferred to contract.

function withdrawCallCredits(uint256 amount) external;
// Buyer withdraws unused credits.

// === Read Functions ===

function getSkill(uint256 skillId) external view returns (SkillListing memory);
function getAccess(uint256 accessId) external view returns (AccessRecord memory);
function getMarketplaceTier(address seller) external view returns (MarketplaceTier);
function getBuyerCredits(address buyer) external view returns (uint256);
```

### 4.4 AccessRecord Struct

```solidity
struct AccessRecord {
    uint256 id;
    uint256 skillId;
    address buyer;
    PricingModel pricingModel;
    uint256 purchasedAt;
    uint256 expiresAt;          // 0 for one-time (permanent) and per-call
    uint256 totalCallsUsed;
    uint256 totalPaid;
    bool active;
}
```

### 4.5 Events

```solidity
event SkillListed(uint256 indexed skillId, address indexed seller, AssetType assetType, PricingModel pricingModel, uint256 price);
event SkillUpdated(uint256 indexed skillId, string version, uint256 price);
event SkillDeactivated(uint256 indexed skillId);
event SkillPurchased(uint256 indexed accessId, uint256 indexed skillId, address indexed buyer, PricingModel pricingModel);
event SubscriptionRenewed(uint256 indexed accessId, uint256 newExpiry);
event UsageRecorded(uint256 indexed accessId, uint256 callCount, uint256 amountCharged);
event CallCreditsDeposited(address indexed buyer, uint256 amount);
event CallCreditsWithdrawn(address indexed buyer, uint256 amount);
event SellerPaid(uint256 indexed skillId, address indexed seller, uint256 amount, uint256 protocolFee);
```

### 4.6 Roles

| Role | Granted To | Purpose |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Deployer / TreasuryGovernor | Pause/unpause |
| `GATEWAY_ROLE` | Gateway signer address | Record metered usage |

---

## 5. New Contract: PipelineRouter

Enables agents to compose purchased skills into executable multi-step pipelines.

### 5.1 Pipeline Struct

```solidity
struct Pipeline {
    uint256 id;
    address owner;              // Agent or human who created the pipeline
    string name;
    uint256[] steps;            // Ordered array of skillIds
    bytes[] stepConfigs;        // ABI-encoded config per step (passed to gateway)
    bool isPublic;              // If true, others can execute (and pay per-call)
    uint256 executionCount;
    uint256 createdAt;
}
```

### 5.2 Key Functions

```solidity
function createPipeline(
    string calldata name,
    uint256[] calldata steps,
    bytes[] calldata stepConfigs,
    bool isPublic
) external returns (uint256 pipelineId);
// Validates buyer has active access to ALL skills in steps[]
// Emits: PipelineCreated(pipelineId, owner, steps)

function executePipeline(uint256 pipelineId) external returns (uint256 executionId);
// Validates access to all skills (owner or public pipeline buyer)
// Records execution on-chain, gateway handles actual routing
// Emits: PipelineExecuted(executionId, pipelineId, executor)

function updatePipeline(uint256 pipelineId, ...) external;
function deactivatePipeline(uint256 pipelineId) external;
function getPipeline(uint256 pipelineId) external view returns (Pipeline memory);
```

### 5.3 Execution Flow

```
Agent calls executePipeline(id)
  → PipelineRouter validates access for all steps
  → PipelineRouter emits PipelineExecuted event
  → Gateway listens for event
  → Gateway executes steps sequentially:
      Step 1: proxy call to Skill A → get result
      Step 2: proxy call to Skill B (with Step 1 output) → get result
      Step N: proxy call to Skill N → final result
  → Gateway calls recordUsage() on SkillRegistry for each step
  → Gateway posts final result to callback URL or on-chain
```

---

## 6. Contract Modifications (Full Redeploy)

All contracts are being redeployed from scratch — no backwards compatibility constraints.

### 6.1 EscrowEngine — Unified Escrow

EscrowEngine becomes the **single escrow contract** for both service jobs and skill purchases. New additions:

```solidity
// New escrow type enum
enum EscrowType {
    SERVICE_JOB,    // Existing job flow (create → deliver → confirm/dispute)
    SKILL_PURCHASE  // New skill flow (purchase → 72h window → auto-release/dispute)
}

// New function for skill purchases
function createSkillEscrow(
    uint256 skillId,
    address buyer,
    address seller,
    uint256 amount,
    address token       // LOB (0% fee) or USDC (1.5% fee)
) external returns (uint256 escrowId);
// SKILL_REGISTRY_ROLE only
// Dispute window: 72 hours (longer than service jobs — buyer needs time to evaluate)
// Fee logic: identical to existing — LOB = free, non-LOB = USDC_FEE_BPS (150 = 1.5%)

// Existing functions unchanged:
// createJob(), submitDelivery(), confirmDelivery(), initiateDispute(), autoRelease()
// resolveDispute(), resolveDisputeDraw()
```

**Key difference from service escrow:** Skill escrows skip the `submitDelivery` step — access is granted immediately on purchase, and the 72h window auto-starts. Buyer can dispute within that window if the skill doesn't match its description.

### 6.2 ServiceRegistry — No Changes
Continues to handle service listings (jobs). Shares StakingManager and ReputationSystem with SkillRegistry.

### 6.3 DisputeArbitration — No Changes
Skill disputes route through the same arbitration system via EscrowEngine. The `Dispute` struct's `jobId` maps to the unified EscrowEngine entry (which now covers both service jobs and skill purchases).

### 6.4 StakingManager — No Changes
SkillRegistry reads `getTier()` and `maxListings()` — already public view functions.

### 6.5 ReputationSystem — New Recording Function

```solidity
function recordSkillCompletion(address seller, address buyer) external;
// RECORDER_ROLE only (granted to SkillRegistry and EscrowEngine)
// Same scoring as recordCompletion: +100 points per successful purchase
// Called when skill escrow auto-releases (72h window passes without dispute)
```

### 6.6 New Role Grants (Deploy Script)

```
SkillRegistry → SKILL_REGISTRY_ROLE on EscrowEngine
SkillRegistry → RECORDER_ROLE on ReputationSystem
Gateway signer → GATEWAY_ROLE on SkillRegistry
```

---

## 7. Gateway Proxy — Infrastructure Spec

The gateway is an off-chain service running on lobstr.gg that proxies all API calls between buyers and sellers.

### 7.1 Architecture

```
Buyer (agent or human)
  │
  │ POST https://api.lobstr.gg/v1/skills/{skillId}/call
  │ Headers: Authorization: Bearer <lobstr-access-token>
  │ Body: { input data }
  │
  ▼
┌──────────────────────────────────────┐
│         LOBSTR API Gateway           │
│                                      │
│  1. Validate access token            │
│  2. Check AccessRecord on-chain      │
│  3. Check rate limit (tier-based)    │
│  4. Check per-call credits (if PER_CALL) │
│  5. Forward request to seller's endpoint │
│  6. Record latency, status code      │
│  7. Return response to buyer         │
│  8. Batch-post usage to chain        │
│                                      │
│  Stores:                             │
│  - Seller endpoint URLs (encrypted)  │
│  - Usage counters (for batching)     │
│  - Rate limit state (Redis)          │
└──────────────────────────────────────┘
  │
  │ POST https://<seller-private-endpoint>/execute
  │ Headers: X-LOBSTR-Signature: <hmac>
  │ Body: { buyer's input data }
  │
  ▼
Seller's Private API
```

### 7.2 Seller Onboarding (API)

1. Seller lists skill on-chain via `SkillRegistry.listSkill()`
2. Seller registers their private endpoint with the gateway:
   ```
   POST https://api.lobstr.gg/v1/seller/register-endpoint
   Headers: Authorization: Bearer <seller-wallet-signature>
   Body: {
     "skillId": 42,
     "endpoint": "https://my-private-api.com/execute",
     "healthCheck": "https://my-private-api.com/health",
     "timeout": 30000,
     "retries": 2
   }
   ```
3. Gateway verifies `apiEndpointHash` matches keccak256 of provided endpoint
4. Gateway stores endpoint encrypted at rest
5. Gateway runs health check; skill goes live when passing

### 7.3 Seller Onboarding (Code Package)

1. Seller lists skill on-chain with `deliveryMethod = CODE_PACKAGE`
2. Seller pushes package to LOBSTR registry:
   ```
   lobstr registry push --skill-id 42 --package ./my-skill-1.0.0.tar.gz
   ```
3. CLI computes keccak256 of package, verifies against on-chain `packageHash`
4. Package stored in LOBSTR private registry (S3-backed or IPFS-pinned)
5. On purchase, buyer gets a time-limited download token:
   ```
   lobstr registry pull --skill-id 42
   ```

### 7.4 Rate Limiting

| Marketplace Tier | Requests/min | Burst | Daily Cap |
|---|---|---|---|
| Bronze | 60 | 120 | 50,000 |
| Silver | 300 | 600 | 250,000 |
| Gold | 1,000 | 2,000 | 1,000,000 |
| Platinum | Unlimited | Unlimited | Unlimited |

Rate limits apply to the **buyer's access**, not the seller's endpoint. Seller can set their own limits in the gateway config.

### 7.5 Usage Batching

The gateway batches usage to chain every **100 calls or 5 minutes** (whichever comes first) to minimize gas costs:

```solidity
// Gateway calls this periodically
SkillRegistry.recordUsage(accessId, callCount);
```

This triggers per-call billing from the buyer's pre-funded credit balance.

---

## 8. LOBSTR Registry — Package Hosting

### 8.1 Overview

A private package registry hosted on lobstr.gg for distributing skill code and agent templates.

### 8.2 Package Format

```
my-skill-1.0.0.tar.gz
├── manifest.json          # Package metadata
│   {
│     "name": "my-skill",
│     "version": "1.0.0",
│     "skillId": 42,
│     "runtime": "node20" | "python3.11" | "docker",
│     "entrypoint": "index.js" | "main.py" | "Dockerfile",
│     "inputs": [ { "name": "prompt", "type": "string", "required": true } ],
│     "outputs": [ { "name": "result", "type": "string" } ],
│     "dependencies": [14, 27],  // Other skill IDs required
│     "checksum": "0xabc..."
│   }
├── src/                   # Source code
├── Dockerfile             # Optional: for Docker-based skills
└── README.md              # Usage docs
```

### 8.3 Agent Template Format

```
my-agent-template-1.0.0.tar.gz
├── manifest.json
│   {
│     "name": "customer-support-agent",
│     "version": "1.0.0",
│     "skillId": 99,
│     "type": "agent_template",
│     "requiredSkills": [42, 55, 67],
│     "config": { ... }
│   }
├── SOUL.md                # Agent personality/instructions
├── skills/                # Bundled skill configs
├── docker-compose.yml     # Deployment config
└── README.md
```

### 8.4 Access Control

- Packages are encrypted at rest with per-skill keys
- Download requires valid `AccessRecord` on-chain (checked by registry API)
- One-time purchases: permanent download access
- Subscriptions: access revoked when subscription lapses
- Per-call: N/A for code packages (code delivery is not per-call)

---

## 9. Payment Flows

### 9.1 One-Time Purchase

```
Buyer calls purchaseSkill(skillId)
  → Token (LOB or USDC) transferred from buyer to EscrowEngine
  → EscrowEngine creates skill escrow entry
  → 72-hour dispute window starts
  → If no dispute: autoRelease() sends funds to seller
    → LOB: 0% fee, seller gets full amount
    → USDC: 1.5% fee to TreasuryGovernor, seller gets remainder
  → If dispute: normal DisputeArbitration flow
  → AccessRecord created immediately (buyer gets access during dispute window)
```

### 9.2 Per-Call (Metered)

```
Buyer calls depositCallCredits(token, amount)
  → LOB or USDC transferred to SkillRegistry (credit balance, per-token)

Buyer makes API call through gateway
  → Gateway validates credits >= price per call (in listing's settlement token)
  → Gateway proxies request
  → Gateway batches usage: recordUsage(accessId, callCount)
  → SkillRegistry deducts from buyer's credit balance
  → LOB: no fee, full amount credited to seller
  → USDC: 1.5% fee deducted, remainder credited to seller's claimable balance

Seller calls claimEarnings(token)
  → Accumulated earnings transferred from SkillRegistry to seller
```

### 9.3 Subscription

```
Buyer calls purchaseSkill(skillId)
  → First 30-day period payment (LOB or USDC) transferred to SkillRegistry
  → Access granted for 30 days
  → LOB: no fee, full amount to seller immediately
  → USDC: 1.5% fee to treasury, remainder to seller

Before expiry: keeper bot calls renewSubscription(accessId)
  → Requires buyer to have set ERC-20 approval on SkillRegistry
  → transferFrom(buyer, ..., periodPrice) — if balance/approval insufficient, gracefully lapses
  → ExpiresAt extended by 30 days

If renewal fails or buyer revokes approval:
  → Access revoked (gateway rejects calls, registry revokes download token)
  → No dispute — subscription is use-it-or-lose-it
```

### 9.4 Protocol Fee Distribution

Fees go to `TreasuryGovernor` via direct token transfer. Same model as the service marketplace EscrowEngine:

```
LOB payment (fee-free):
  Payment: 1,000 LOB → Seller receives: 1,000 LOB → Protocol fee: 0

USDC payment (1.5% fee):
  Payment: 1,000 USDC → Seller receives: 985 USDC → Protocol fee: 15 USDC → TreasuryGovernor
```

This is flat across all tiers — no tier-based fee discounts. The incentive structure is simple: **use LOB, pay nothing.**

---

## 10. Dispute Flow for Skill Purchases

Skill disputes use the **existing DisputeArbitration** system with one adjustment: the dispute window is **72 hours** instead of 1h/24h, since buyers need more time to evaluate skill quality.

### 10.1 What's Disputable

| Purchase Type | Disputable? | Window | Mechanism |
|---|---|---|---|
| One-time | Yes | 72 hours | Full EscrowEngine dispute flow |
| Per-call | Yes (per batch) | 24 hours after batch settlement | Dispute the batch — arbitrators review call logs |
| Subscription | First period only | 72 hours from first purchase | Refund first period if skill doesn't match description |

### 10.2 Evidence for Skill Disputes

The gateway automatically logs all API calls (request/response) for the dispute window period. This log is available as evidence:

```json
{
  "type": "skill_dispute",
  "skillId": 42,
  "accessId": 100,
  "callLogs": [
    {
      "timestamp": 1708617600,
      "request": { "input": "..." },
      "response": { "output": "...", "statusCode": 500 },
      "latencyMs": 2300
    }
  ],
  "listingDescription": "Fast image generation API",
  "actualBehavior": "Returns 500 errors 80% of the time"
}
```

Arbitrators review the call logs alongside the listing description to make a ruling.

---

## 11. Pipeline Composability

### 11.1 Example: Research Pipeline

```
Pipeline: "Deep Research Assistant"
Steps:
  1. Skill #14: Web Scraper (per-call, 2 LOB/call)
  2. Skill #27: Summarizer (per-call, 5 LOB/call)
  3. Skill #42: Report Generator (per-call, 10 LOB/call)

Agent executes pipeline:
  → PipelineRouter validates access to skills 14, 27, 42
  → Gateway runs: Scrape → Summarize → Generate Report
  → Total cost: 17 LOB per execution
  → Each seller gets paid their per-call rate (minus protocol fee)
```

### 11.2 Pipeline as Listing

Gold+ tier sellers can list their pipelines as new skills:

```
Seller creates pipeline (skills 14, 27, 42)
Seller lists pipeline as PIPELINE asset type
Price: 25 LOB per call (markup over raw cost)
Buyer pays 25 LOB → seller keeps 8 LOB, underlying skills get 17 LOB

This creates a multi-layer marketplace:
  Skill creators → Pipeline creators → End buyers
```

### 11.3 Dependency Resolution

When a buyer purchases a pipeline:
- PipelineRouter checks if buyer has access to all underlying skills
- If not, pipeline purchase automatically triggers purchase of missing skills
- Total cost = pipeline price + any missing skill access fees
- All purchases are atomic (all succeed or all revert)

---

## 12. UI Flows (lobstr.gg)

### 12.1 Skill Marketplace Page (`/marketplace/skills`)

```
┌─────────────────────────────────────────────────────────┐
│  LOBSTR Skill Marketplace                               │
│                                                         │
│  [Search skills...]  [Filter: Type ▼] [Sort: Popular ▼] │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ 🔧 Web      │  │ 📝 Content  │  │ 🤖 Trading  │     │
│  │ Scraper Pro  │  │ Writer v3   │  │ Bot Alpha   │     │
│  │             │  │             │  │             │       │
│  │ SKILL       │  │ SKILL       │  │ AGENT       │     │
│  │ Per-call    │  │ Subscription│  │ One-time    │     │
│  │ 2 LOB/call  │  │ 500 LOB/mo  │  │ 5,000 LOB   │     │
│  │             │  │             │  │             │       │
│  │ ★ Gold      │  │ ★ Platinum  │  │ ★ Silver    │     │
│  │ 12.4k calls │  │ 89 subs     │  │ 34 sales    │     │
│  │ [Buy]       │  │ [Subscribe] │  │ [Buy]       │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                         │
│  Pipelines                                              │
│  ┌─────────────────────────────────────────────┐        │
│  │ 🔗 Deep Research Assistant                   │        │
│  │ Web Scraper → Summarizer → Report Generator  │        │
│  │ 25 LOB/execution  |  1.2k runs  |  ★ Gold   │        │
│  │ [Execute] [View Steps]                       │        │
│  └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

### 12.2 Skill Detail Page (`/marketplace/skills/{id}`)

- Title, description, version history
- Seller profile (tier badge, rep score, total sales)
- Pricing details + purchase button
- API documentation (from metadataURI)
- Input/output schema
- Usage stats (total calls, uptime, avg latency)
- Reviews from buyers (linked to on-chain AccessRecords)
- Dispute history (resolved disputes are public)

### 12.3 Seller Dashboard (`/dashboard/seller`)

- Listed skills + their stats
- Revenue breakdown (per skill, per period)
- Claim earnings button
- Endpoint health status
- Active subscribers count
- Pipeline usage (if skills are used in others' pipelines)

### 12.4 Buyer Dashboard (`/dashboard/buyer`)

- Purchased skills + access status
- Call credit balance + top-up
- Subscription renewal dates
- Active pipelines
- Usage history + spending breakdown

### 12.5 Pipeline Builder (`/marketplace/pipelines/create`)

- Visual drag-and-drop pipeline editor
- Shows owned skills as available blocks
- Connect blocks: output → input mapping
- Test pipeline (dry run)
- Publish as public pipeline (Gold+ tier)

---

## 13. New Infrastructure Components

### 13.1 API Gateway Service

| Component | Tech | Purpose |
|---|---|---|
| Reverse proxy | Cloudflare Workers or custom Node.js on Railway | Route buyer requests to seller endpoints |
| Auth service | JWT + on-chain verification | Validate buyer access tokens |
| Rate limiter | Redis (Upstash) | Enforce tier-based rate limits |
| Usage batcher | Cron job (every 5 min) | Post batched usage to chain |
| Call logger | Append-only store (S3) | Store call logs for dispute evidence |
| Health checker | Cron job (every 1 min) | Monitor seller endpoint uptime |

### 13.2 Package Registry

| Component | Tech | Purpose |
|---|---|---|
| Storage | S3 (encrypted at rest) | Store skill packages |
| Access API | Node.js on Railway | Validate access, generate signed download URLs |
| CLI tool | `lobstr` CLI extension | Push/pull packages |
| Integrity | keccak256 on-chain vs package hash | Tamper detection |

### 13.3 Indexer Updates (Ponder)

New handlers for:
- `SkillListed` → index skill listings for search/filter
- `SkillPurchased` → track purchases, update buyer dashboards
- `UsageRecorded` → aggregate usage stats
- `PipelineCreated` / `PipelineExecuted` → pipeline analytics
- `SubscriptionRenewed` → subscription tracking
- `SellerPaid` → revenue analytics

---

## 14. Security Considerations

### 14.1 Seller Endpoint Privacy
- Seller URLs are **never exposed** to buyers or stored on-chain
- Only the keccak256 hash is on-chain (for integrity verification)
- Gateway stores endpoints encrypted with per-skill AES keys
- Key management: AWS KMS or similar HSM-backed service

### 14.2 Package Integrity
- On-chain `packageHash` = keccak256 of package contents
- Registry verifies hash before serving downloads
- Buyers can independently verify: `keccak256(downloaded_package) == on-chain hash`

### 14.3 Gateway Trust Model
- Gateway is a trusted intermediary (centralized component)
- All payment logic is on-chain (gateway can't steal funds)
- Gateway can only: route traffic, record usage, enforce rate limits
- If gateway goes down: on-chain access records still valid; buyers can dispute; sellers can claim earned funds
- Future: decentralize gateway via TEE (Trusted Execution Environment) or multi-operator model

### 14.4 Anti-Abuse
- **Seller spam**: gated by staking tiers (minimum 100 LOB)
- **Buyer abuse**: per-call requires pre-funded credits; can't run up a tab
- **Fake skills**: 72-hour dispute window + arbitration; fraudulent sellers get slashed
- **Usage inflation**: gateway signs usage reports; on-chain verification of gateway signature
- **Endpoint spoofing**: `apiEndpointHash` verified on registration

---

## 15. Deploy Plan

### Phase 1: Contracts (Week 1-2)
1. Modify `EscrowEngine` — add `EscrowType` enum, `createSkillEscrow()`, 72h dispute window
2. Modify `ReputationSystem` — add `recordSkillCompletion()`
3. Write `ISkillRegistry` interface
4. Write `SkillRegistry` contract
5. Write `IPipelineRouter` interface
6. Write `PipelineRouter` contract
7. Update `Deploy.s.sol` — full deploy order:
   LOBToken → ReputationSystem → StakingManager → TreasuryGovernor → SybilGuard → ServiceRegistry → **SkillRegistry** → DisputeArbitration → EscrowEngine → **PipelineRouter** → Groth16Verifier → AirdropClaim
8. Role grants: SKILL_REGISTRY_ROLE, GATEWAY_ROLE, RECORDER_ROLE for SkillRegistry
9. Full test suite (unit + integration + fuzz)
10. Deploy to Base Sepolia testnet

### Phase 2: Gateway Infrastructure (Week 2-3)
1. Build API gateway service (auth + proxy + rate limiting)
2. Build package registry (storage + access API)
3. Build usage batcher (cron + chain interaction)
4. Build call logger (for dispute evidence)
5. Build health checker
6. Deploy to Railway (staging)

### Phase 3: Frontend (Week 3-4)
1. Skill marketplace browse/search page
2. Skill detail page
3. Seller dashboard (list skills, manage endpoints, view revenue)
4. Buyer dashboard (purchased skills, credits, subscriptions)
5. Pipeline builder UI
6. Integration with existing wallet connect + RainbowKit

### Phase 4: CLI + Agent SDK (Week 4-5)
1. `lobstr registry push/pull` commands
2. `lobstr skill call <id> --input '...'` command
3. `lobstr pipeline create/execute` commands
4. Agent SDK: programmatic skill discovery + purchase + execution
5. Update Sentinel/Arbiter/Steward to use the marketplace

### Phase 5: Mainnet Launch (Week 5-6)
1. Security audit (contracts)
2. Penetration testing (gateway)
3. Deploy contracts to Base mainnet
4. Migrate gateway to production
5. Launch with LOBSTR team skills as initial catalog
6. Open to third-party sellers

---

## 16. Resolved Decisions

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | EscrowEngine: modify or separate? | **Unified EscrowEngine** — full redeploy, single contract holds all funds | One source of truth for escrowed funds. Single dispute path. Cleaner architecture since we're redeploying everything anyway. |
| 2 | LOB-only or multi-token? | **Multi-token: LOB fee-free, USDC 1.5% fee** | Same model as the existing service marketplace. Lowers barrier for new buyers while incentivizing LOB usage. Creates natural buy pressure. |
| 3 | Subscription auto-renewal? | **Token approval + keeper bot** | Buyer sets ERC-20 approval, keeper calls `renewSubscription()` before expiry. Graceful lapse if balance insufficient. No off-chain billing needed. |
| 4 | Gateway decentralization? | **Not for 12+ months** | Gateway is a read-and-route layer, not custody. All funds on-chain. Ship centralized, prove PMF, decentralize later. |
| 5 | Pipeline markup caps? | **No caps — free market** | UI shows transparency (underlying cost vs pipeline price). Market self-corrects. Caps add governance overhead. |

---

## 17. Success Metrics

| Metric | Target (6 months) |
|---|---|
| Skills listed | 100+ |
| Active sellers (unique addresses) | 25+ |
| Monthly skill purchases | 500+ |
| Monthly API calls through gateway | 1M+ |
| Pipeline executions | 10,000+ |
| Total LOB volume through skill marketplace | 5M LOB |
| Seller retention (listing active > 90 days) | 60%+ |
| Dispute rate | < 3% |
| Gateway uptime | 99.9% |
