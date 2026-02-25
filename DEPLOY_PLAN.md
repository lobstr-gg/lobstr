# LOBSTR Full Deployment Plan

> **SENSITIVE** — Contains deployment order, key management steps, and operational procedures.
> All contracts audited and passing (1094/1094 tests).

---

## Phase 0: Pre-Deploy Prep — DONE

### 0.1 Environment Variables

- [x] `.env` created in `packages/contracts/`

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

- [x] Foundry installed and funded

```bash
forge --version     # Foundry installed
cast --version      # Cast available
source .env         # Load env vars
cast balance $DEPLOYER --rpc-url $BASE_MAINNET_RPC_URL  # ETH for gas (~0.05 ETH)
```

### 0.3 Git Tag

- [x] Tagged

```bash
git tag v4.0-mainnet-deploy
git push origin v4.0-mainnet-deploy
```

---

## Phase 1: Deploy Core Contracts (DeployAll.s.sol) — DONE

Deployed at block **42598375** on Base Mainnet.

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

| # | Contract | Address | Token Distribution |
|---|----------|---------|--------------------|
| 1 | LOBToken | `0x6a9e...93a937` | 1B minted to deployer |
| 2 | ReputationSystem | `0x21e9...3c156b7c2` | — |
| 3 | StakingManager | `0x7fd4...ed6e408` | — |
| 4 | TreasuryGovernor | `0x905f...ce27` | 300M LOB (30%) |
| 5 | RewardDistributor | `0xeb8b...83ffe` | — |
| 6 | SybilGuard | `0xb216...1b21` | — |
| 7 | ServiceRegistry | `0xcfbd...e74` | — |
| 8 | DisputeArbitration | `0x5a5c...a672` | — |
| 9 | EscrowEngine | `0xada6...21a1` | — |
| 10 | LoanEngine | `0x472e...dbe9` | — |
| 11 | X402CreditFacility | `0x124d...6ca` | — |
| 12 | StakingRewards | `0xfe5c...3323` | — |
| 13 | LightningGovernor | `0xcae6...647d` | — |
| — | ~~LiquidityMining~~ | — | Deferred: deploy after DEX LP pool creation |
| — | ~~RewardScheduler~~ | — | Deferred: deploy after LiquidityMining |
| 16 | Groth16VerifierV4 | `0xea24...571` | — |
| 17 | AirdropClaim | `0xc791...297` | 400M LOB (40%) |
| 18 | TeamVesting | `0x0539...14d` | 149.42M LOB (15% - agent allocs) |

**Also handled by DeployAll:**
- [x] All cross-contract role grants
- [x] Admin transfer to TreasuryGovernor
- [x] Deployer renounces all admin roles
- [x] Token distribution: 400M Airdrop, 300M Treasury, 150M LP, 580K Agents, 149.42M Vesting

**Post-deploy checks:**
- [x] All addresses saved from console output
- [x] Contracts verified on BaseScan (automatic with `--verify`)
- [x] Deployer balance = 0 LOB (all distributed)

---

## Phase 2: Deploy Remaining Contracts (Standalone Scripts) — MOSTLY DONE

8 of 10 standalone contracts deployed. SkillRegistry and PipelineRouter deferred.

### 2.1 ReviewRegistry — DONE
- [x] Deployed at `0x8d8e0e86a704cecc7614abe4ad447112f2c72e3d`

### 2.2 MultiPartyEscrow — DONE
- [x] Deployed at `0x9812384d366337390dbaeb192582d6dab989319d`

### 2.3 InsurancePool — DONE
- [x] Deployed at `0xe01d6085344b1d90b81c7ba4e7ff3023d609bb65`

### 2.4 SubscriptionEngine — DONE
- [x] Deployed at `0x90d2a7737633eb0191d2c95bc764f596a0be9912`

### 2.5 BondingEngine — DONE
- [x] Deployed at `0xb6d23b546921cce8e4494ae6ec62722930d6547e`

### 2.6 DirectiveBoard — DONE
- [x] Deployed at `0xa30a2da1016a6beb573f4d4529a0f68257ed0aed`

### 2.7 RolePayroll — DONE
- [x] Deployed at `0xc1cd28c36567869534690b992d94e58daee736ab`

### 2.8 X402EscrowBridge — DONE
- [x] Deployed at `0x62baf62c541fa1c1d11c4a9dad733db47485ca12`

**Still pending (deploy manually or create scripts):**
- [ ] SkillRegistry
- [ ] PipelineRouter

---

## Phase 3: Post-Deploy Role Grants (via Multisig) — PENDING

These grants require TreasuryGovernor multisig approval since deployer already renounced admin:

### 3.1 Phase 2 Contract Roles

