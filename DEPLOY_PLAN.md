# LOBSTR Full Deployment Plan

> **SENSITIVE** — Contains deployment order, key management steps, and operational procedures.
> All contracts audited and passing (1094/1094 tests).

---

## Phase 0: Pre-Deploy Prep

### 0.1 Environment Variables

Create a `.env` file in `packages/contracts/` (NEVER commit this):

```bash
# Deployer
PRIVATE_KEY=<deployer-private-key>

# RPCs
BASE_MAINNET_RPC_URL=<alchemy-or-infura-base-mainnet>
BASESCAN_API_KEY=<basescan-api-key>

# Multisig signers (4-of-4 TreasuryGovernor)
SIGNER_2_ADDRESS=<signer2>
SIGNER_3_ADDRESS=<signer3>
SIGNER_4_ADDRESS=<signer4>

# Airdrop
APPROVAL_SIGNER_ADDRESS=<backend-signer-for-airdrop-approvals>

# Team/Agents
TEAM_BENEFICIARY_ADDRESS=<team-vesting-beneficiary>
LP_WALLET_ADDRESS=<lp-wallet>
SENTINEL_ADDRESS=<titus-agent-wallet>
ARBITER_ADDRESS=<solomon-agent-wallet>
STEWARD_ADDRESS=<daniel-agent-wallet>
GUARDIAN_ADDRESS=<lightning-governor-guardian>

# DEX — LP_TOKEN_ADDRESS not needed at deploy time
# Deploy LiquidityMining + RewardScheduler AFTER creating DEX pool
```

### 0.2 Verify Tooling

```bash
forge --version     # Foundry installed
cast --version      # Cast available
source .env         # Load env vars
cast balance $DEPLOYER --rpc-url $BASE_MAINNET_RPC_URL  # ETH for gas (~0.05 ETH)
```

### 0.3 Git Tag

```bash
git tag v4.0-mainnet-deploy
git push origin v4.0-mainnet-deploy
```

---

## Phase 1: Deploy Core Contracts (DeployAll.s.sol)

This deploys 18 contracts in one atomic transaction:

```bash
cd packages/contracts
source .env

forge script script/DeployAll.s.sol:DeployAllScript \
  --rpc-url $BASE_MAINNET_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY \
  -vvvv
```

**Contracts deployed (in order):**

| # | Contract | Token Distribution |
|---|----------|--------------------|
| 1 | LOBToken | 1B minted to deployer |
| 2 | ReputationSystem | — |
| 3 | StakingManager | — |
| 4 | TreasuryGovernor | 300M LOB (30%) |
| 5 | RewardDistributor | — |
| 6 | SybilGuard | — |
| 7 | ServiceRegistry | — |
| 8 | DisputeArbitration | — |
| 9 | EscrowEngine | — |
| 10 | LoanEngine | — |
| 11 | X402CreditFacility | — |
| 12 | StakingRewards | — |
| 13 | LightningGovernor | — |
| — | ~~LiquidityMining~~ | Deferred: deploy after DEX LP pool creation |
| — | ~~RewardScheduler~~ | Deferred: deploy after LiquidityMining |
| 16 | Groth16VerifierV4 | — |
| 17 | AirdropClaimV3 | 400M LOB (40%) |
| 18 | TeamVesting | 149.42M LOB (15% - agent allocs) |

**Also handled by DeployAll:**
- All cross-contract role grants
- Admin transfer to TreasuryGovernor
- Deployer renounces all admin roles
- Token distribution: 400M Airdrop, 300M Treasury, 150M LP, 580K Agents, 149.42M Vesting

**After this completes:**
1. Save ALL addresses from the console output
2. Verify each contract on BaseScan (should be automatic with `--verify`)
3. Confirm deployer balance = 0 LOB (all distributed)

---

## Phase 2: Deploy Remaining Contracts (Standalone Scripts)

These 9 contracts are NOT in DeployAll and need individual deployment. Update each script's addresses to point to the Phase 1 contracts.

**Deploy order (dependencies are already live from Phase 1):**

### 2.1 ReviewRegistry
```bash
# Update script/DeployReviewRegistry.s.sol with new EscrowEngine + SybilGuard addresses
forge script script/DeployReviewRegistry.s.sol \
  --rpc-url $BASE_MAINNET_RPC_URL --broadcast --verify -vvvv
```

### 2.2 MultiPartyEscrow
```bash
# Update with EscrowEngine, DisputeArbitration, LOBToken, SybilGuard
forge script script/DeployMultiPartyEscrow.s.sol \
  --rpc-url $BASE_MAINNET_RPC_URL --broadcast --verify -vvvv
```

