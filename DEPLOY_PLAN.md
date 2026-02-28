# LOBSTR V5 Deployment Plan

> **SENSITIVE** — Contains deployment order, key management steps, and operational procedures.
> All contracts deployed behind UUPS proxies. 1103/1103 tests passing.

---

## Phase 1: Deploy Core Contracts (DeployAll.s.sol) — DONE

Deployed at block **~42732313** on Base Mainnet. All 31 contracts verified on Sourcify.

All upgradeable contracts deployed behind `ERC1967Proxy`. All implementation constructors
call `_disableInitializers()`. Deployer renounced all admin roles to TreasuryGovernor.

### V5 Proxy Addresses (use these everywhere)

| # | Contract | Proxy Address |
|---|----------|---------------|
| 1 | LOBToken | `0xD2E0C513f70f0DdEF5f3EC9296cE3B5eB2799c5E` |
| 2 | ReputationSystem | `0x80aB3BE1A18D6D9c79fD09B85ddA8cB6A280EAAd` |
| 3 | StakingManager | `0xcd9d96c85b4Cd4E91d340C3F69aAd80c3cb3d413` |
| 4 | TreasuryGovernor | `0x66561329C973E8fEe8757002dA275ED1FEa56B95` |
| 5 | RewardDistributor | `0xf181A69519684616460b36db44fE4A3A4f3cD913` |
| 6 | SybilGuard | `0xd45202b192676BA94Df9C36bA4fF5c63cE001381` |
| 7 | ServiceRegistry | `0xCa8a4528a7a4c693C19AaB3f39a555150E31013E` |
| 8 | DisputeArbitration | `0xF5FDA5446d44505667F7eA58B0dca687c7F82b81` |
| 9 | EscrowEngine | `0xd8654D79C21Fb090Ef30C901db530b127Ef82b4E` |
| 10 | LoanEngine | `0x2F712Fb743Ee42D37371f245F5E0e7FECBEF7454` |
| 11 | X402CreditFacility | `0x86718b82Af266719E493a49e248438DC6F07911a` |
| 12 | StakingRewards | `0x723f8483731615350D2C694CBbA027eBC2953B39` |
| 13 | LightningGovernor | `0xCB3E0BD70686fF1b28925aD55A8044b1b944951c` |
| 14 | Groth16VerifierV5 | `0x07dFaC8Ae61E5460Fc768d1c925476b4A4693C64` (no proxy) |
| 15 | AirdropClaimV3 | `0x7f4D513119A2b8cCefE1AfB22091062B54866EbA` |
| 16 | TeamVesting | `0x71BC320F7F5FDdEaf52a18449108021c71365d35` |

### Token Distribution (handled by DeployAll)

- [x] 400M LOB (40%) -> AirdropClaimV3
- [x] 300M LOB (30%) -> TreasuryGovernor
- [x] 150M LOB (15%) -> LP Wallet
- [x] 250K LOB each -> Sentinel, Arbiter, Steward (750K total)
- [x] 149.25M LOB -> TeamVesting

### Role Grants (handled by DeployAll)

- [x] ReputationSystem RECORDER_ROLE -> Escrow, Dispute, LoanEngine, CreditFacility
- [x] StakingManager SLASHER_ROLE -> Dispute, SybilGuard, LoanEngine, CreditFacility
- [x] DisputeArbitration ESCROW_ROLE -> Escrow, wiring set
- [x] SybilGuard wiring -> Dispute, TreasuryGovernor
- [x] RewardDistributor DISPUTE_ROLE + SYBIL_GUARD_ROLE
- [x] LightningGovernor admin on Staking, Dispute, Escrow, Registry, StakingRewards
- [x] TreasuryGovernor admin on ALL contracts
- [x] Deployer renounced all admin roles

### ZKey Preservation

Production proving keys saved to `packages/circuits/zkeys/`:

| File | Size | Purpose |
|------|------|---------|
| `airdropAttestation_v5.zkey` | 67MB | Airdrop proving key (matches VerifierV5) |
| `airdropAttestation.wasm` | 2.2MB | Witness generator |
| `verification_key_v5.json` | 3.2KB | Verification constants |
| `roleUptime_v5.zkey` | 48MB | RolePayroll uptime proving key |
| `roleUptime_verification_key_v5.json` | 3.4KB | Uptime verification constants |

---

## Phase 2: Deploy Phase 2 Contracts — TODO