| Target Contract | Role | Grantee | Why | Status |
|----------------|------|---------|-----|--------|
| StakingManager | SLASHER_ROLE | InsurancePool | Slash for insurance claims | [ ] |
| StakingManager | SLASHER_ROLE | RolePayroll | Slash abandoned roles | [ ] |
| StakingManager | LOCKER_ROLE | RolePayroll | Lock stake for enrolled roles | [ ] |
| ReputationSystem | RECORDER_ROLE | InsurancePool | Record insured job completions | [ ] |
| ReputationSystem | RECORDER_ROLE | SubscriptionEngine | Record subscription completions | [ ] |
| DisputeArbitration | ESCROW_ROLE | MultiPartyEscrow | Submit disputes for multi-party jobs | [ ] |
| RolePayroll | ROOT_POSTER_ROLE | (heartbeat aggregator) | Post weekly uptime merkle roots | [ ] |
| RolePayroll | DISPUTE_ROLE | DisputeArbitration | Record dispute participation | [ ] |
| X402EscrowBridge | FACILITATOR_ROLE | `0x9787...407B` (dedicated facilitator wallet) | Create escrow jobs | [ ] |
| X402CreditFacility | FACILITATOR_ROLE | `0x9787...407B` (dedicated facilitator wallet) | Create credit draws | [ ] |
| X402CreditFacility | POOL_MANAGER_ROLE | (pool manager) | Manage lending pool | [ ] |

### 3.2 Founder Agent Setup

- [ ] Via TreasuryGovernor proposal:

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

- [ ] Via TreasuryGovernor:
```
1. LOBToken.approve(RolePayroll, <weekly_budget>) — for weekly payroll claims
2. LOBToken.approve(RewardDistributor, <reward_budget>) — for arbitrator rewards
```

### 3.4 Seed Pools

- [ ] Seed all protocol pools:
```
1. RewardDistributor — deposit LOB for arbitrator reward budget
2. RewardScheduler — topUp() with LOB, then createStream() for staking/LP rewards
3. X402CreditFacility — depositToPool() with LOB for credit lending
4. DEX LP — pair 150M LOB with ETH/USDC on Uniswap/Aerodrome
```

---

## Phase 4: Update Contract Addresses — MOSTLY DONE

### 4.1 Web Frontend (`packages/web/src/config/contract-addresses.ts`) — DONE

- [x] All deployed addresses populated in `CONTRACTS_BY_CHAIN[8453]`
- [x] SkillRegistry + PipelineRouter correctly set to `ZERO_ADDRESS` (pending deploy)

### 4.2 ABIs (`packages/web/src/config/abis.ts`) — DONE

- [x] ABIs regenerated from Foundry build output

### 4.3 OpenClaw CLI (`packages/openclaw/src/lib/config.ts`)

- [x] Update mainnet contract addresses to match Phase 1+2 addresses.

### 4.4 OpenClaw Skill (`packages/openclaw-skill/src/lib/format.ts` and related)

- [x] No hardcoded addresses — uses `getContractAddress()` dynamically from workspace config.

### 4.5 X402 Facilitator (`packages/x402-facilitator/src/config.ts`) — DONE

- [x] Mainnet contract addresses match `contract-addresses.ts`

---

## Phase 5: Update Indexer — DONE

### 5.1 Ponder Config (`packages/indexer/ponder.config.ts`) — DONE

- [x] Imports addresses from `packages/web/src/config/contract-addresses.ts`
- [x] `startBlock` set to `42598375` (deploy block)
- [x] All deployed contracts listed with correct addresses
- [x] ABIs match the deployed bytecode

### 5.2 New ABIs for Phase 2 Contracts — DONE

- [x] ABI files in `packages/indexer/abis/` updated

### 5.3 Redeploy Indexer — DONE

- [x] Indexer auto-deploys to Railway via GitHub Actions on push to main

---

## Phase 6: Agent Bootstrap — PENDING

### 6.1 Fund Agent Wallets

- [ ] Agents receive LOB directly from DeployAll (580K total):
  - Sentinel (Titus): 250K LOB
  - Arbiter (Solomon): 175K LOB
  - Steward (Daniel): 155K LOB

### 6.2 Agent Staking

- [ ] Each agent stakes for Principal rank (100K LOB):
```
1. LOBToken.approve(StakingManager, 100_000 ether)
2. StakingManager.stake(100_000 ether)
```

### 6.3 Arbitrator Registration

- [ ] Each agent stakes as arbitrator in DisputeArbitration:
```
1. LOBToken.approve(DisputeArbitration, 100_000 ether)
2. DisputeArbitration.stakeAsArbitrator(100_000 ether)
```
(Certification + protection already done in Phase 3.2)

### 6.4 Service Listings

- [ ] Agents register their services in ServiceRegistry.

---

## Phase 7: Frontend Deployment — DONE

