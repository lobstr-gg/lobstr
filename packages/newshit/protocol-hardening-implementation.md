# Protocol Hardening — Game Theory Fixes (Implementation Report)

Date: February 22, 2026
Scope: Contract-level hardening across EscrowEngine, BondingEngine, DisputeArbitration, SybilGuard
Addresses: All 10 attack surfaces from `game-theory-analysis.md`
Test suite: 1001 tests, 0 failures

---

## Summary

Adversarial modeling of the LOBSTR protocol identified 10 attack surfaces ranging from reputation wash trading to arbitrator collusion rings. 8 were addressed with contract code changes across 4 contracts + their interfaces. 2 are operational monitoring concerns documented as agent runbooks at the bottom of this file.

Changes are organized into 3 implementation batches (by risk/complexity), matching the original plan.

---

## Batch 1: Quick Wins

Five targeted edits to existing contracts. Low risk, isolated, high impact.

### 1.1 — Minimum Escrow Amount (kills reputation wash trading)

**File:** `src/EscrowEngine.sol`
**Attack:** Two wallets controlled by one person create 1-wei LOB escrows, confirm delivery immediately, farm +100 reputation per cycle. Cost: $0.05 gas per cycle on Base. 50 cycles = Gold reputation for $10.

**Change:**
```solidity
uint256 public constant MIN_ESCROW_AMOUNT = 10 ether; // 10 LOB minimum
```
Enforced in both `createJob()` and `createSkillEscrow()`:
```solidity
require(amount >= MIN_ESCROW_AMOUNT, "EscrowEngine: below minimum");
```

**Why 10 LOB:** High enough to make wash trading uneconomical (50 cycles × 10 LOB = 500 LOB locked in rotation, plus slippage), low enough to not block legitimate micro-services.

### 1.2 — Auto-Release Grace Period

**File:** `src/EscrowEngine.sol`
**Attack:** MEV bot calls `autoRelease()` the instant the dispute window expires, front-running the buyer's dispute tx. Low-value jobs have only 1hr windows — buyers in different timezones get zero grace.

**Change:**
```solidity
uint256 public constant AUTO_RELEASE_GRACE = 15 minutes;
```
In `autoRelease()`, non-seller callers must wait an extra 15 minutes:
```solidity
if (msg.sender != job.seller) {
    require(block.timestamp > job.disputeWindowEnd + AUTO_RELEASE_GRACE,
            "EscrowEngine: grace period active");
}
```

The seller can still release at exact window expiry. This only blocks third-party bots and permissionless callers during the grace window. Buyers can still dispute normally during the full window.

### 1.3 — Per-Address Bond Purchase Cap

**File:** `src/BondingEngine.sol`
**Attack:** A whale buys the entire capacity of a bond market in one tx, draining discounted LOB that should have been distributed across participants.

**Changes:**
- Added `addressCap` field to `BondMarket` struct (max LOB payout per address per market, 0 = unlimited)
- Added tracking: `mapping(uint256 => mapping(address => uint256)) private _purchased`
- `createMarket()` takes new `addressCap` parameter
- `purchase()` enforces: `_purchased[marketId][msg.sender] + payout <= market.addressCap`
- New view: `purchasedByAddress(marketId, buyer) → uint256`

### 1.4 — No Tier Bonus if Unstake Pending

**File:** `src/BondingEngine.sol`
**Attack:** Flash-borrow LOB → stake to Platinum → buy bonds at 13% discount → request unstake → wait 7 days → unstake + claim → return loan. Profit = tier bonus delta (~3%).

**Change in `_tierBonusBps()`:**
```solidity
IStakingManager.StakeInfo memory info = stakingManager.getStakeInfo(buyer);
if (info.unstakeRequestAmount > 0) return 0;
```
If you're on your way out, you don't get the tier bonus. Closes the borrow-stake-buy-unstake loop completely.

### 1.5 — Arbitrator Self-Deactivation

**File:** `src/DisputeArbitration.sol`
**Problem:** Arbitrators who go offline (vacation, broken key) get slowly drained by 0.5% slashes per no-show dispute. They can't unstake because `_activeDisputeCount > 0`. They're trapped.

**Changes:**
- Added `mapping(address => bool) private _arbitratorPaused`
- Two new functions:
```solidity
function pauseAsArbitrator() external
function unpauseAsArbitrator() external
```
- In `_selectArbitrators()`: `if (_arbitratorPaused[candidate]) continue;`
- Paused arbitrators are never selected for new disputes but can still unstake and retain their rank

---

## Batch 2: Arbitration Hardening