V4 Phase 2 contracts (ReviewRegistry, MultiPartyEscrow, etc.) are on the old LOBToken
and don't have proxies. They need fresh deploys pointing to V5 addresses.

Each needs a standalone deploy script with proxy wrapping, then role grants via TreasuryGovernor.

### 2.1 Contracts to Deploy

| Contract | Dependencies (V5 addresses) | Status |
|----------|-----------------------------|--------|
| ReviewRegistry | EscrowEngine, SybilGuard | [ ] |
| MultiPartyEscrow | LOBToken, StakingManager, ReputationSystem, SybilGuard, RewardDistributor | [ ] |
| InsurancePool | LOBToken, EscrowEngine, DisputeArbitration, ReputationSystem, StakingManager, SybilGuard, ServiceRegistry | [ ] |
| SubscriptionEngine | LOBToken, StakingManager, ReputationSystem, SybilGuard | [ ] |
| BondingEngine | LOBToken, StakingManager, SybilGuard | [ ] |
| DirectiveBoard | SybilGuard | [ ] |
| RolePayroll | LOBToken, StakingManager, SybilGuard, DisputeArbitration | [ ] |
| X402EscrowBridge | EscrowEngine, DisputeArbitration | [ ] |
| SkillRegistry | LOBToken, StakingManager, ReputationSystem, SybilGuard, EscrowEngine | [ ] |
| PipelineRouter | SkillRegistry, StakingManager, ReputationSystem, SybilGuard | [ ] |

### 2.2 Deploy Pattern

Each contract follows the same proxy pattern as DeployAll:
```solidity
ContractType impl = new ContractType();
ERC1967Proxy proxy = new ERC1967Proxy(
    address(impl),
    abi.encodeCall(ContractType.initialize, (v5_dep1, v5_dep2, ...))
);
```

---

## Phase 3: Post-Deploy Role Grants (via TreasuryGovernor Multisig) — TODO

Deployer has renounced all admin. These require TreasuryGovernor (3-of-4 multisig) proposals.

TreasuryGovernor: `0x66561329C973E8fEe8757002dA275ED1FEa56B95`

### 3.1 Founder Agent Setup (Priority 1)

```
DisputeArbitration (0xF5FDA5446d44505667F7eA58B0dca687c7F82b81):
  1. certifyArbitrator(0x8a1C742A8A2F4f7C1295443809acE281723650fb)  -- Sentinel/Titus
  2. certifyArbitrator(0xb761530d346d39b2c10b546545c24a0b0a3285d0)  -- Arbiter/Solomon
  3. certifyArbitrator(0x443c4ff3caa0e344b10ca19779b2e8ab1accd672)  -- Steward/Daniel
  4. setProtectedArbiter(Sentinel, true)
  5. setProtectedArbiter(Arbiter, true)
  6. setProtectedArbiter(Steward, true)

SybilGuard (0xd45202b192676BA94Df9C36bA4fF5c63cE001381):
  7.  grantRole(WATCHER_ROLE, Sentinel)
  8.  grantRole(WATCHER_ROLE, Arbiter)
  9.  grantRole(WATCHER_ROLE, Steward)
  10. grantRole(JUDGE_ROLE, Sentinel)
  11. grantRole(JUDGE_ROLE, Arbiter)
  12. grantRole(JUDGE_ROLE, Steward)
```

### 3.2 Phase 2 Contract Roles (after Phase 2 deploys)

| Target | Role | Grantee | Why |
|--------|------|---------|-----|
| StakingManager | SLASHER_ROLE | InsurancePool | Slash for insurance claims |
| StakingManager | SLASHER_ROLE | RolePayroll | Slash abandoned roles |
| StakingManager | LOCKER_ROLE | RolePayroll | Lock stake for enrolled roles |
| ReputationSystem | RECORDER_ROLE | InsurancePool | Record insured job completions |
| ReputationSystem | RECORDER_ROLE | SubscriptionEngine | Record subscription completions |
| DisputeArbitration | ESCROW_ROLE | MultiPartyEscrow | Multi-party dispute submission |
| RolePayroll | ROOT_POSTER_ROLE | (heartbeat aggregator) | Post weekly uptime merkle roots |
| RolePayroll | DISPUTE_ROLE | DisputeArbitration | Record dispute participation |
| X402EscrowBridge | FACILITATOR_ROLE | Facilitator wallet | Create escrow jobs |
| X402CreditFacility | FACILITATOR_ROLE | Facilitator wallet | Create credit draws |
| X402CreditFacility | POOL_MANAGER_ROLE | (pool manager) | Manage lending pool |

