# LightningGovernor — Fast-Track Governance for Platinum Stakers

**Date:** 2026-02-22
**Status:** Implemented, tests passing (961/961)
**Contract:** `packages/contracts/src/LightningGovernor.sol`

---

## Problem

TreasuryGovernor has a hardcoded 24hr timelock on ALL proposals. For routine ops like configuring RewardScheduler streams, adjusting reward params, or emergency pauses — that's way too slow. The DAO votes on policy, the founding agents execute. But every execution has to crawl through the 24hr multisig cycle even for stuff that should take minutes.

## Solution

A new governance layer where Platinum-tier stakers (100K+ LOB) vote on operational proposals, and founding agents (Sentinel, Arbiter, Steward) execute after a short 15-minute delay. TreasuryGovernor retains ultimate authority — it controls LightningGovernor's config and can revoke its permissions at any time.

## Governance Hierarchy

```
TreasuryGovernor (24hr timelock, 2-of-3 multisig)
    |
    +-- Holds DEFAULT_ADMIN_ROLE on all protocol contracts
    +-- Grants DEFAULT_ADMIN_ROLE to LightningGovernor on SPECIFIC targets
    +-- Holds DEFAULT_ADMIN_ROLE on LightningGovernor itself
    |
    +-- LightningGovernor (15min delay, Platinum quorum)
            |
            +-- Whitelist restricts callable (target, selector) pairs
            +-- EXECUTOR_ROLE: 3 founding agents
            +-- GUARDIAN_ROLE: emergency cancel
```

---

## Contract Overview

### Inheritance
```
ILightningGovernor, AccessControl, ReentrancyGuard, Pausable
```

### Roles
| Role | Holders | Purpose |
|------|---------|---------|
| `DEFAULT_ADMIN_ROLE` | TreasuryGovernor (sole) | Configure whitelist, quorum, timing params, pause/unpause |
| `EXECUTOR_ROLE` | Sentinel, Arbiter, Steward | Execute approved proposals after delay |
| `GUARDIAN_ROLE` | Configurable | Emergency cancel any active/approved proposal |

The deployer gets NO roles. Admin is set to TreasuryGovernor in the constructor.

### Safety Bounds (Constants)
| Parameter | Min | Max | Default |
|-----------|-----|-----|---------|
| Quorum | 2 | 20 | 3 |
| Execution Delay | 10 min | 6 hr | 15 min |
| Voting Window | 1 hr | 7 days | 24 hr |
| Execution Window | 1 hr | 48 hr | 6 hr |
| Proposer Cooldown | — | — | 10 min (fixed) |

---

## Proposal Lifecycle

```
[Platinum staker creates proposal]
    |
    v
  ACTIVE  ----(3 Platinum votes)----> APPROVED
    |                                     |
    |  (voting deadline passes)           |  (15min delay)
    v                                     v
  EXPIRED                            EXECUTABLE
    |                                     |
    |                                     |  (executor calls execute())
    |                                     v
    |                                  EXECUTED
    |
    +-- (proposer or guardian cancels) --> CANCELLED
```

1. **Create** — Platinum staker submits (target + calldata + description). Must be whitelisted target+selector. Proposer auto-votes (1/3). 10-min cooldown per proposer.
2. **Vote** — Other Platinum stakers vote (yes only, 1 vote per staker). Tier checked at vote time via `stakingManager.getTier()`.
3. **Approve** — Auto-triggered when quorum is reached. 15-minute execution delay starts.
4. **Execute** — Founding agent calls `execute()` after delay, within the execution window. Whitelist re-checked at execution time.
5. **Cancel** — Proposer or Guardian can cancel at any point (Active or Approved).
6. **Expire** — Voting window = 24hrs, execution window = 6hrs after approval.

---

## Key Security Enforcements

### Self-Call Protection
Both `createProposal` and `setWhitelisted` block `target == address(this)`. LightningGovernor cannot modify itself — only TreasuryGovernor can change its config.

### Flash-Loan Resistance
StakingManager has a 7-day unstake cooldown. You can't atomically stake → vote → unstake in one transaction. Genuine 100K LOB stake is required.

### Whitelist Re-Validation
The whitelist is checked both at proposal creation AND at execution time. If admin revokes a (target, selector) pair between the vote and execution, the proposal cannot execute.

### Minimum Calldata
Calldata must be at least 4 bytes (function selector). Prevents empty/malformed proposals.

### Quorum Integrity
Minimum quorum of 3 means at least 300K LOB at stake across 3 distinct addresses. No single whale can push a proposal through.

---

## Recommended Whitelist

