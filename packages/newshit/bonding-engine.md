# BondingEngine — Protocol-Owned Liquidity via LOB Bonds

## Summary

BondingEngine lets the LOBSTR protocol sell LOB at a discount in exchange for useful assets (USDC, LP tokens), building permanent protocol-owned liquidity. Bonds vest linearly (minimum 7 days) to prevent arb dumping. All operations are DAO-governed and executed by Titus (TreasuryGovernor). All fund outflows (sweep + withdraw) are hardcoded to Titus's address — no arbitrary destinations.

## Files

| File | Purpose |
|------|---------|
| `contracts/src/interfaces/IBondingEngine.sol` | Interface — structs, events, function sigs |
| `contracts/src/BondingEngine.sol` | Core contract — markets, purchases, vesting, claims |
| `contracts/test/BondingEngine.t.sol` | 44 tests — full coverage |
| `contracts/script/DeployBondingEngine.s.sol` | Foundry deploy script |

## How It Works

```
Titus ──depositLOB()──> BondingEngine
                              │
User USDC/LP ──purchase()─────┤
                              │
                        Bond created
                        (vests over 7+ days)
                              │
User ──claim()──────────> receives vested LOB
                              │
Admin ──sweepQuoteToken()──> Titus (hardcoded)
Admin ──withdrawLOB()──────> Titus (hardcoded)
```

No new LOB is minted. Everything comes from the existing 1B fixed supply. All outflows go to `treasury` immutable (Titus).

## Governance & Titus Execution Model

This is NOT a manually-operated contract. The lifecycle is:

1. **DAO proposes** — community member submits a proposal via TreasuryGovernor (e.g. "Create USDC bond market at 10% discount, 500K capacity")
2. **DAO votes** — LOB holders vote, proposal passes or fails
3. **Titus executes** — picks up the passed proposal and submits the on-chain transaction

Titus holds `MARKET_ADMIN_ROLE`. He doesn't decide anything — he's the executor of what the DAO voted on. The governor contract is where the decisions happen.

### What Gets Voted On

Every treasury action requires a governance vote:

| Action | When |
|--------|------|
| `depositLOB(amount)` | Funding new bond inventory |
| `createMarket(quoteToken, price, discount, vesting, capacity)` | Launching a new bond program |
| `closeMarket(marketId)` | Shutting down a bond program |
| `updateMarketPrice(marketId, newPrice)` | Adjusting for LOB price movement |
| `sweepQuoteToken(token)` | Moving accumulated USDC/LP to Titus |
| `withdrawLOB(amount)` | Pulling back unused LOB surplus to Titus |

### What's Automated (No Vote Needed)

- **Staking tier discounts** — contract reads `StakingManager.getTier()` on every purchase, automatically gives Silver +1%, Gold +2%, Platinum +3%
- **Reserve enforcement** — `_totalOutstandingLOB` invariant ensures the contract always holds enough LOB to cover all bond obligations. Can't be drained.
- **Sybil protection** — reads `SybilGuard.checkBanned()` on purchase AND claim. Banned users blocked both ways.
- **Discount cap** — hard max 20% regardless of base discount + tier bonus combo
- **Linear vesting math** — runs on-chain, users claim whenever they want
- **Fund routing** — `sweepQuoteToken()` and `withdrawLOB()` always send to `treasury` (Titus). Immutable, set at deploy.

## Contract Design

### Hardcoded Fund Routing

| Function | Destination | Configurable? |
|----------|-------------|---------------|
| `sweepQuoteToken(token)` | `treasury` (Titus) | No — immutable |
| `withdrawLOB(amount)` | `treasury` (Titus) | No — immutable |
| `depositLOB(amount)` | `transferFrom(msg.sender)` | Titus must hold LOB + approve |

No `to` parameter on sweep or withdraw. Eliminates the risk of fat-fingered destinations or compromised roles redirecting funds.

### Roles

| Role | Held By | Can Do |
|------|---------|--------|
| `DEFAULT_ADMIN_ROLE` | TreasuryGovernor | pause/unpause, grant/revoke roles |
| `MARKET_ADMIN_ROLE` | Titus | create/close markets, deposit/withdraw LOB, sweep quote tokens, update prices |

### Key Invariant

```
_totalOutstandingLOB <= lobToken.balanceOf(address(this))
```

