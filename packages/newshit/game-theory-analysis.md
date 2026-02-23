# Game Theory Analysis — LOBSTR Protocol

Adversarial modeling of rational, greedy, and colluding actors across the protocol's economic system. Organized by attack surface.

---

## 1. BondingEngine — Discount Arbitrage Loop

### Attack
Attacker is a Platinum staker (100K LOB). They get 13% discount on bonds (10% base + 3% Platinum). They buy discounted LOB via bonds, wait 7 days to vest, then sell on DEX at market price. Profit = discount minus slippage and gas.

### Numbers
- Buy 100 USDC worth of LOB at 13% discount → ~11,494 LOB
- Market value of 11,494 LOB = ~$114.94
- Profit per cycle = ~$14.94 (minus gas, ~$0.10 on Base)
- Cycle time = 7 days (minimum vesting)
- Annualized = ~$14.94 × 52 = ~$776/year on $100 deployed

### Is This a Problem?
**Partially.** This is actually intended behavior — the discount is the incentive to provide liquidity. But if the discount is too high relative to DEX slippage, it becomes pure arb with no real liquidity contribution (they're just buying USDC bonds, not LP bonds).

### Mitigation Already In Place
- 7-day minimum vesting prevents flash arb
- 20% max discount cap
- Market capacity limits how much can be extracted

### Blind Spot
**Nothing stops someone from buying USDC bonds repeatedly.** The capacity limit is per-market, but Titus can create multiple USDC markets. There's no per-user cap. A whale could buy the entire capacity of a market in one tx.

**Recommendation:** Consider adding a per-address purchase cap per market (e.g., max 5% of capacity per address per epoch). This forces distribution and prevents single-whale draining.

---

## 2. Staking Tier Gaming — Borrow-Stake-Unstake

### Attack
Attacker flash-borrows or borrows LOB, stakes 100K to hit Platinum, buys bonds at max discount, then requests unstake. The 7-day cooldown aligns with bond vesting. After both vest, they unstake and return the loan.

### Sequence
1. Borrow 100K LOB
2. `stake(100K)` → Platinum tier
3. `purchase()` on BondingEngine → 13% discount
4. `requestUnstake(100K)` → 7-day cooldown starts
5. Wait 7 days
6. `unstake()` → get 100K LOB back
7. `claim(bondId)` → get discounted LOB
8. Return loan, profit the discount

### Is This a Problem?
**Yes, but limited.** The profit is the discount delta between Platinum and no-tier (3% on top of base). On a 100 USDC purchase that's ~$3. The cost is borrowing 100K LOB for 7 days. If LOB lending rates are above 0.03% for 7 days, it's unprofitable.

### Mitigation Already In Place
- 7-day unstake cooldown means capital is locked
- The tier bonus is only 1-3% — small edge
- `StakingManager.requestUnstake` requires zero pending unstake (can't queue)

### Blind Spot
**BondingEngine reads tier at purchase time only.** It doesn't check if the user has a pending unstake request. Someone could be in the process of leaving and still get the bonus.

**Recommendation:** Consider checking `stakingManager.getStakeInfo(buyer).unstakeRequestAmount == 0` in `purchase()`. If they're planning to unstake, they don't get the tier bonus. This closes the borrow-stake-buy-unstake loop.

---

## 3. Arbitrator Collusion — The 2-of-3 Problem

### Attack
Two colluding arbitrators can control every dispute outcome. They always vote the same way → guaranteed majority → guaranteed majority bonus (30%) → controlled ruling.

### Economics
- Two colluding arbitrators on a 5,000 LOB dispute:
  - Base reward = 100 LOB (2% of 5000)
  - Majority bonus = 30 LOB each
  - Per dispute: 130 LOB each, 260 LOB total
  - If they always vote buyer-wins → sellers get slashed, colluders get rewarded

### Is This a Problem?
**Yes, this is the most serious systemic risk.** The `_selectArbitrators` function uses prevrandao + nonce for selection, which is not manipulable by regular users but IS predictable to validators. On Base (L2), the sequencer IS the validator.

### Mitigation Already In Place
- Rubber-stamp detection (10 consecutive same-direction → 50% penalty)
- Vote cooldown (1 hour)
- Quality multiplier (below 40% majority rate → disqualified)
- Sybil ban checks on arbitrators

### Blind Spots

**a) Rubber-stamp detection is trivially bypassed.** Colluders just alternate: vote buyer on odd disputes, seller on even. Consecutive same-direction count resets every time they switch. They still control outcomes.

**b) Three-arbitrator panel is small.** With only 3 arbitrators, 2 colluders have deterministic control. Traditional arbitration uses larger panels for exactly this reason.

