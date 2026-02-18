# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-02-18

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