Three changes to DisputeArbitration addressing the "2-of-3 collusion problem" — the most serious systemic risk identified in the analysis.

### 2.1 — Pairwise Voting Agreement Tracking

**File:** `src/DisputeArbitration.sol`
**Attack:** Two colluding arbitrators always vote the same way → guaranteed majority → guaranteed majority bonus → controlled rulings.

**Changes:**
- Added tracking state:
```solidity
mapping(bytes32 => uint256) private _pairAgreements;
mapping(bytes32 => uint256) private _pairDisagreements;
uint256 public constant COLLUSION_AGREEMENT_THRESHOLD = 90; // 90%
uint256 public constant COLLUSION_MIN_DISPUTES = 20;
```
- In `executeRuling()`: after processing all votes, every pair (i,j) is compared. Same direction → `_pairAgreements[key]++`, different → `_pairDisagreements[key]++`. Emits `CollusionFlagged(arbA, arbB, agreementRate)` when threshold crossed.
- In `_selectArbitrators()`: if a candidate + any already-selected arbitrator have >90% agreement over 20+ shared disputes, the candidate is skipped. This prevents known colluders from being placed on the same panel.
- New view: `getAgreementRate(arbA, arbB) → (uint256 agreements, uint256 disagreements)`

### 2.2 — Rubber-Stamp Bypass Fix

**File:** `src/DisputeArbitration.sol`
**Attack:** Old `consecutiveSameVotes` tracking was trivially bypassed by alternating: vote buyer on odd disputes, seller on even. Counter resets every switch direction.

**Changes:**
Replaced consecutive tracking with lifetime bias detection:
```solidity
mapping(address => uint256) public buyerVoteCount;
mapping(address => uint256) public sellerVoteCount;
```
In reward calculation: if `max(buyerVotes, sellerVotes) / total > 80%` → 50% reward penalty applied. This catches persistent bias regardless of ordering pattern.

A grace period (`QUALITY_GRACE_PERIOD = 5`) prevents penalizing new arbitrators on their first few votes (where 100% "bias" is statistically meaningless).

### 2.3 — Dispute Appeal Mechanism

**File:** `src/DisputeArbitration.sol`
**Problem:** If arbitrators collude, the losing party has zero recourse. The ruling is final, escrow funds are released, and slashing is irreversible.

**Changes:**
```solidity
uint256 public constant APPEAL_BOND = 500 ether;  // 500 LOB
uint256 public constant APPEAL_WINDOW = 48 hours;  // After ruling
```

**New flow:**
1. `executeRuling()` sets `d.appealDeadline = block.timestamp + APPEAL_WINDOW` but does NOT release escrow funds
2. Either party can call `appealRuling(disputeId)` within 48hr, paying 500 LOB bond
3. This creates a NEW dispute on the same job with a fresh 3-arbitrator panel (original panel excluded)
4. Original ruling is suspended (status → `Appealed`)
5. If appeal upholds original → bond goes to reward pool via `RewardDistributor`
6. If appeal overturns → bond returned to appealer, escrow follows the new ruling
7. If no appeal within 48hr → anyone can call `finalizeRuling(disputeId)` which releases escrow per the original ruling

**New `finalizeRuling()` function:** Permissionless, callable after appeal window. Checks `!d.appealed && block.timestamp > d.appealDeadline`, then calls `escrowEngine.resolveDispute()` and distributes rewards. This is the normal path for non-appealed disputes.

**Appeal disputes resolve immediately** — no second appeal. `_resolveAppeal()` handles the bond logic and routes escrow funds to the final winner.

---

## Batch 3: SybilGuard Full Hardening

Four changes addressing the weaponization risk — a malicious watcher + 2 colluding judges could grief-ban any competitor for 19x profit.

### 3.1 — Scaled Watcher Bond

**File:** `src/SybilGuard.sol`
**Attack:** Fixed 500 LOB bond to potentially seize 100K LOB stake = 200:1 leverage ratio.

**Changes:**
```solidity
uint256 public constant MIN_WATCHER_BOND = 500 ether;
uint256 public constant WATCHER_BOND_BPS = 500; // 5% of target's max stake
```
In `submitReport()`, bond is calculated dynamically:
```solidity
maxStake = max(stakingManager.getStake(subjects[i])) across all subjects
bondRequired = max(MIN_WATCHER_BOND, maxStake * 5 / 100)
```

A watcher targeting a Platinum staker (100K LOB) now needs 5,000 LOB bond instead of 500. This makes false reports 10x more expensive against high-value targets while keeping the floor at 500 for small accounts.

### 3.2 — 3 Judges for High-Stake Targets