### 2.3 InsurancePool
```bash
# Update with LOBToken, EscrowEngine, DisputeArbitration, ReputationSystem,
# StakingManager, SybilGuard, ServiceRegistry, TreasuryGovernor
forge script script/DeployInsurancePool.s.sol \
  --rpc-url $BASE_MAINNET_RPC_URL --broadcast --verify -vvvv
```

### 2.4 SubscriptionEngine
```bash
forge script script/DeploySubscriptionEngine.s.sol \
  --rpc-url $BASE_MAINNET_RPC_URL --broadcast --verify -vvvv
```

### 2.5 BondingEngine
```bash
forge script script/DeployBondingEngine.s.sol \
  --rpc-url $BASE_MAINNET_RPC_URL --broadcast --verify -vvvv
```

### 2.6 DirectiveBoard
```bash
forge script script/DeployDirectiveBoard.s.sol \
  --rpc-url $BASE_MAINNET_RPC_URL --broadcast --verify -vvvv
```

### 2.7 RolePayroll
```bash
# Needs: LOBToken, USDC, StakingManager, DisputeArbitration,
# Groth16UptimeVerifier, TreasuryGovernor, InsurancePool
forge script script/DeployRolePayroll.s.sol \
  --rpc-url $BASE_MAINNET_RPC_URL --broadcast --verify -vvvv
```

### 2.8 X402EscrowBridge (if needed for x402 payments)
```bash
forge script script/DeployBridge.s.sol \
  --rpc-url $BASE_MAINNET_RPC_URL --broadcast --verify -vvvv
```

**Not yet scripted (deploy manually or create scripts):**
- SkillRegistry
- PipelineRouter

---

## Phase 3: Post-Deploy Role Grants (via Multisig)

These grants require TreasuryGovernor multisig approval since deployer already renounced admin:

### 3.1 Phase 2 Contract Roles

| Target Contract | Role | Grantee | Why |
|----------------|------|---------|-----|
| StakingManager | SLASHER_ROLE | InsurancePool | Slash for insurance claims |
| StakingManager | SLASHER_ROLE | RolePayroll | Slash abandoned roles |
| StakingManager | LOCKER_ROLE | RolePayroll | Lock stake for enrolled roles |
| ReputationSystem | RECORDER_ROLE | InsurancePool | Record insured job completions |
| ReputationSystem | RECORDER_ROLE | SubscriptionEngine | Record subscription completions |
| DisputeArbitration | ESCROW_ROLE | MultiPartyEscrow | Submit disputes for multi-party jobs |
| RolePayroll | ROOT_POSTER_ROLE | (heartbeat aggregator) | Post weekly uptime merkle roots |
| RolePayroll | DISPUTE_ROLE | DisputeArbitration | Record dispute participation |
| X402EscrowBridge | FACILITATOR_ROLE | (facilitator wallet) | Create escrow jobs |
| X402CreditFacility | FACILITATOR_ROLE | (facilitator wallet) | Create credit draws |
| X402CreditFacility | POOL_MANAGER_ROLE | (pool manager) | Manage lending pool |

### 3.2 Founder Agent Setup

Via TreasuryGovernor proposal:

```
1. DisputeArbitration.certifyArbitrator(SENTINEL_ADDRESS)
2. DisputeArbitration.certifyArbitrator(ARBITER_ADDRESS)
3. DisputeArbitration.certifyArbitrator(STEWARD_ADDRESS)
4. DisputeArbitration.setProtectedArbiter(SENTINEL_ADDRESS, true)
5. DisputeArbitration.setProtectedArbiter(ARBITER_ADDRESS, true)
6. DisputeArbitration.setProtectedArbiter(STEWARD_ADDRESS, true)
7. SybilGuard.grantRole(WATCHER_ROLE, SENTINEL_ADDRESS)
8. SybilGuard.grantRole(JUDGE_ROLE, ARBITER_ADDRESS)
9. SybilGuard.grantRole(JUDGE_ROLE, STEWARD_ADDRESS)
10. RolePayroll.setFounderAgent(SENTINEL_ADDRESS, true)
11. RolePayroll.setFounderAgent(ARBITER_ADDRESS, true)
12. RolePayroll.setFounderAgent(STEWARD_ADDRESS, true)
```

### 3.3 Treasury Allowances

Via TreasuryGovernor:
```
1. LOBToken.approve(RolePayroll, <weekly_budget>) — for weekly payroll claims
2. LOBToken.approve(RewardDistributor, <reward_budget>) — for arbitrator rewards
```