**c) No appeal mechanism for dispute rulings.** If arbitrators collude, the losing party has no recourse. SybilGuard can ban arbitrators, but by then the damage (slashing + fund seizure) is already done and irreversible.

**d) Arbitrator selection randomness.** If the active arbitrator pool is small (say 10 people), the probability of getting 2 colluders on the same panel is significant: C(2,2)×C(8,1) / C(10,3) = 8/120 = 6.7% per dispute. With 5 colluders in a pool of 10, it's much worse.

**Recommendation:**
- Increase panel size to 5 for high-value disputes (>5000 LOB)
- Add a dispute appeal mechanism (costs LOB, escalates to a larger panel)
- Track pairwise voting agreement rates between arbitrators — two arbitrators who agree on >90% of disputes over 20+ disputes should be flagged

---

## 4. SybilGuard Weaponization — Grief-Banning Competitors

### Attack
A malicious watcher submits a false sybil report against a legitimate competitor. Two colluding judges confirm it. The competitor gets banned, their entire stake seized (100% slash), and distributed (10% watcher, 5% judges, 85% treasury).

### Economics
- Cost to attack: 500 LOB watcher bond (returned if confirmed)
- Reward: 10% of victim's seized stake
- If victim has 100K LOB staked: watcher gets 10K LOB, judges split 500 LOB each
- Net profit: 9,500 LOB for a 500 LOB bond → 19x return

### Is This a Problem?
**Yes.** The judges are the only gatekeepers, and only 2 are needed. If a watcher colludes with 2 judges, they can grief-ban anyone for profit.

### Mitigation Already In Place
- Anti-collusion pair tracking (3 per 30-day epoch)
- Watcher quality scoring (below 25% confirm rate → no rewards)
- APPEALS_ROLE can unban

### Blind Spots

**a) Anti-collusion tracking is per (watcher, judge) pair.** A watcher with 10 different judge accomplices can file 30 false reports per epoch (3 per pair × 10 pairs). They just rotate which judges confirm.

**b) Unbanning doesn't restore seized stake.** The appeal process unbans the address but doesn't return the slashed tokens. The damage is permanent. The seized funds already went to treasury/watcher/judges.

**c) The APPEALS_ROLE is a single point of trust.** If it's slow to respond (or compromised), victims stay banned and their funds stay seized. There's no time-bound automatic unban or on-chain appeal mechanism.

**d) Watcher bond is too cheap relative to potential damage.** 500 LOB to potentially seize 100K LOB is a 200:1 leverage ratio. Even with quality scoring penalties, the first 10 attacks are free (grace period).

**Recommendation:**
- Scale watcher bond to a percentage of the target's stake (e.g., 5% of target's total stake, minimum 500 LOB)
- Add automatic refund mechanism if an unban happens within X days
- Require 3 judges instead of 2 for accounts with >10K LOB staked
- Consider time-delayed bans: flag → 48h grace period → ban executes (gives victim time to appeal)

---

## 5. Escrow Auto-Release Timing Attack

### Attack
Seller submits garbage delivery. Low-value jobs (<500 LOB) have only a 1-hour dispute window. If the buyer is asleep, in a different timezone, or just not monitoring, the seller calls `autoRelease()` after 1 hour and walks away with the money.

### Is This a Problem?
**Moderate.** 1 hour is very short for real-world dispute evaluation. Most real services involve reviewing deliverables, which takes time.

### Mitigation Already In Place
- High-value jobs (≥500 LOB normalized) get 24 hours
- Skill escrows get 72 hours
- Buyer can confirm OR dispute

### Blind Spot
**The threshold for "high value" is fixed at 500 LOB.** If LOB price rises significantly, 500 LOB could represent thousands of dollars. Conversely if LOB drops, 499 LOB could be a significant amount with only 1 hour protection. The threshold should probably be in USD terms, or at least governable.