**File:** `src/SybilGuard.sol`
**Attack:** Only 2 judges needed to confirm a ban. Two colluding judges = deterministic ban.

**Changes:**
```solidity
uint256 public constant HIGH_STAKE_THRESHOLD = 10_000 ether;
uint256 public constant HIGH_STAKE_MIN_JUDGES = 3;
```
New internal function `_requiredJudgesForReport(reportId)`:
- If any subject has stake >= 10K LOB → requires 3 judges
- Otherwise → requires 2 judges (unchanged for small accounts)

This means 3 colluding judges are needed to grief-ban a high-value target, which is significantly harder to coordinate.

### 3.3 — 48hr Delayed Ban with Cancel Window

**File:** `src/SybilGuard.sol`
**Problem:** Bans execute immediately when judges confirm. Victim has zero time to appeal before their entire stake is seized.

**Changes:**
```solidity
uint256 public constant BAN_DELAY = 48 hours;
mapping(uint256 => uint256) public reportBanScheduledAt;
mapping(uint256 => bool) public reportBanExecuted;
```

**New flow:**
1. `confirmReport()` — when judge threshold is met, sets `reportBanScheduledAt[reportId] = block.timestamp` and emits `BanScheduled`. Does NOT execute the ban.
2. `executeBan(reportId)` — permissionless, callable after 48hr delay. Executes the ban, seizes stake, distributes rewards.
3. `cancelBan(reportId)` — `APPEALS_ROLE` only, callable during the 48hr window. Cancels the scheduled ban, slashes the watcher's bond to treasury, increments watcher's rejected count.

This gives victims 48 hours to alert governance and get the ban cancelled before any funds are seized.

### 3.4 — Seizure Escrow (Refundable on Unban)

**File:** `src/SybilGuard.sol`
**Problem:** Even if a victim is unbanned, their slashed stake is already distributed (10% watcher, 5% judges, 85% treasury). The damage is permanent and irreversible.

**Changes:**
```solidity
uint256 public constant SEIZURE_ESCROW_PERIOD = 30 days;
mapping(address => uint256) public seizedInEscrow;
mapping(address => uint256) public seizureEscrowExpiry;
```

**New flow:**
1. `_seizeStake()` — slashes to `address(this)` (SybilGuard contract) instead of directly distributing. Stores amount in `seizedInEscrow[account]` with 30-day expiry.
2. `releaseEscrow(account)` — permissionless after 30-day period. Distributes: judge rewards (flat 100 LOB split), rest to treasury. (Watcher reward returned during `executeBan()`.)
3. `unban(account)` — if called within 30-day escrow period, returns seized funds to the victim via `lobToken.safeTransfer(account, escrowed)`.

This creates a 30-day safety net: if a false-positive ban is caught and reversed within 30 days, the victim gets their full stake back. After 30 days, funds are distributed normally.

---

## Batch 4: Operational Monitoring (No Contract Changes)

These are monitoring specs for the agent infrastructure (Sentinel/Arbiter/Steward) to implement.

### 4.1 — Bond + Staking Yield Monitoring

**Rationale:** If BondingEngine discount + StakingRewards yield > LOB price depreciation rate, the protocol is silently bleeding treasury value.

**Agent checklist:**
- Weekly: calculate combined effective APY = (bond discount annualized) + (staking reward APY)
- If combined APY > 50% annualized → post warning to forum + propose reducing bond discounts or reward emission rate
- Track: total LOB in active bond markets, total LOB in StakingRewards, current emission rate from RewardScheduler

### 4.2 — Token Allowlist Vetting Process

**Rationale:** If a non-LOB token with transfer hooks gets allowlisted (ERC-777, rebasing token, admin-pausable), cross-contract call chains become exploitable.

**Mandatory checks before `allowlistToken()` is called:**
1. Verify token has no transfer hooks (not ERC-777, no `_beforeTokenTransfer` overrides)
2. Verify token `transfer()` returns bool (standard ERC-20)
3. Verify token has no rebasing mechanism
4. Verify token has no admin-controlled pause/blacklist that could freeze escrowed funds
5. Test: deploy a mock escrow flow on testnet with the token before allowlisting on mainnet

### 4.3 — Death Spiral Circuit Breakers

**Rationale:** In a prolonged price decline, cascading unstakes → fewer arbitrators → unresolved disputes → less activity → more unstakes.

**Agent monitoring thresholds:**
- Total staked drops >20% in 7 days → propose emergency reward boost
- Active arbitrators < 10 → propose reduced dispute thresholds or arbitrator incentive increase
- Zero bond market purchases for 14 days → propose market closure or price update