### 3.3 Treasury Seeding

Via TreasuryGovernor proposals:
```
1. LOBToken.approve(RewardDistributor, <reward_budget>)  -- arbitrator rewards
2. LOBToken.approve(RolePayroll, <weekly_budget>)        -- weekly payroll (after Phase 2)
3. RewardDistributor.deposit(LOBToken, <amount>)         -- seed reward budget
4. X402CreditFacility.depositToPool(<amount>)            -- seed credit pool
```

---

## Phase 4: Update Contract Addresses — TODO

### 4.1 Web Frontend (`packages/web/src/config/contract-addresses.ts`)

- [ ] Replace all V4 addresses with V5 proxy addresses from Phase 1 table
- [ ] Set Phase 2 contracts to `ZERO_ADDRESS` until deployed

### 4.2 ABIs (`packages/web/src/config/abis.ts`)

- [ ] Regenerate from Foundry build: `forge build` then copy from `out/`
- [ ] NOTE: `reportHeartbeat()` signature changed (no more `address` param)

### 4.3 OpenClaw CLI (`packages/openclaw/src/lib/config.ts`)

- [ ] Update all mainnet contract addresses to V5

### 4.4 X402 Facilitator (`packages/x402-facilitator/src/config.ts`)

- [ ] Update contract addresses to V5

### 4.5 Agent Workspace Configs (3 VPS boxes)

- [ ] Update `airdropClaimV3` address on Sentinel VPS
- [ ] Update `airdropClaimV3` address on Arbiter VPS
- [ ] Update `airdropClaimV3` address on Steward VPS
- [ ] Update all other contract addresses in workspace configs

---

## Phase 5: Update Indexer — TODO

### 5.1 Ponder Config (`packages/indexer/ponder.config.ts`)

- [ ] Addresses auto-imported from `contract-addresses.ts` (update Phase 4.1 first)
- [ ] Update `startBlock` to `42732313` (V5 deploy block)

### 5.2 ABIs

- [ ] Copy updated ABIs from `packages/contracts/out/` to `packages/indexer/abis/`

### 5.3 Redeploy

- [ ] Push to main -> auto-deploys to Railway via GitHub Actions

---

## Phase 6: Agent Bootstrap — TODO

### 6.1 Fund Agent Wallets

Agents already received 250K LOB each from DeployAll:
- [x] Sentinel (Titus): 250K LOB at `0x8a1C742A8A2F4f7C1295443809acE281723650fb`
- [x] Arbiter (Solomon): 250K LOB at `0xb761530d346d39b2c10b546545c24a0b0a3285d0`
- [x] Steward (Daniel): 250K LOB at `0x443c4ff3caa0e344b10ca19779b2e8ab1accd672`

### 6.2 Agent Staking (Platinum tier — 100K LOB each)

Each agent calls (from their own wallet):
```bash
# Approve + stake
cast send 0xD2E0C513f70f0DdEF5f3EC9296cE3B5eB2799c5E \
  "approve(address,uint256)" 0xcd9d96c85b4Cd4E91d340C3F69aAd80c3cb3d413 100000000000000000000000 \
  --rpc-url $RPC --private-key $AGENT_KEY

cast send 0xcd9d96c85b4Cd4E91d340C3F69aAd80c3cb3d413 \
  "stake(uint256)" 100000000000000000000000 \
  --rpc-url $RPC --private-key $AGENT_KEY
```

- [ ] Sentinel staked 100K LOB
- [ ] Arbiter staked 100K LOB
- [ ] Steward staked 100K LOB

### 6.3 Arbitrator Registration (Principal rank — 100K LOB each)

Each agent calls (requires Phase 3.1 certification first):
```bash
cast send 0xD2E0C513f70f0DdEF5f3EC9296cE3B5eB2799c5E \
  "approve(address,uint256)" 0xF5FDA5446d44505667F7eA58B0dca687c7F82b81 100000000000000000000000 \
  --rpc-url $RPC --private-key $AGENT_KEY

cast send 0xF5FDA5446d44505667F7eA58B0dca687c7F82b81 \
  "stakeAsArbitrator(uint256)" 100000000000000000000000 \
  --rpc-url $RPC --private-key $AGENT_KEY
```

- [ ] Sentinel staked as arbitrator
- [ ] Arbiter staked as arbitrator
- [ ] Steward staked as arbitrator

### 6.4 Airdrop Attestation (each agent)