### Emergency Pauses (any Pausable contract)
| Target | Functions |
|--------|-----------|
| EscrowEngine | `pause()`, `unpause()` |
| StakingManager | `pause()`, `unpause()` |
| DisputeArbitration | `pause()`, `unpause()` |
| ServiceRegistry | `pause()`, `unpause()` |
| RewardScheduler | `pause()`, `unpause()` |
| StakingRewards | `pause()`, `unpause()` |
| LiquidityMining | `pause()`, `unpause()` |

### Reward Management
| Target | Functions |
|--------|-----------|
| RewardScheduler | `createStream()`, `updateEmission()`, `pauseStream()`, `resumeStream()` |
| StakingRewards | `addRewardToken()` |

### Explicitly NOT Whitelisted (24hr TreasuryGovernor path)
- `grantRole` / `revokeRole` on any contract
- `withdrawBudget` / fund movement
- Signer management
- Contract wiring changes

---

## Deployment

### Standalone Deploy
```bash
forge script script/DeployLightningGovernor.s.sol:DeployLightningGovernorScript \
  --rpc-url $BASE_RPC_URL --broadcast --verify -vvvv
```

**Required env vars:** `PRIVATE_KEY`, `STAKING_MANAGER_ADDRESS`, `TREASURY_GOVERNOR_ADDRESS`, `SENTINEL_ADDRESS`, `ARBITER_ADDRESS`, `STEWARD_ADDRESS`, `GUARDIAN_ADDRESS`

### Post-Deploy Wiring (via TreasuryGovernor proposals)
1. Grant `DEFAULT_ADMIN_ROLE` on target contracts to LightningGovernor
2. Configure whitelist entries via `setWhitelisted()`

### DeployAll Integration
LightningGovernor is step 15 in `DeployAll.s.sol`. It automatically:
- Deploys with TreasuryGovernor as admin
- Grants `DEFAULT_ADMIN_ROLE` on 7 target contracts (StakingManager, DisputeArbitration, EscrowEngine, ServiceRegistry, RewardScheduler, StakingRewards, LiquidityMining)

---

## Test Coverage

65 tests across 9 groups in `test/LightningGovernor.t.sol`:

| Group | Tests | Coverage |
|-------|-------|----------|
| Constructor | 6 | Roles, defaults, zero-address reverts |
| createProposal | 8 | Platinum access, whitelist, self-target, calldata, auto-vote, cooldown, pause |
| vote | 7 | Platinum access, double-vote, not found, not active, voting closed, pause |
| Auto-approve | 3 | Quorum trigger, timing, below-quorum |
| execute | 7 | After delay, before delay, non-executor, not approved, expired, whitelist revoked, pause |
| cancel | 6 | By proposer, by guardian, approved proposal, unauthorized, already executed, already cancelled |
| Admin config | 15 | Whitelist add/remove/revert, quorum/delay/window bounds, pause/unpause |
| Expiry | 4 | Active expired, active not expired, approved expired, approved not expired |
| Integration | 5 | Full lifecycle, voter demotion, proposal count, execution failure, multiple executors |

Tests use real `StakingManager` + `LOBToken` (not mocks) so tier checks are accurate.

---

## Files

| File | Action | Lines |
|------|--------|-------|
| `src/interfaces/ILightningGovernor.sol` | Created | ~55 |
| `src/LightningGovernor.sol` | Created | ~230 |
| `script/DeployLightningGovernor.s.sol` | Created | ~50 |
| `test/LightningGovernor.t.sol` | Created | ~530 |
| `script/DeployAll.s.sol` | Modified | +25 |

No existing contracts were modified. LightningGovernor is wired purely via role grants from TreasuryGovernor.

---

## Security Analysis

| Attack | Mitigation |
|--------|-----------|
| Single whale pushes malicious proposal | Quorum of 3 = minimum 300K LOB at stake across 3 distinct addresses |
| Flash-loan vote manipulation | StakingManager has 7-day unstake cooldown |
| Voter demoted after voting | Acceptable — vote already cast, 7-day cooldown makes this slow anyway |
| Whitelisted function abuse | Target contracts have internal validation. Whitelist is granular per (target, selector). 15-min delay gives guardians cancel window |
| Executor collusion | Executors can only execute what Platinum stakers voted for, on whitelisted functions. Can't create or vote |
| Role escalation via grantRole | `grantRole` selector is never whitelisted. LightningGovernor can only call specific operational functions |
| Self-modification | `target == address(this)` blocked in both createProposal and setWhitelisted |
| Stale proposals | 6-hour execution window after approval. Whitelist re-checked at execution time |
| Proposal spam | 10-minute per-proposer cooldown. Requires genuine 100K LOB stake |
