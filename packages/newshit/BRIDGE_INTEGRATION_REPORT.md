# Phase 2: Full Stack x402 Bridge Integration Report

**Date:** 2026-02-21
**Bridge Contract:** `0x68c27140D25976ac8F041Ed8a53b70Be11c9f4B0` (Base Mainnet)

---

## What Was Done

Upgraded the entire LOBSTR stack to route x402 payments through the X402EscrowBridge into EscrowEngine. Every consumer of job data now understands bridge-originated jobs where `buyer = bridge address` (not the real payer).

---

## Files Changed / Created

### 1. Bridge ABI Generation

| File | Action | Description |
|------|--------|-------------|
| `packages/indexer/abis/X402EscrowBridge.ts` | **CREATED** | Full ABI (43 entries) extracted from Foundry compiled output. Used by the indexer for event decoding. |

---

### 2. Indexer (`packages/indexer/`)

| File | Action | What Changed |
|------|--------|-------------|
| `ponder.schema.ts` | MODIFIED | Added 3 fields to `job` table: `isX402` (boolean, default false), `x402Payer` (hex, nullable), `x402Nonce` (hex, nullable) |
| `ponder.config.ts` | MODIFIED | Imported `X402EscrowBridgeABI`, added bridge address to `CONTRACTS` object, added `X402EscrowBridge` contract entry with `BRIDGE_START_BLOCK = 42800000` |
| `src/index.ts` | MODIFIED | Added `X402EscrowBridge:EscrowedJobCreated` event handler that annotates existing job rows with `isX402 = true`, `x402Payer`, and `x402Nonce`. Also ensures payer account exists. |

**How it works:** When the bridge creates a job, EscrowEngine emits `JobCreated` (already handled — inserts the job row). Then the bridge emits `EscrowedJobCreated` which our new handler catches to annotate the same job with x402 metadata. Order is guaranteed within the same transaction.

---

### 3. Frontend (`packages/web/`)

| File | Action | What Changed |
|------|--------|-------------|
| `src/config/contracts.ts` | MODIFIED | Added `x402EscrowBridge` to both testnet (zero address placeholder) and mainnet (`0x68c27...4B0`) contract configs |
| `src/config/abis.ts` | MODIFIED | Added `X402EscrowBridgeABI` export with 6 functions: `jobPayer`, `jobRefundCredit`, `refundClaimed`, `confirmDelivery`, `initiateDispute`, `claimEscrowRefund` |
| `src/lib/hooks.ts` | MODIFIED | Added import for `X402EscrowBridgeABI`. Added 6 new hooks (see below) |
| `src/app/jobs/[id]/page.tsx` | MODIFIED | Bridge detection, x402 badge, real payer display, refund claim section, dynamic import of BridgeRefundClaim |
| `src/app/jobs/[id]/_components/DeliveryReview.tsx` | MODIFIED | Accepts `isBridgeJob` prop, conditionally routes confirm/dispute through bridge or direct escrow |
| `src/app/jobs/[id]/_components/BridgeRefundClaim.tsx` | **CREATED** | New component for claiming bridge refunds after resolved disputes |

#### New Hooks Added to `hooks.ts`

| Hook | Type | Purpose |
|------|------|---------|
| `useJobPayer(jobId)` | Read | Returns real payer address from bridge (zero if not a bridge job) |
| `useJobRefundCredit(jobId)` | Read | Returns refund credit amount for a bridge job |
| `useRefundClaimed(jobId)` | Read | Returns whether refund has been claimed |
| `useBridgeConfirmDelivery()` | Write | Calls `bridge.confirmDelivery(jobId)` |
| `useBridgeInitiateDispute()` | Write | Calls `bridge.initiateDispute(jobId, evidenceURI)` |
| `useClaimEscrowRefund()` | Write | Calls `bridge.claimEscrowRefund(jobId)` |

#### Job Detail Page Changes (`page.tsx`)

- **Bridge detection**: `useJobPayer()` called before early returns (React rules of hooks), checks if returned address is non-zero
- **Buyer logic**: `isBuyer = isDirectBuyer || isBridgeBuyer` — handles both regular and bridge buyers
- **x402 badge**: Orange "x402" badge shown next to status badge for bridge jobs
- **Parties card**: Shows real payer address (from bridge) instead of bridge contract address, labeled "Buyer (x402 payer)"
- **Refund claim**: Shows `BridgeRefundClaim` component when job is Refunded (status 4), is a bridge job, and user is the buyer
- **DeliveryReview**: Passes `isBridgeJob` prop so confirm/dispute route through bridge

