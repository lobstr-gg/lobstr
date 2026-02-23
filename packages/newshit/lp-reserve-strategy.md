# LP Reserve Strategy — 150M LOB

## Allocation

150M LOB (15% of 1B fixed supply). Purpose: seed and sustain DEX liquidity on Base so LOB is tradeable from day one and the protocol builds permanent liquidity over time.

## Titus as LP Custodian

All 150M LP-reserve LOB goes to Titus (TreasuryGovernor). He's the single point of custody and execution for LP operations. The BondingEngine contract is hardcoded: `sweepQuoteToken()` and `withdrawLOB()` always send to the `treasury` immutable (Titus's address). No arbitrary destinations, no room for misdirected funds.

```
                        150M LOB
                           │
                           ▼
                        Titus
                       (treasury)
                      ┌────┴────┐
                      │         │
              Phase 1 │         │ Phase 2+
            (direct)  │         │ (bonds)
                      ▼         ▼
              Aerodrome    BondingEngine
              CL Pools     ┌─────┴─────┐
                │          │           │
                │    users bond     sweepQuoteToken()
                │    LP tokens     withdrawLOB()
                │    for LOB           │
                │                      ▼
                └──────────────>   Titus
                  LP tokens        (always)
                  back to Titus
```

## Target Pairs

| Pair | DEX | Pool Type | Priority |
|------|-----|-----------|----------|
| LOB/USDC | Aerodrome | Concentrated (CL) | Primary — this is how most users enter/exit |
| LOB/ETH | Aerodrome | Concentrated (CL) | Secondary — ETH-native users, arb routing |

Aerodrome is the dominant DEX on Base. Concentrated liquidity (CL) pools give better capital efficiency than constant product — tighter spreads with less capital.

## Phased Rollout

### Phase 1 — Launch Seed (Day 0)

**Goal:** Make LOB tradeable immediately with tight spreads.

Titus receives 150M LOB. He directly pairs 40M with USDC/ETH on Aerodrome. The resulting LP tokens stay in Titus's custody.

| Action | LOB | Paired With | Notes |
|--------|-----|-------------|-------|
| LOB/USDC CL pool | 30M LOB | USDC (from treasury) | Concentrated around launch price |
| LOB/ETH CL pool | 10M LOB | ETH (from treasury) | Tighter range, secondary pair |

**Total deployed: 40M LOB** (27% of LP reserve)

Initial price range: concentrate liquidity within +/- 50% of launch price. Recalibrated after price discovery stabilizes (first 2 weeks).

Titus executes pool creation and initial deposit after a DAO vote approving the launch price and range parameters.

### Phase 2 — Bond-Funded Expansion (Weeks 2–8)

**Goal:** Use BondingEngine to acquire MORE liquidity without spending more LOB from the reserve.

Titus deposits LOB into BondingEngine via `depositLOB()`. Creates bond markets that accept Aerodrome LP tokens:

| Bond Market | Quote Token | Discount | Vesting | Capacity |
|-------------|-------------|----------|---------|----------|
| LOB/USDC LP bonds | Aerodrome LOB/USDC LP | 12-15% | 14 days | 20M LOB |
| LOB/ETH LP bonds | Aerodrome LOB/ETH LP | 12-15% | 14 days | 10M LOB |

**How this works:**
1. Users provide liquidity on Aerodrome (LOB/USDC or LOB/ETH)
2. They get LP tokens back
3. They bond those LP tokens for discounted LOB (12-15% off)
4. Protocol now OWNS the LP position permanently — can't be rugged by mercenary LPs pulling out
5. Users get their discounted LOB over 14 days
6. Titus calls `sweepQuoteToken()` — LP tokens go directly to Titus (hardcoded)

**Total deployed: 30M LOB** via bonds -> protocol gets LP tokens worth 2x that in TVL

Higher discount than USDC bonds (12-15% vs 10%) because LP tokens are more strategically valuable — the protocol wants to own its own liquidity.

### Phase 3 — Steady State (Month 2+)

**Goal:** Maintain deep liquidity, reinvest trading fees, expand to new pairs as needed.

Remaining reserve: **80M LOB** (53% of LP reserve) held by Titus for:

| Use | LOB Budget | Trigger |
|-----|------------|---------|
| Range rebalancing | 10-20M | Price moves outside concentrated range |
| New pair seeding | 10-20M | New quote token demand (e.g. LOB/cbBTC) |
| Emergency deepening | 20M | Major liquidity event / market stress |
| Ongoing LP bonds | 20-30M | Continuous bond programs (quarterly) |
| Buffer | 10M | Unused reserve |

All deployments require DAO votes. Titus executes.

## Protocol-Owned Liquidity (POL) Flywheel

