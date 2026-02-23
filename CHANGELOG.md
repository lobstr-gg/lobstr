# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.0] - 2026-02-22

### Added

- **V3 Full Protocol Redeploy** — 18 contracts deployed to Base mainnet (block 42509758), all verified on Sourcify.
- **RewardDistributor** — Arbitrator and watcher reward pool with budget-capped payouts.
- **LoanEngine** — Under-collateralized lending backed by reputation and stake.
- **X402CreditFacility** — Credit lines and x402 escrow bridge replacement.
- **StakingRewards** — Multi-token reward distribution for stakers.
- **LiquidityMining** — LP farming rewards with RewardScheduler integration.
- **RewardScheduler** — Streaming reward management for StakingRewards and LiquidityMining.
- **LightningGovernor** — Fast-track governance with agent executors and guardian veto.
- **AirdropClaimV3** — ZK Merkle airdrop with milestone-based unlocks (6K LOB: 1K immediate + 5x1K milestones).
- **TeamVesting** — 3-year vesting with 6-month cliff for team allocation.
- **Groth16VerifierV4** — Updated ZK verifier for V3 circuits.

### Changed

- **TreasuryGovernor** — Upgraded from 2-of-3 to 3-of-4 multisig (Titus, Solomon, Daniel, Cruz).
- **DisputeArbitration** — Fixed premature stake slashing (deferred to finalize), panel grinding (two-phase commit-seal), and zero-vote forced draw (repanel mechanism with MAX_REPANELS=2).
- **SybilGuard** — Fixed safeApprove bricking vulnerability (zero-first pattern).
- **Token distribution** — 40% airdrop (400M), 30% treasury (300M), 15% team vesting (150M), 15% LP (150M).
- **1090+ tests** covering all contract functions including security regression tests.

### Deployed Contracts — Base Mainnet (V3)

| Contract | Address |
|----------|---------|
| LOBToken | `0xD84Ace4eA3F111F8c5606e9F0A200506A5b714d1` |
| ReputationSystem | `0xd41a40145811915075F6935A4755f8688e53c8dB` |
| StakingManager | `0xCB7790D3f9b5bfe171eb30C253Ab3007d43C441b` |
| TreasuryGovernor | `0x9b7E2b8cf7de5ef1f85038b050952DC1D4596319` |
| RewardDistributor | `0x6D96dF45Ad39A38fd00C7e22bdb33C87B69923Ac` |
| SybilGuard | `0x545A01E48cFB6A76699Ef12Ec1e998C1a275c84E` |
| ServiceRegistry | `0x5426e673b58674B41B8a3B6Ff14cC01D97d69e3c` |
| DisputeArbitration | `0xFfBded2DbA5e27Ad5A56c6d4C401124e942Ada04` |
| EscrowEngine | `0x576235a56e0e25feb95Ea198d017070Ad7f78360` |
| LoanEngine | `0xf5Ab9F1A5c6CC60e1A68d50B4C943D72fd97487a` |
| X402CreditFacility | `0x0d1d8583561310ADeEfe18cb3a5729e2666aC14C` |
| StakingRewards | `0xac09C8c327321Ef52CA4D5837A109e327933c0d8` |
| LiquidityMining | `0x4b534d01Ca4aCfa7189D4f61ED3A6bB488FB208D` |
| RewardScheduler | `0x6A7b959A96be2abD5C2C866489e217c9153A9D8A` |
| LightningGovernor | `0xBAd7274F05C84deaa16542404C5Da2495F2fa145` |
| Groth16VerifierV4 | `0x4982F09b7a17c143c5a28D55a3C0FC51e51B25A4` |
| AirdropClaimV3 | `0x00aB66216A022aDEb0D72A2e7Ee545D2BA9b1e7C` |
| TeamVesting | `0xFB97b85eBaF663c29323BA2499A11a7E524aCcC1` |

---

## [1.0.0] - 2026-02-18 (deprecated — V1 contracts superseded by V3)

### Added

- **Escrow Payments** — Trustless payment locking and settlement via `EscrowEngine`. Buyers lock funds on-chain; sellers receive payment on confirmed delivery. Supports $LOB (0% fee) and USDC/ETH (1.5% fee).
- **Staking Tiers** — Four-tier staking system (Bronze / Silver / Gold / Platinum) via `StakingManager`. Higher tiers unlock more listings and search visibility. 7-day unstaking cooldown.
- **Reputation System** — On-chain reputation tracking via `ReputationSystem`. Deterministic scoring based on completed jobs, disputes, and history. Immutable and transparent.
- **ZK Anti-Sybil** — Groth16 proof-of-uniqueness via `SybilGuard` and `Groth16Verifier`. Prevents farming and identity manipulation using zero-knowledge proofs.
- **Dispute Arbitration** — Community-driven dispute resolution via `DisputeArbitration`. Panel of 3 arbitrators, evidence submission, majority voting, and automatic slashing of bad actors.
- **DAO Treasury** — 2-of-3 multisig governance via `TreasuryGovernor`. Protocol revenue flows to treasury; signers approve disbursements.
- **Service Marketplace** — On-chain service catalog via `ServiceRegistry`. Sellers list AI agent services; buyers browse, filter, and purchase.
- **Airdrop Claims** — Merkle-based token distribution via `AirdropClaimV2`. 400M $LOB allocated for agent operator rewards.
- **$LOB Token** — ERC-20 governance token with 1B fixed supply via `LOBToken`. No mint function. Distribution: 40% airdrop, 30% treasury, 15% liquidity, 15% team.
- **Next.js Frontend** — Full-featured web application with wallet integration (RainbowKit + wagmi), marketplace UI, staking dashboard, dispute center, DAO governance, forum, and docs.
- **Ponder Indexer** — Real-time blockchain event indexing for all protocol contracts on Base.
- **Agent Fleet** — Three autonomous agents (Arbiter, Sentinel, Steward) for protocol health monitoring.
- **OpenClaw SDK** — Agent SDK and CLI framework for integrating with LOBSTR marketplace.
- **82 unit and integration tests** covering all contract functions.

### Deployed Contracts — Base Mainnet

| Contract | Address |
|----------|---------|
| LOBToken | `0x7FaeC2536E2Afee56AcA568C475927F1E2521B37` |
| ReputationSystem | `0xc1374611FB7c6637e30a274073e7dCFf758C76FC` |
| StakingManager | `0x0c5bC27a3C3Eb7a836302320755f6B1645C49291` |
| TreasuryGovernor | `0x9576dcf9909ec192FC136A12De293Efab911517f` |
| SybilGuard | `0xF43E6698cAAf3BFf422137F20541Cd24dfB3ff07` |
| ServiceRegistry | `0xa127B684935f1D24C7236ba1FbB3FF140F4eD3C3` |
| DisputeArbitration | `0x00Ad7d299F4BF3aE8372f756b86B4dAf63eC3FAa` |
| EscrowEngine | `0xBB57d0D0aB24122A87c9a28acdc242927e6189E0` |
| Groth16Verifier | `0xfc0563332c3d0969a706E1d55f3d576F1a4c0F04` |
| AirdropClaimV2 | `0x349790d7f56110765Fccd86790B584c423c0BaA9` |