Enforced on every `purchase()`. The contract tracks all unvested + unclaimed LOB and guarantees it has enough on hand. `withdrawLOB()` can only pull surplus above this number — no way to rug bond holders.

### Staking Tier Discounts

| Tier | Bonus | Example (10% base) |
|------|-------|---------------------|
| None / Bronze | +0% | 10% discount |
| Silver | +1% | 11% discount |
| Gold | +2% | 12% discount |
| Platinum | +3% | 13% discount |

Capped at 20% max regardless.

### Payout Math

USDC market example — LOB at $0.01, 10% base discount, Gold staker:

```
pricePer1LOB     = 10000          (0.01 USDC in 6-decimal wei)
effectiveDiscount = 1200           (12% = 10% base + 2% Gold)
discountedPrice  = 10000 * 8800 / 10000 = 8800
100 USDC input   = 100_000_000 * 1e18 / 8800 = ~11,363 LOB

(vs 10,000 LOB at market price — 12% more for bonding)
```

### Vesting

Linear, no cliff. Starts immediately on purchase.

```
vested = payout * elapsed / duration
claimable = vested - alreadyClaimed
```

Minimum vesting period is 7 days. Users can `claim()` individual bonds or `claimMultiple()` for gas savings.

## Deploy Procedure

### Environment Variables

```
PRIVATE_KEY=<deployer>
LOB_TOKEN_ADDRESS=<LOBToken on Base>
STAKING_MANAGER_ADDRESS=<StakingManager on Base>
SYBIL_GUARD_ADDRESS=<SybilGuard on Base>
TREASURY_ADDRESS=<Titus / TreasuryGovernor address>
```

### Deploy Command

```bash
forge script script/DeployBondingEngine.s.sol:DeployBondingEngine \
  --rpc-url $BASE_RPC_URL \
  --broadcast --verify -vvvv
```

### Post-Deploy Sequence

1. Grant `MARKET_ADMIN_ROLE` on BondingEngine to Titus
2. Grant `DEFAULT_ADMIN_ROLE` on BondingEngine to TreasuryGovernor
3. Deployer renounces `DEFAULT_ADMIN_ROLE`
4. Send 150M LOB (LP reserve) to Titus
5. DAO vote: Titus seeds Aerodrome pools (Phase 1)
6. DAO vote: Titus calls `depositLOB()` + `createMarket()` (Phase 2)

After this the deployer has zero permissions. Everything goes through governance, Titus executes.

## Test Coverage

44 tests, all passing. Categories:

- **Constructor**: 4 zero-address reverts + immutables check
- **Market mgmt**: create, close, update price, revert short vesting, revert excessive discount, revert already closed, revert update closed
- **LOB funding**: deposit, withdraw surplus (verified goes to treasury), revert over-withdraw
- **Purchase**: basic payout math, Gold/Silver/Platinum tier bonuses, revert on capacity/reserve/banned/closed/zero
- **Vesting & claim**: 50% linear, full claim, partial-then-full, claimMultiple batch, revert not owner/nothing vested/banned, claim past vest end
- **Sweep**: USDC swept to treasury (hardcoded), revert sweep LOB
- **Pause**: blocks purchase, claim, claimMultiple
- **Events**: MarketCreated, BondPurchased, BondClaimed
- **Views**: getBondsByOwner, effectiveDiscount capped at 20%, availableLOB, counters

```bash
source ~/.zshenv && forge test --match-contract BondingEngineTest -vvv
```

## Integration Points

| Contract | How BondingEngine Uses It |
|----------|--------------------------|
| `LOBToken` | Holds LOB inventory, transfers to bond claimers |
| `StakingManager` | `getTier(buyer)` for automatic tier discount on purchase |
| `SybilGuard` | `checkBanned(user)` on both purchase and claim |
| `TreasuryGovernor` | Holds `DEFAULT_ADMIN_ROLE`, governs all parameters |
| Titus (treasury) | `MARKET_ADMIN_ROLE` holder, hardcoded destination for all fund outflows |
| Quote tokens (USDC, LP) | `safeTransferFrom` on purchase, `sweepQuoteToken` to Titus |

## See Also

- [LP Reserve Strategy](./lp-reserve-strategy.md) — full 150M LOB deployment plan across 3 phases
