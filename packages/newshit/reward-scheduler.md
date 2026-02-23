# RewardScheduler — Automated Reward Pool Funding

**Date:** 2026-02-22
**Status:** Implemented, tests passing (831/831)
**Contract:** `packages/contracts/src/RewardScheduler.sol`

---

## Problem

StakingRewards and LiquidityMining are Synthetix-model reward pools — they work, but funding them is a manual grind. Every reward period requires a TreasuryGovernor multisig proposal, a 24hr timelock, and someone with `REWARD_NOTIFIER_ROLE` calling `notifyRewardAmount` with exact amounts and duration math. There's no automation to keep the pools topped up.

## Solution

A single RewardScheduler contract that:
- Holds LOB (or any ERC-20 reward token)
- Drips tokens into StakingRewards and/or LiquidityMining at a configurable rate
- Exposes a permissionless `drip()` function anyone can call to flush accrued rewards
- Supports multiple concurrent streams with independent configs

## Governance Flow

1. **DAO votes** on reward budget and emission rate
2. **Agent founders** (Sentinel, Arbiter, Steward) execute the DAO decision via TreasuryGovernor — call `topUp()` to fund the scheduler, `createStream()` to set emission params
3. **Agents call `drip()`** on a cron schedule (permissionless, no multisig needed) to keep reward pools fed

The agents are the execution layer. The DAO sets policy, the agents carry it out. Instead of doing the full multisig dance every week, they set up a stream once and just call `drip()` on cron.

---

## Contract Overview

### Inheritance
```
IRewardScheduler, AccessControl, ReentrancyGuard, Pausable
```

### Immutables
- `stakingRewards` — StakingRewards contract address
- `liquidityMining` — LiquidityMining contract address

### Core Data Structure

```solidity
enum TargetType { STAKING_REWARDS, LIQUIDITY_MINING }

struct Stream {
    uint256 id;
    TargetType targetType;
    address rewardToken;
    uint256 emissionPerSecond;  // tokens/sec in wei
    uint256 lastDripTime;
    uint256 endTime;            // 0 = perpetual
    bool active;
}
```

---

## Functions

### Permissionless

| Function | Description |
|----------|-------------|
| `drip(streamId)` | Flushes accrued rewards for a single stream to its target |
| `dripAll()` | Drips all active streams in one tx |
| `topUp(token, amount)` | Anyone can add reward tokens to the scheduler |

### Admin (DEFAULT_ADMIN_ROLE)

| Function | Description |
|----------|-------------|
| `createStream(targetType, rewardToken, emissionPerSecond, endTime)` | Create a new reward stream |
| `updateEmission(streamId, newEmissionPerSecond)` | Change emission rate (auto-drips at old rate first) |
| `pauseStream(streamId)` | Pause a stream (auto-drips first) |
| `resumeStream(streamId)` | Resume a paused stream (resets lastDripTime to now) |
| `withdrawBudget(token, amount, to)` | Recover unused tokens |
| `pause()` / `unpause()` | Global emergency pause |

### Views

| Function | Description |
|----------|-------------|
| `getStream(streamId)` | Full stream details |
| `getActiveStreams()` | All currently active streams |
| `streamBalance(streamId)` | How much has accrued but not yet dripped |
| `getStreamCount()` | Total streams ever created |

---

## How `drip()` Works

```
elapsed = min(block.timestamp, endTime) - lastDripTime
amount  = elapsed * emissionPerSecond

if amount > contract token balance:
    cap amount to balance
    recalculate elapsed from capped amount

approve target contract for amount
call target.notifyRewardAmount(amount, elapsed)
update lastDripTime
```

The `elapsed` value is passed as the `duration` parameter to `notifyRewardAmount`. This means the Synthetix reward rate math handles leftover accumulation correctly — if there's remaining rewards from a previous period, they get folded into the new rate.

---

## Design Decisions

### 1. Permissionless `drip()`
No special role required. Keeper bots, agent crons, MEV searchers, or anyone can call it. The contract just flushes what's accrued — no trust needed.

### 2. No Catch-Up
If the scheduler runs out of tokens, `drip()` caps to actual balance. When refilled via `topUp()`, it resumes from the current time — not retroactively. If there's nothing to drip, it's a no-op (no revert).