```
150M LOB → Titus
    │
    ├──> Seed pools (Phase 1) — Titus pairs LOB + USDC/ETH on Aerodrome
    │        │
    │        └──> Trading fees flow to Titus
    │
    ├──> Bond markets (Phase 2-3) — Titus funds BondingEngine
    │        │
    │        ├──> Users bond LP tokens → BondingEngine
    │        ├──> sweepQuoteToken() → LP tokens to Titus (hardcoded)
    │        ├──> Titus now owns LP positions permanently
    │        └──> Deeper liquidity → tighter spreads → more volume → more fees
    │
    └──> Fee reinvestment — Titus compounds fees into deeper positions
```

Over time the protocol should own the majority of its own liquidity. Mercenary LPs can come and go — doesn't matter, Titus's positions stay.

## Price Range Management

For concentrated liquidity, range management is critical:

- **Initial range:** +/- 50% of launch price (wide, safe during price discovery)
- **Post-discovery (week 2+):** Tighten to +/- 25% around established price
- **Rebalance trigger:** When price hits 80% of range boundary

Rebalancing = DAO vote to withdraw from old range, redeploy to new range centered on current price. Titus executes the multi-step tx.

## Titus Execution Responsibilities

All actions are DAO-voted. Titus is the execution layer:

| Action | Frequency | What Titus Does |
|--------|-----------|-----------------|
| Initial pool creation | Once | Deploy CL pool, set tick range, deposit LOB + USDC/ETH |
| LP bond market creation | Quarterly | `depositLOB()` + `createMarket()` on BondingEngine |
| Fee harvesting | Weekly | Claim Aerodrome trading fees + AERO rewards |
| Range rebalancing | As needed | Withdraw old range, redeploy at new ticks |
| LP bond sweeping | Monthly | `sweepQuoteToken()` — LP tokens to Titus (automatic) |
| Surplus LOB recall | As needed | `withdrawLOB()` — surplus back to Titus (automatic) |
| Reporting | Weekly | Post liquidity depth, POL value, fee income to forum |

## Contract Hardcoding

BondingEngine enforces Titus as the sole fund destination:

| Function | Destination | Configurable? |
|----------|-------------|---------------|
| `sweepQuoteToken(token)` | `treasury` (Titus) | No — immutable, set at deploy |
| `withdrawLOB(amount)` | `treasury` (Titus) | No — immutable, set at deploy |
| `depositLOB(amount)` | `transferFrom(msg.sender)` | Titus must hold LOB + approve |

No `to` parameter on sweep or withdraw. Funds always flow back to Titus. This eliminates the risk of an admin fat-fingering a destination address or a compromised role sending funds elsewhere.

## Risk Considerations

**Impermanent loss:** Concentrated liquidity amplifies IL. Mitigated by:
- Protocol owns the positions (no panic withdrawals)
- Fee income offsets IL over time
- Wider ranges during volatile periods

**Single DEX risk:** All liquidity on Aerodrome. If Aerodrome has issues:
- Migrate to Uniswap V3 on Base (same CL mechanism)
- Reserve buffer (10M LOB) available for emergency redeployment

**LP token bond arbitrage:** Users could buy LOB cheap via bonds then sell. Mitigated by:
- 14-day vesting on LP bonds
- Discount calibrated to make arb unprofitable after gas + opportunity cost
- Titus monitors and proposes closing markets if discount is too generous

## Budget Summary

| Phase | LOB Deployed | % of Reserve | Mechanism |
|-------|-------------|--------------|-----------|
| Phase 1 — Seed | 40M | 27% | Titus pairs on Aerodrome directly |
| Phase 2 — LP Bonds | 30M | 20% | BondingEngine (buys LP tokens → Titus) |
| Phase 3 — Steady state | 70M | 47% | Mix of rebalancing, new pairs, ongoing bonds |
| Buffer | 10M | 6% | Emergency / unused |
| **Total** | **150M** | **100%** | |

## Contracts Involved

| Contract | Role |
|----------|------|
| `BondingEngine` | Accepts LP tokens as quote tokens for discounted LOB bonds. Hardcoded sweep/withdraw to Titus. |
| `TreasuryGovernor` | Governance votes on all LP deployments |
| `LOBToken` | The 150M LOB being deployed |
| Aerodrome CL Pool | Where liquidity lives on-chain |
| Titus (treasury) | Holds LP reserve LOB, executes all LP operations, receives all swept assets |

## Success Metrics

| Metric | Target (Month 1) | Target (Month 6) |
|--------|-------------------|-------------------|
| LOB/USDC pool depth | $500K+ TVL | $2M+ TVL |
| LOB/ETH pool depth | $200K+ TVL | $500K+ TVL |
| Protocol-owned % of total LP | 60%+ | 80%+ |
| Weekly trading fee income | Track baseline | Growing MoM |
| Avg spread (LOB/USDC) | < 2% | < 0.5% |