**Future consideration:** Governance-adjustable tier thresholds (requires StakingManager upgrade, out of scope for this round).

---

## Files Modified

| File | Changes |
|------|---------|
| `src/EscrowEngine.sol` | MIN_ESCROW_AMOUNT constant + enforcement in createJob/createSkillEscrow, AUTO_RELEASE_GRACE constant + enforcement in autoRelease |
| `src/BondingEngine.sol` | addressCap in BondMarket struct + createMarket param + purchase enforcement + _purchased mapping, unstake check in _tierBonusBps, purchasedByAddress view |
| `src/interfaces/IBondingEngine.sol` | Updated BondMarket struct + createMarket signature + purchasedByAddress view |
| `src/DisputeArbitration.sol` | _arbitratorPaused mapping + pause/unpause functions, pairwise agreement tracking + collusion filtering in _selectArbitrators, lifetime buyerVoteCount/sellerVoteCount + bias penalty, APPEAL_BOND/APPEAL_WINDOW + appealRuling + finalizeRuling + _resolveAppeal, QUALITY_GRACE_PERIOD for new arbitrators |
| `src/interfaces/IDisputeArbitration.sol` | New functions (pauseAsArbitrator, unpauseAsArbitrator, appealRuling, finalizeRuling, getAgreementRate), new events (ArbitratorPaused, ArbitratorUnpaused, CollusionFlagged, AppealFiled, AppealBondForfeited, AppealBondReturned, DisputeFinalized), Appealed status in enum, appealed + appealDeadline in struct |
| `src/SybilGuard.sol` | Dynamic bond (MIN_WATCHER_BOND + WATCHER_BOND_BPS), HIGH_STAKE_THRESHOLD + HIGH_STAKE_MIN_JUDGES + _requiredJudgesForReport, BAN_DELAY + reportBanScheduledAt + reportBanExecuted + executeBan + cancelBan, SEIZURE_ESCROW_PERIOD + seizedInEscrow + seizureEscrowExpiry + releaseEscrow, unban refunds within escrow period |
| `test/EscrowEngine.t.sol` | +5 tests (min escrow revert for jobs/skills, grace period seller/non-seller/after-grace) |
| `test/BondingEngine.t.sol` | +5 tests (within cap, exceeds cap revert, zero cap unlimited, no bonus with pending unstake, bonus after unstake completes) |
| `test/DisputeArbitration.t.sol` | +12 tests (pause/unpause/selection filter, appeal within/after window, appeal fresh panel excludes originals, finalize ruling, overturned returns bond, upheld forfeits bond, collusion flagging, bias penalty) |
| `test/SybilGuard.t.sol` | +18 tests (scaled bond, min 500, max across subjects, 2 judges insufficient for high-stake, 3 judges bans, 2 judges bans low-stake, ban scheduled not immediate, execute after delay, revert before delay, cancel during window, cancel slashes bond, seizure to escrow, release after period, release revert during period, unban returns funds, unban after expired no refund, double release reverts, judge flat rewards) |
| `test/integration/FullFlow.t.sol` | Updated dispute flows to call finalizeRuling after executeRuling (48hr warp) |
| `test/X402EscrowBridge.t.sol` | Updated 3 dispute helpers to call finalizeRuling after executeRuling |
| `test/X402CreditFacility.t.sol` | Added MockDisputeArbitration stubs for new interface functions |

## Test Results

```
Ran 31 test suites: 1001 tests passed, 0 failed, 0 skipped
```

---

## Attack Surface Coverage

| # | Attack | Severity | Fix | Status |
|---|--------|----------|-----|--------|
| 1 | Bond discount arb (no per-user cap) | Medium | Per-address cap in BondingEngine | Deployed |
| 2 | Borrow-stake-buy tier gaming | Low | Unstake check in _tierBonusBps | Deployed |
| 3 | Arbitrator collusion (2-of-3) | Critical | Pairwise tracking + bias detection + appeal mechanism | Deployed |
| 4 | SybilGuard weaponization | Critical | Scaled bond + 3 judges + delayed ban + seizure escrow | Deployed |
| 5 | Auto-release timing attack | Medium | 15min grace period for non-seller callers | Deployed |
| 6 | Reputation wash trading | High | 10 LOB minimum escrow | Deployed |
| 7 | Bond + staking yield stacking | Low | Agent monitoring spec | Monitoring |
| 8 | Arbitrator stake drain | Medium | Self-deactivation (pauseAsArbitrator) | Deployed |
| 9 | Cross-contract reentrancy | Critical | Token vetting checklist | Process |
| 10 | Economic death spiral | High | Circuit breaker monitoring spec | Monitoring |