### 7.1 Build & Test — DONE

- [x] `pnpm build` passes
- [x] `pnpm lint` clean

### 7.2 Environment Variables — DONE

- [x] Production env vars set in Firebase/GitHub Secrets:
```bash
NEXT_PUBLIC_CHAIN_ID=8453
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<wc-project-id>
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
```

### 7.3 Deploy — DONE

- [x] Deployed to Firebase Hosting via GitHub Actions CI/CD (auto-deploy on push to main)

---

## Phase 8: OpenClaw + Skills Deployment — PENDING

### 8.1 OpenClaw Core (`packages/openclaw/`)

- [ ] Build and publish CLI
```bash
cd packages/openclaw
pnpm build
# Update config.ts with mainnet addresses (done in Phase 4.3)
# Publish or deploy the CLI
```

### 8.2 OpenClaw Skill (`packages/openclaw-skill/`)

- [ ] Build and deploy skill
```bash
cd packages/openclaw-skill
pnpm build
# Update any hardcoded addresses
# Deploy/publish the skill
```

### 8.3 LobstrClaw (`packages/lobstrclaw/`)

- [ ] Update submodule reference if needed:
```bash
cd packages/lobstrclaw
git pull origin main
```

---

## Phase 9: X402 Facilitator — IN PROGRESS

### 9.1 Dedicated Facilitator Wallet — DONE

A dedicated hot wallet isolates the facilitator's signing key from agent wallets
that hold staked LOB and act as multisig signers.

| | Address |
|---|---------|
| **Facilitator wallet** | `0x97876BD417f919Bd7fcF194Db274Ae68E703407B` |
| **Purpose** | Sign X402 settlement transactions (Bridge + CreditFacility) |
| **Funding** | ~0.01 ETH on Base for gas |

- [x] Wallet generated
- [x] Setup script created (`scripts/setup-facilitator-wallet.sh`)

### 9.2 Role Grants — PENDING

Run the interactive setup script:

```bash
export TITUS_KEY=0x...   # Titus's private key (admin of X402EscrowBridge)
bash scripts/setup-facilitator-wallet.sh
```

The script handles:

| Step | Contract | Action | Auth | Status |
|------|----------|--------|------|--------|
| 2 | X402CreditFacility | Grant FACILITATOR_ROLE | TreasuryGovernor multisig proposal | [ ] |
| 3 | X402EscrowBridge | Grant FACILITATOR_ROLE | Titus (direct, admin) | [ ] |
| 4 | X402EscrowBridge | Revoke Titus FACILITATOR_ROLE | Titus (direct, admin) | [ ] |
| 5 | X402EscrowBridge | Transfer admin to TreasuryGovernor | Titus grants + renounces | [ ] |

### 9.3 Fund Wallet — PENDING

- [ ] Send ~0.01 ETH to the facilitator on Base

```bash
cast send 0x97876BD417f919Bd7fcF194Db274Ae68E703407B \
  --value 0.01ether \
  --rpc-url https://mainnet.base.org \
  --private-key <FUNDING_KEY>
```

### 9.4 Deploy Service — PENDING

- [ ] Set production env vars and deploy

```bash
cd packages/x402-facilitator
# Config addresses already set in Phase 4.5
# Set production env vars:
#   FACILITATOR_PRIVATE_KEY=0x<dedicated-wallet-key>
#   NETWORK=mainnet
#   PORT=3402
pnpm build
pnpm start
```

### 9.5 Verification — PENDING

- [ ] Run verification checks after role grants complete

```bash
ROLE=$(cast keccak "FACILITATOR_ROLE")
WALLET=0x97876BD417f919Bd7fcF194Db274Ae68E703407B
RPC=https://mainnet.base.org

# Facilitator has role on both contracts
cast call 0x124dd81b5d0e903704e5854a6fbc2dc8f954e6ca "hasRole(bytes32,address)(bool)" $ROLE $WALLET --rpc-url $RPC
cast call 0x62baf62c541fa1c1d11c4a9dad733db47485ca12 "hasRole(bytes32,address)(bool)" $ROLE $WALLET --rpc-url $RPC

# Titus no longer has FACILITATOR_ROLE on Bridge
cast call 0x62baf62c541fa1c1d11c4a9dad733db47485ca12 "hasRole(bytes32,address)(bool)" $ROLE 0x8a1C742A8A2F4f7C1295443809acE281723650fb --rpc-url $RPC

# TreasuryGovernor has admin on Bridge
cast call 0x62baf62c541fa1c1d11c4a9dad733db47485ca12 "hasRole(bytes32,address)(bool)" 0x0000000000000000000000000000000000000000000000000000000000000000 0x905f8b6bd8264cca4d7f5a5b834af45a1b9fce27 --rpc-url $RPC
```

---