### 3. Auto-Flush on State Changes
`updateEmission()` and `pauseStream()` both call `_drip()` internally before modifying state. This ensures accrued rewards at the old rate are flushed before any changes take effect.

### 4. OZ v4 Approval Pattern
Uses `approve(0)` then `approve(amount)` before calling `notifyRewardAmount`, because both StakingRewards and LiquidityMining do `safeTransferFrom(msg.sender, ...)` internally. The zero-first pattern handles OZ v4's `safeApprove` behavior.

### 5. Stream Deactivation
Streams with an `endTime` automatically deactivate when `block.timestamp >= endTime` during a drip. They get removed from the `_activeStreamIds` array so `dripAll()` skips them.

---

## Deployment

### Standalone (against existing protocol)
```bash
forge script script/DeployRewardScheduler.s.sol:DeployRewardScheduler \
  --rpc-url $BASE_RPC_URL --broadcast --verify -vvvv
```

Required env: `PRIVATE_KEY`, `STAKING_REWARDS_ADDRESS`, `LIQUIDITY_MINING_ADDRESS`

### Post-Deploy Wiring (via TreasuryGovernor multisig)
1. Grant `REWARD_NOTIFIER_ROLE` on StakingRewards to RewardScheduler
2. Grant `REWARD_NOTIFIER_ROLE` on LiquidityMining to RewardScheduler
3. Grant `DEFAULT_ADMIN_ROLE` on RewardScheduler to TreasuryGovernor
4. Renounce deployer's `DEFAULT_ADMIN_ROLE` on RewardScheduler
5. Fund scheduler with LOB via `topUp()`
6. Create streams via `createStream()`

### Full Protocol Deploy
Both `DeployAll.s.sol` and `Deploy.s.sol` have been updated to include StakingRewards, LiquidityMining, and RewardScheduler in the deploy chain with automatic role wiring and admin transfer.

---

## Agent Cron Integration

Add to agent crontabs — a simple periodic `drip()` call:

```
# Drip all reward streams daily
cast send $REWARD_SCHEDULER_ADDRESS "dripAll()" --private-key $AGENT_KEY --rpc-url $BASE_RPC_URL
```

Or `drip(uint256)` for individual streams. The call is cheap and idempotent — if nothing has accrued since the last drip, it's a no-op.

---

## Files

### Created
| File | Description |
|------|-------------|
| `src/interfaces/IRewardScheduler.sol` | Interface — enum, struct, events, function signatures |
| `src/RewardScheduler.sol` | Implementation (~210 lines) |
| `script/DeployRewardScheduler.s.sol` | Standalone deploy script |
| `test/RewardScheduler.t.sol` | 46 unit tests |

### Modified
| File | Changes |
|------|---------|
| `script/DeployAll.s.sol` | Added StakingRewards + LiquidityMining + RewardScheduler to deploy chain, role wiring, admin transfer |
| `script/Deploy.s.sol` | Same additions for V1 deploy script |
| `test/integration/FullFlow.t.sol` | Added `test_RewardScheduler_FullFlow` end-to-end test |

---

## Test Coverage

**46 unit tests** in `test/RewardScheduler.t.sol`:
- `createStream` — happy path (both targets), with endTime, revert zero emission/token/endTime-in-past/non-admin
- `drip` — happy path, permissionless caller, caps to balance, no-op if nothing accrued, respects endTime, respects pause, inactive stream, double-drip same block, zero balance, LiquidityMining target
- `dripAll` — drips all active streams
- `updateEmission` — flushes old rate first, revert zero/non-admin
- `pauseStream / resumeStream` — flushes before pause, resumes from current time, revert already paused/active, revert stream ended
- `topUp` — anyone can fund, revert zero amount/token
- `withdrawBudget` — admin only, revert non-admin/zero recipient/zero amount
- Views — getActiveStreams, excludes paused, streamBalance, caps to contract balance, getStreamCount
- Global pause — blocks drip, unpause allows drip
- Integration — StakingRewards reward rate verification, LiquidityMining reward rate verification, multiple drips over time, topUp and continue after exhaustion
- Constructor — revert zero addresses

**1 integration test** in `test/integration/FullFlow.t.sol`:
- Full stack: deploy → create stream → stake → warp 1 week → drip → verify rewards → topUp → warp another week → drip → claim rewards

**Full suite: 831 tests passed, 0 failed.**