#### DeliveryReview Changes

- Added imports for `useBridgeConfirmDelivery` and `useBridgeInitiateDispute`
- New `isBridgeJob` prop (default false)
- Conditional routing: when `isBridgeJob`, confirm calls `bridge.confirmDelivery()` and dispute calls `bridge.initiateDispute()` instead of the escrow engine directly

#### BridgeRefundClaim (New Component)

- Reads `refundClaimed` and `jobRefundCredit` from bridge
- Early returns null if already claimed or no credit
- Shows credit amount formatted as USDC (6 decimals)
- "Claim Refund" button calls `bridge.claimEscrowRefund(jobId)`
- Error state handling

---

### 4. CLI Skill (`packages/openclaw-skill/`)

| File | Action | What Changed |
|------|--------|-------------|
| `src/commands/job.ts` | MODIFIED | Added bridge constants, bridge detection in confirm/dispute, new refund command, bridge info in status |
| `SKILL.md` | MODIFIED | Added `X402EscrowBridge` to contracts section, `job refund` to commands table |

#### Constants Added to `job.ts`

```typescript
const BRIDGE_ADDRESS = '0x68c27140D25976ac8F041Ed8a53b70Be11c9f4B0';
const BRIDGE_ABI = parseAbi([
  'function jobPayer(uint256) view returns (address)',
  'function confirmDelivery(uint256 jobId)',
  'function initiateDispute(uint256 jobId, string evidenceURI)',
  'function claimEscrowRefund(uint256 jobId)',
  'function jobRefundCredit(uint256) view returns (uint256)',
  'function refundClaimed(uint256) view returns (bool)',
]);
```

#### `job confirm <id>` Changes

Before confirming, reads `bridge.jobPayer(id)`. If non-zero, routes through `bridge.confirmDelivery()` instead of `escrow.confirmDelivery()`. Output includes "(x402)" indicator.

#### `job dispute <id>` Changes

Same bridge detection pattern. Routes through `bridge.initiateDispute()` for bridge jobs.

#### `job refund <id>` (New Command)

1. Reads `jobPayer`, `jobRefundCredit`, `refundClaimed` in parallel
2. Validates: is bridge job, not already claimed, has credit
3. Calls `bridge.claimEscrowRefund(jobId)`
4. Reports success with tx hash

#### `job status <id>` Changes

After fetching job data, queries `bridge.jobPayer(id)`. If bridge job:
- Shows "Payer: 0x... (via x402 bridge)" instead of "Buyer"
- Shows "Bridge: 0x..." for the bridge contract address
- Appends "(x402)" to the success message

---

### 5. Facilitator (`packages/x402-facilitator/`)

| File | Action | What Changed |
|------|--------|-------------|
| `src/config.ts` | MODIFIED | Added `x402EscrowBridge` and `usdc` addresses to both mainnet and testnet contract objects |
| `src/bridge.ts` | **CREATED** | Bridge settlement logic with two modes |
| `src/routes/settle.ts` | MODIFIED | Dual-mode settlement (Phase 1 direct + Phase 2 bridge) |

#### `config.ts` Changes

Mainnet:
- `x402EscrowBridge: "0x68c27140D25976ac8F041Ed8a53b70Be11c9f4B0"`
- `usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"`

Testnet:
- `x402EscrowBridge: "0x0000000000000000000000000000000000000000"` (TODO)
- `usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"`

#### `bridge.ts` (New File)

**Types exported:**
- `PaymentIntent` — Struct matching the on-chain `PaymentIntent`
- `ERC3009Auth` — Struct matching the on-chain `ERC3009Auth`
- `BridgeExtension` — Shape of the `lobstr-escrow` extension in payment payloads
- `BridgeSettlementResult` — `{ jobId: bigint, txHash: string }`

**`settleViaBridge()` function:**

Two settlement modes depending on what the x402 client provides:

| Mode | Function Called | When Used |
|------|---------------|-----------|
| **Mode A** — Pull deposit | `bridge.depositAndCreateJob(intent, v, r, s)` | Payer has approved the bridge contract. Facilitator submits their EIP-712 PaymentIntent signature. |
| **Mode B** — EIP-3009 deposit | `bridge.depositWithAuthorization(auth, v, r, s, intent, intentV, intentR, intentS)` | Payer signed an EIP-3009 `receiveWithAuthorization` + a separate PaymentIntent. For USDC gasless transfers. |

Flow:
1. Parse `PaymentIntent` struct from the bridge extension
2. Check nonce hasn't been used (`bridge.nonceUsed()`)
3. Submit the appropriate bridge function call
4. Wait for transaction receipt
5. Decode `EscrowedJobCreated` event from logs to extract `jobId`
6. Return `{ jobId, txHash }`

#### `routes/settle.ts` Changes

The settle handler now checks for the `lobstr-escrow` extension in the payment payload:

**If extension present (Phase 2):**
1. Verify payment signature via `facilitator.verify()`
2. Query seller trust via `querySellerTrust()`
3. Create wallet/read clients from facilitator private key
4. Call `settleViaBridge()` with the bridge extension data
5. Return `{ success: true, txHash, extensions: { "lobstr-escrow": { jobId }, "lobstr-trust": trust } }`

**If no extension (Phase 1):**
- Falls through to standard `facilitator.settle()` with existing trust hooks
- Completely backwards compatible — no changes to Phase 1 behavior

---

## Bridge Extension Format

What LOBSTR-aware x402 clients include in their payment payload:

```json
{
  "extensions": {
    "lobstr-escrow": {
      "listingId": 12,
      "paymentIntent": {
        "x402Nonce": "0x...",
        "payer": "0x...",
        "token": "0x...",
        "amount": "1000000",
        "listingId": 12,
        "seller": "0x...",
        "deadline": 1708473600
      },
      "intentSignature": { "v": 28, "r": "0x...", "s": "0x..." },
      "erc3009Auth": { ... },
      "erc3009Signature": { ... }
    }
  }
}
```

The `erc3009Auth` and `erc3009Signature` fields are optional — only present for Mode B (USDC EIP-3009 flow).

---

## Architecture Diagram

```
x402 Client
    |
    | POST /settle (with lobstr-escrow extension)
    v
Facilitator (settle.ts)
    |
    |-- Phase 1 (no extension): facilitator.settle() --> direct x402 settlement
    |
    |-- Phase 2 (with extension):
    |     1. facilitator.verify() (signature check)
    |     2. querySellerTrust() (stake + reputation gate)
    |     3. settleViaBridge() -->
    |           |
    |           v
    |     X402EscrowBridge (on-chain)
    |           |
    |           |-- depositAndCreateJob() (Mode A)
    |           |-- depositWithAuthorization() (Mode B)
    |           |
    |           v
    |     EscrowEngine.createJob()
    |           |
    |           v
    |     Job created (buyer = bridge address)
    |     Bridge stores: jobPayer[jobId] = real payer
    |
    v
Indexer (ponder)
    |-- EscrowEngine:JobCreated --> inserts job row
    |-- X402EscrowBridge:EscrowedJobCreated --> annotates job with isX402, x402Payer, x402Nonce
    |
    v
Frontend / CLI
    |-- Reads bridge.jobPayer(jobId) to detect bridge jobs
    |-- Routes confirm/dispute through bridge (not escrow) for x402 jobs
    |-- Shows x402 badge, real payer info
    |-- Supports refund claims for resolved bridge disputes
```

---

## What's NOT Changed

- **EscrowEngine contract** — No on-chain changes. Bridge is already deployed and hardened.
- **facilitator.ts** — `buildFacilitator()` unchanged. Phase 1 hooks (`onBeforeSettle`, `onAfterSettle`) still work.
- **verify.ts** — Unchanged. Trust enrichment on verify still works.
- **supported.ts** — Unchanged.
- **index.ts (facilitator)** — Unchanged. Same routes, same server setup.
- **All existing event handlers in indexer** — Unchanged. Bridge handler is additive.
- **All existing hooks in frontend** — Unchanged. Bridge hooks are additive.
- **All existing CLI commands** — Unchanged behavior for non-bridge jobs. Bridge detection is transparent.