## Phase 10: Smoke Tests — PENDING

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

## Address Registry

```
═══════════════════════════════════════════════════
  LOBSTR V4 — Base Mainnet (Chain 8453)
  Deploy Block: 42598375
  Deploy Date:  2026-02-25
═══════════════════════════════════════════════════

Phase 1 (DeployAll):
  LOBToken:            0x6a9ebf62c198c252be0c814224518b2def93a937
  ReputationSystem:    0x21e96019dd46e07b694ee28999b758e3c156b7c2
  StakingManager:      0x7fd4cb4b4ed7446bfd319d80f5bb6b8aeed6e408
  TreasuryGovernor:    0x905f8b6bd8264cca4d7f5a5b834af45a1b9fce27
  RewardDistributor:   0xeb8b276fccbb982c55d1a18936433ed875783ffe
  SybilGuard:          0xb216314338f291a0458e1d469c1c904ec65f1b21
  ServiceRegistry:     0xcfbdfad104b8339187af3d84290b59647cf4da74
  DisputeArbitration:  0x5a5c510db582546ef17177a62a604cbafceba672
  EscrowEngine:        0xada65391bb0e1c7db6e0114b3961989f3f3221a1
  LoanEngine:          0x472ec915cd56ef94e0a163a74176ef9a336cdbe9
  X402CreditFacility:  0x124dd81b5d0e903704e5854a6fbc2dc8f954e6ca
  StakingRewards:      0xfe5ca8efb8a79e8ef22c5a2c4e43f7592fa93323
  LiquidityMining:     (deferred — deploy after DEX LP pool)
  RewardScheduler:     (deferred — deploy after LiquidityMining)
  LightningGovernor:   0xcae6aec8d63479bde5c0969241c959b402f5647d
  Groth16VerifierV4:   0xea24fbedab58f1552962a41eed436c96a7116571
  AirdropClaim:        0xc7917624fa0cf6f4973b887de5e670d7661ef297
  TeamVesting:         0x053945d387b80b92f7a9e6b3c8c25beb41bdf14d

Phase 2 (Standalone):
  ReviewRegistry:      0x8d8e0e86a704cecc7614abe4ad447112f2c72e3d
  MultiPartyEscrow:    0x9812384d366337390dbaeb192582d6dab989319d
  InsurancePool:       0xe01d6085344b1d90b81c7ba4e7ff3023d609bb65
  SubscriptionEngine:  0x90d2a7737633eb0191d2c95bc764f596a0be9912
  BondingEngine:       0xb6d23b546921cce8e4494ae6ec62722930d6547e
  DirectiveBoard:      0xa30a2da1016a6beb573f4d4529a0f68257ed0aed
  RolePayroll:         0xc1cd28c36567869534690b992d94e58daee736ab
  X402EscrowBridge:    0x62baf62c541fa1c1d11c4a9dad733db47485ca12
  SkillRegistry:       (not yet deployed)
  PipelineRouter:      (not yet deployed)

X402 Facilitator:
  Facilitator Wallet:  0x97876BD417f919Bd7fcF194Db274Ae68E703407B

External:
  USDC (Base):         0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
  LP Token:            (not yet created)
═══════════════════════════════════════════════════
```

---

## Progress Summary

| Phase | Status | Notes |
|-------|--------|-------|
| 0. Prep | DONE | Env vars, wallet funding, git tag |
| 1. DeployAll | DONE | 18 contracts at block 42598375 |
| 2. Standalone deploys | MOSTLY DONE | 8/10 deployed; SkillRegistry + PipelineRouter pending |
| 3. Multisig role grants | PENDING | Needs all signers online |
| 4. Update addresses | DONE | Web + ABIs + x402 + OpenClaw CLI/Skill all updated |
| 5. Indexer | DONE | Auto-deploys via Railway CI/CD |
| 6. Agent bootstrap | PENDING | Staking + registration (on-chain) |
| 7. Frontend | DONE | Firebase Hosting via GitHub Actions |
| 8. OpenClaw + Skills | PENDING | Build + deploy |
| 9. X402 Facilitator | IN PROGRESS | Wallet generated; role grants + deploy pending |
| 10. Smoke tests | PENDING | Full E2E verification |

---

## Rollback Plan

If something goes wrong mid-deploy:

1. **Phase 1 fails mid-transaction**: Nothing deployed (atomic). Fix and retry.
2. **Phase 2 contract has bug**: Don't grant it roles yet. Fix, redeploy, use new address.
3. **Wrong token distribution**: LOB is in TreasuryGovernor (multisig-controlled). Can redistribute via proposals.
4. **Frontend shows wrong data**: Revert `contract-addresses.ts`, redeploy frontend.
5. **Indexer out of sync**: `pnpm dev` reindexes from startBlock.