**Also:** `autoRelease()` is permissionless — anyone can call it, not just the seller. A bot could monitor all delivered jobs and call `autoRelease()` the instant the window expires, giving buyers zero grace period. MEV bots on Base could do this profitably by front-running the buyer's dispute tx.

**Recommendation:**
- Make dispute window thresholds governable (not hardcoded constants)
- Add a small grace buffer (e.g., 15 minutes) after window where only buyer can act (not permissionless `autoRelease`)
- Consider push notifications via indexer when delivery is submitted

---

## 6. Reputation Farming — Wash Trading for Score

### Attack
Attacker creates two accounts (buyer + seller). They create small escrows between themselves, immediately confirm delivery, and farm reputation completions. +100 points per completion. After 50 self-trades, they have 5500 score (Gold tier).

### Cost
- Gas: ~$0.05 per cycle on Base
- Each cycle: `createJob()` → `submitDelivery()` → `confirmDelivery()` → 4 txs
- 50 cycles × $0.20 = $10 to reach Gold reputation

### Mitigation Already In Place
- `EscrowEngine.createJob()` checks `seller != msg.sender` (can't self-hire)
- SybilGuard can detect and ban

### Blind Spots

**a) Two accounts bypass the self-hire check trivially.** The check is `seller != msg.sender`. Two different wallets controlled by the same person pass this check. There's no minimum escrow amount — you can farm with 1 wei LOB jobs.

**b) Reputation score has no decay.** Once farmed, it stays forever. A reputation farmer from month 1 still has their inflated score in month 12.

**c) No cost to the reputation transaction.** LOB escrows have 0% fee. So the entire amount comes back to the attacker. The only cost is gas.

**Recommendation:**
- Add minimum escrow amount (e.g., 10 LOB for service jobs)
- Add reputation decay (e.g., -5 points per 30 days of inactivity, floor at base 500)
- Weight reputation gains by escrow value (1 LOB job should give less reputation than 1000 LOB job)
- SybilGuard could watch for accounts that only transact with each other

---

## 7. BondingEngine + StakingRewards Interaction

### Attack
Attacker buys LOB bonds at discount. Once vested, they stake the LOB in StakingRewards to earn reward tokens. They got the LOB cheaper than market, so their effective yield is higher. Then they unstake and sell.

### Is This a Problem?
**Not really — this is the intended flywheel.** Bond → Stake → Earn → Compound. The discount is the incentive to enter this loop. Only becomes problematic if reward rates are set too high relative to bond discounts, creating a guaranteed profit machine regardless of LOB price movement.

### Blind Spot
**If BondingEngine discount + StakingRewards yield > LOB price depreciation rate**, the protocol is paying more value than it's receiving. This is a treasury drain scenario that happens slowly and is hard to detect.

**Recommendation:** Titus/agents should monitor the combined effective APY (bond discount + staking rewards) and flag when it exceeds reasonable bounds (e.g., >50% annualized). The RewardScheduler emission rate should factor in active bond programs.

---

## 8. Arbitrator Stake Drain via No-Show Accumulation

### Attack
Not an attack per se, but a systemic risk. Arbitrators who get selected but don't vote get slashed 0.5% per dispute. If an arbitrator goes offline and disputes keep getting assigned to them, their stake drains:
- 0.5% per dispute × 20 disputes = 10% gone
- If they had 5K LOB (Junior minimum), after 20 no-shows they're at 4,522 LOB — below threshold, auto-deactivated

### Blind Spot
**There's no mechanism for arbitrators to signal unavailability.** An arbitrator on vacation or with a broken key gets slowly drained. The `unstakeAsArbitrator` function requires `_activeDisputeCount == 0`, but if disputes keep getting assigned, they can't unstake either — they're trapped.

**Recommendation:**
- Add a `deactivateArbitrator()` function that stops new assignments without unstaking
- Or: don't assign arbitrators who haven't voted in their last N disputes

---

## 9. Cross-Contract Reentrancy Surface

### Analysis
All core contracts use `ReentrancyGuard`. However, the interaction pattern is:

```
EscrowEngine.initiateDispute() → DisputeArbitration.submitDispute()
DisputeArbitration.executeRuling() → EscrowEngine.resolveDispute()
DisputeArbitration._slashNoShow() → RewardDistributor.deposit()
SybilGuard._executeBan() → StakingManager.slash()
SybilGuard._distributeSeizureRewards() → RewardDistributor.creditWatcherReward()
```