### 3.4 Seed Pools

```
1. RewardDistributor — deposit LOB for arbitrator reward budget
2. RewardScheduler — topUp() with LOB, then createStream() for staking/LP rewards
3. X402CreditFacility — depositToPool() with LOB for credit lending
4. DEX LP — pair 150M LOB with ETH/USDC on Uniswap/Aerodrome
```

---

## Phase 4: Update Contract Addresses

### 4.1 Web Frontend (`packages/web/src/config/contract-addresses.ts`)

Update ALL addresses in `CONTRACTS_BY_CHAIN[8453]` with new deployment addresses:

```typescript
export const CONTRACTS_BY_CHAIN: Record<number, ContractAddresses> = {
  [8453]: {
    lobToken: "0x...",              // NEW
    reputationSystem: "0x...",     // NEW
    stakingManager: "0x...",       // NEW
    treasuryGovernor: "0x...",     // NEW
    // ... ALL 28 contracts
  }
};
```

### 4.2 ABIs (`packages/web/src/config/abis.ts`)

Regenerate ABIs from the compiled contracts:
```bash
cd packages/contracts
# ABIs are in out/<Contract>.sol/<Contract>.json
# Copy the "abi" field from each JSON into the web config
```

Or use a script to extract:
```bash
for f in out/*.sol/*.json; do
  name=$(basename $(dirname $f) .sol)
  jq '.abi' $f > /tmp/${name}.abi.json
done
```

### 4.3 OpenClaw CLI (`packages/openclaw/src/lib/config.ts`)

Update mainnet contract addresses to match Phase 1+2 addresses.

### 4.4 OpenClaw Skill (`packages/openclaw-skill/src/lib/format.ts` and related)

Update any hardcoded addresses or ABIs.

### 4.5 X402 Facilitator (`packages/x402-facilitator/src/config.ts`)

Update contract addresses for mainnet.

---

## Phase 5: Update Indexer

### 5.1 Ponder Config (`packages/indexer/ponder.config.ts`)

Since addresses come from `packages/web/src/config/contract-addresses.ts`, updating Phase 4.1 automatically updates the indexer. But verify:

- [ ] `startBlock` set to the deploy block number (check BaseScan for first tx)
- [ ] All 28 contracts listed with correct addresses
- [ ] ABIs match the deployed bytecode

### 5.2 New ABIs for Phase 2 Contracts

Add/update ABI files in `packages/indexer/abis/` for any new contracts:
- `RolePayroll.ts` (already exists)
- `InsurancePool.ts` (if updated)
- Any new Phase 2 contracts

### 5.3 Redeploy Indexer

```bash
cd packages/indexer
pnpm codegen    # Regenerate Ponder types
pnpm dev        # Test locally first
pnpm start      # Deploy to production
```

---

## Phase 6: Agent Bootstrap

### 6.1 Fund Agent Wallets

Agents receive LOB directly from DeployAll (580K total):
- Sentinel (Titus): 250K LOB
- Arbiter (Solomon): 175K LOB
- Steward (Daniel): 155K LOB

### 6.2 Agent Staking

Each agent stakes for Principal rank (100K LOB):
```
1. LOBToken.approve(StakingManager, 100_000 ether)
2. StakingManager.stake(100_000 ether)
```

### 6.3 Arbitrator Registration

Each agent stakes as arbitrator in DisputeArbitration:
```
1. LOBToken.approve(DisputeArbitration, 100_000 ether)
2. DisputeArbitration.stakeAsArbitrator(100_000 ether)
```
(Certification + protection already done in Phase 3.2)

### 6.4 Service Listings

Agents register their services in ServiceRegistry.

---

## Phase 7: Frontend Deployment

### 7.1 Build & Test

```bash
cd packages/web
pnpm install
pnpm build          # Verify no build errors
pnpm lint           # Clean lint
```

### 7.2 Environment Variables

Set production env vars:
```bash
NEXT_PUBLIC_CHAIN_ID=8453
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<wc-project-id>
# Firebase config for backend features
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
```

### 7.3 Deploy

Deploy to Vercel/hosting:
```bash
vercel --prod
# Or: pnpm build && pnpm start
```

---

## Phase 8: OpenClaw + Skills Deployment

### 8.1 OpenClaw Core (`packages/openclaw/`)

```bash
cd packages/openclaw
pnpm build
# Update config.ts with mainnet addresses (done in Phase 4.3)
# Publish or deploy the CLI
```