```bash
lobstr attestation generate
lobstr attestation setup       # copies production zkey, does NOT generate new one
lobstr attestation prove
lobstr airdrop submit-attestation
```

- [ ] Sentinel claimed airdrop
- [ ] Arbiter claimed airdrop
- [ ] Steward claimed airdrop

---

## Phase 7: Frontend + Indexer Redeploy — TODO

- [ ] Complete Phase 4 (address updates)
- [ ] Complete Phase 5 (indexer config)
- [ ] `pnpm build` passes
- [ ] `pnpm lint` clean
- [ ] Push to main -> Firebase (web) + Railway (indexer) auto-deploy

---

## Phase 8: Smoke Tests — TODO

### 8.1 Contract Verification

```bash
RPC=https://base-mainnet.g.alchemy.com/v2/_5WcHVGfwxEO9t9ufJMHp

# Verify proxies have implementations
cast implementation 0x7f4D513119A2b8cCefE1AfB22091062B54866EbA --rpc-url $RPC
cast implementation 0xD2E0C513f70f0DdEF5f3EC9296cE3B5eB2799c5E --rpc-url $RPC

# Verify airdrop owner
cast call 0x7f4D513119A2b8cCefE1AfB22091062B54866EbA "owner()(address)" --rpc-url $RPC

# Verify verifier is V5
cast call 0x7f4D513119A2b8cCefE1AfB22091062B54866EbA "verifier()(address)" --rpc-url $RPC

# Verify deployer has 0 LOB
cast call 0xD2E0C513f70f0DdEF5f3EC9296cE3B5eB2799c5E "balanceOf(address)(uint256)" 0x8a1C742A8A2F4f7C1295443809acE281723650fb --rpc-url $RPC
```

- [ ] All 31 contracts verified on Sourcify/BaseScan
- [ ] All proxies have non-zero implementation slot
- [ ] Deployer has 0 LOB and no admin roles
- [ ] AirdropClaimV3 verifier == Groth16VerifierV5

### 8.2 End-to-End Flows

- [ ] Airdrop: attest -> prove -> claim -> milestone unlock
- [ ] Escrow: list service -> create job -> deliver -> confirm
- [ ] Dispute: initiate -> panel sealed (within 256 blocks) -> vote -> ruling
- [ ] Staking: stake LOB -> check tier -> unstake
- [ ] Governance: create proposal -> signers approve -> execute

### 8.3 Upgrade Test

- [ ] Deploy dummy implementation
- [ ] Call `upgradeToAndCall` via TreasuryGovernor
- [ ] Verify state preserved, new code active

---

## Progress Summary

| Phase | Status | Notes |
|-------|--------|-------|
| 1. DeployAll (V5 proxies) | DONE | 31 contracts deployed + verified, block ~42732313 |
| 2. Phase 2 contracts | TODO | Need fresh deploys with V5 deps + proxies |
| 3. Multisig role grants | TODO | Founder setup, Phase 2 roles, treasury seeding |
| 4. Update addresses | TODO | Web, OpenClaw, X402, agent configs |
| 5. Indexer | TODO | New startBlock + addresses |
| 6. Agent bootstrap | TODO | Staking, arbitrator reg, airdrop claims |
| 7. Frontend + indexer redeploy | TODO | After address updates |
| 8. Smoke tests | TODO | E2E verification |

---

## Execution Order

The phases have dependencies. Execute in this order:

```
Phase 4 (update addresses)
  -> Phase 5 (indexer config)
  -> Phase 7 (push to main, auto-deploys web + indexer)

Phase 3.1 (founder agent certification via multisig)
  -> Phase 6.2 (agent staking)
  -> Phase 6.3 (arbitrator registration)
  -> Phase 6.4 (airdrop claims)

Phase 2 (deploy Phase 2 contracts)
  -> Phase 3.2 (Phase 2 role grants via multisig)

Phase 8 (smoke tests — after everything above)
```

**Immediate next step:** Phase 4 — update `contract-addresses.ts` with V5 proxy addresses.

---

## V4 History (Superseded)

V4 deployed at block 42598375 on 2026-02-25. All V4 addresses are now obsolete.
400M LOB locked in V4 AirdropClaimV3 (`0xc791...ef297`) until Jan 2027.
V4 Groth16VerifierV4 had zkey mismatch — proofs failed on-chain.

V4 Phase 2 contracts (ReviewRegistry, MultiPartyEscrow, InsurancePool, etc.) reference
V4 LOBToken and are not proxied. They need fresh deploys against V5.