Each contract has its own reentrancy lock, but cross-contract calls mean Contract A's lock doesn't protect Contract B. If a malicious token's `transfer()` callback re-enters Contract B during Contract A's execution, the individual guards don't catch it.

### Mitigation Already In Place
- Token allowlist on EscrowEngine (only vetted tokens)
- SafeERC20 usage throughout
- LOB is a standard ERC20 (no callbacks)

### Blind Spot
**If a non-LOB token with transfer hooks gets allowlisted** (e.g., an ERC-777 token or token with `_beforeTokenTransfer` hooks), the cross-contract call chains become exploitable. The token allowlist is the critical gate — if a bad token gets through, multiple contracts are at risk.

**Recommendation:** The allowlist admin process should include explicit verification that tokens don't have transfer callbacks. Document this as a mandatory check. Consider adding an explicit `IERC20.transfer` test in the allowlist function itself.

---

## 10. Economic Death Spiral Scenario

### Scenario
LOB price drops significantly. Sequence of cascading effects:

1. **Stakers unstake** to cut losses → tier levels drop → fewer sellers can list → marketplace activity drops
2. **Arbitrators unstake** → fewer available → disputes can't be resolved → buyer confidence drops
3. **Bond markets** become unattractive → discount doesn't compensate for price decline → no new POL
4. **Reputation value** drops → less incentive to maintain it → more hit-and-run behavior
5. **Fee revenue** drops (less volume) → treasury can't fund rewards → staking yields drop → more unstaking

### Mitigation Already In Place
- 7-day unstake cooldown slows the exit spiral
- LOB escrows are 0% fee (incentivizes LOB usage even in downturns)
- Fixed 1B supply (no inflation dilution)

### Blind Spots

**a) All tier thresholds are in absolute LOB terms.** 100K LOB for Platinum is fine at $0.01/LOB ($1K). At $0.001/LOB it's $100, making Platinum trivially cheap. At $0.10/LOB it's $10K, making it prohibitively expensive. Thresholds should ideally be value-anchored.

**b) There's no circuit breaker.** If the protocol enters a death spiral, there's no automatic mechanism to pause unstaking, increase rewards, or adjust parameters. Everything requires a governance vote → agent execution, which takes time.

**c) Arbitrator rewards are denominated in LOB.** If LOB price drops, the dollar value of arbitration rewards drops, but the effort stays the same. Rational arbitrators leave when the reward doesn't justify the work.

**Recommendation:**
- Consider oracle-based tier thresholds (or governance-adjustable)
- Add emergency parameter adjustment capability (fast-track governance for critical parameters)
- Diversify arbitrator rewards to include USDC from fee revenue (not just LOB)

---

## Priority Ranking

| # | Risk | Severity | Likelihood | Fix Complexity |
|---|------|----------|------------|----------------|
| 3 | Arbitrator collusion (2-of-3) | Critical | Medium | High (architecture) |
| 4 | SybilGuard weaponization | Critical | Medium | Medium (parameter changes) |
| 6 | Reputation wash trading | High | High | Low (minimum amounts + decay) |
| 5 | Auto-release timing | Medium | High | Low (grace period) |
| 1 | Bond discount arb (no per-user cap) | Medium | Medium | Low (add cap) |
| 2 | Borrow-stake-buy tier gaming | Low | Low | Low (check unstake request) |
| 10 | Economic death spiral | High | Low | High (oracle integration) |
| 8 | Arbitrator stake drain | Medium | Medium | Low (deactivation function) |
| 9 | Cross-contract reentrancy | Critical | Low | Low (token vetting process) |
| 7 | Bond + staking yield stacking | Low | Low | Low (monitoring) |

---

## Quick Wins (Low effort, meaningful impact)

1. **Minimum escrow amount** — add 10 LOB minimum to `createJob()` to kill wash trading
2. **Arbitrator deactivation** — let arbitrators pause without unstaking
3. **Auto-release grace period** — 15-minute buyer-only buffer after window
4. **Per-address bond cap** — max 5% of market capacity per address
5. **Unstake check on bond purchase** — no tier bonus if unstake pending