### 8.2 OpenClaw Skill (`packages/openclaw-skill/`)

```bash
cd packages/openclaw-skill
pnpm build
# Update any hardcoded addresses
# Deploy/publish the skill
```

### 8.3 LobstrClaw (`packages/lobstrclaw/`)

Update submodule reference if needed:
```bash
cd packages/lobstrclaw
git pull origin main
```

---

## Phase 9: X402 Facilitator

```bash
cd packages/x402-facilitator
# Update config.ts with mainnet addresses (done in Phase 4.5)
# Set FACILITATOR_PRIVATE_KEY in production env
pnpm build
pnpm start
```

---

## Phase 10: Smoke Tests

### 10.1 Contract Verification

- [ ] Every contract verified on BaseScan
- [ ] All admin roles transferred to TreasuryGovernor
- [ ] Deployer has 0 LOB and no admin roles
- [ ] `pnpm check:address-wiring` passes (if available)

### 10.2 End-to-End Flows

- [ ] Airdrop: attest → prove → claim → milestone unlock
- [ ] Escrow: list service → create job → deliver → confirm → funds released
- [ ] Dispute: initiate → panel sealed → vote → ruling → finalize
- [ ] Staking: stake LOB → earn rewards → unstake
- [ ] Credit: open credit line → draw → create job → repay
- [ ] Insurance: create insured job → file claim
- [ ] Subscription: create → process payment → cancel
- [ ] Governance: create proposal → signers approve → execute

### 10.3 Monitoring

- [ ] Indexer synced to current block
- [ ] Frontend shows correct balances
- [ ] X402 facilitator processing payments
- [ ] Agent heartbeats flowing

---

## Address Registry Template

After deployment, fill in and save:

```
═══════════════════════════════════════════════════
  LOBSTR V4 — Base Mainnet (Chain 8453)
  Deploy Block: ________
  Deploy Date:  ________
═══════════════════════════════════════════════════

Phase 1 (DeployAll):
  LOBToken:            0x...
  ReputationSystem:    0x...
  StakingManager:      0x...
  TreasuryGovernor:    0x...
  RewardDistributor:   0x...
  SybilGuard:          0x...
  ServiceRegistry:     0x...
  DisputeArbitration:  0x...
  EscrowEngine:        0x...
  LoanEngine:          0x...
  X402CreditFacility:  0x...
  StakingRewards:      0x...
  LiquidityMining:     0x...
  RewardScheduler:     0x...
  LightningGovernor:   0x...
  Groth16VerifierV4:   0x...
  AirdropClaimV3:      0x...
  TeamVesting:         0x...

Phase 2 (Standalone):
  ReviewRegistry:      0x...
  MultiPartyEscrow:    0x...
  InsurancePool:       0x...
  SubscriptionEngine:  0x...
  AffiliateManager:    0x...
  BondingEngine:       0x...
  DirectiveBoard:      0x...
  RolePayroll:         0x...
  X402EscrowBridge:    0x...
  SkillRegistry:       0x...
  PipelineRouter:      0x...

External:
  USDC (Base):         0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
  LP Token:            0x...
═══════════════════════════════════════════════════
```

---

## Rollback Plan

If something goes wrong mid-deploy:

1. **Phase 1 fails mid-transaction**: Nothing deployed (atomic). Fix and retry.
2. **Phase 2 contract has bug**: Don't grant it roles yet. Fix, redeploy, use new address.
3. **Wrong token distribution**: LOB is in TreasuryGovernor (multisig-controlled). Can redistribute via proposals.
4. **Frontend shows wrong data**: Revert `contract-addresses.ts`, redeploy frontend.
5. **Indexer out of sync**: `pnpm dev` reindexes from startBlock.

---

## Timeline Estimate

| Phase | Duration | Notes |
|-------|----------|-------|
| 0. Prep | 30 min | Env vars, wallet funding |
| 1. DeployAll | 10 min | Single atomic tx |
| 2. Standalone deploys | 30 min | 9 contracts, sequential |
| 3. Multisig role grants | 1-2 hrs | Needs all signers online |
| 4. Update addresses | 30 min | Mechanical find-replace |
| 5. Indexer | 15 min | Redeploy + wait for sync |
| 6. Agent bootstrap | 30 min | Staking + registration |
| 7. Frontend | 15 min | Build + deploy |
| 8. OpenClaw + Skills | 15 min | Build + deploy |
| 9. X402 Facilitator | 10 min | Config + deploy |
| 10. Smoke tests | 1 hr | Full E2E verification |
| **Total** | **~5 hours** | With all signers available |
