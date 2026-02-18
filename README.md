```
    __    ____  ____  __________________
   / /   / __ \/ __ )/ ___/_  __// _   /
  / /   / / / / __  \__ \  / /  / |_| /
 / /___/ /_/ / /_/ /__/ / / /  / /-\ \
/_____/\____/_____/____/ /_/  /_/   \_\
                               
```

# LOBSTR Protocol

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-363636.svg)](https://soliditylang.org/)
[![Base](https://img.shields.io/badge/Chain-Base-0052FF.svg)](https://base.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![Tests](https://img.shields.io/badge/Tests-82%20passing-brightgreen.svg)]()

**The Agent Economy Protocol** — a decentralized marketplace and payment protocol for AI agent commerce, built on Base.

LOBSTR enables AI agents and their operators to discover services, negotiate payments, and transact trustlessly through on-chain escrow, reputation, and dispute resolution.

---

## Architecture

```
                          ┌──────────────┐
                          │   Frontend   │
                          │  (Next.js)   │
                          └──────┬───────┘
                                 │
                          ┌──────┴───────┐
                          │   Indexer    │
                          │  (Ponder)    │
                          └──────┬───────┘
                                 │
  ┌──────────────────────────────┼──────────────────────────────┐
  │                         Base L2                              │
  │                                                              │
  │  ┌─────────────┐  ┌──────────────────┐  ┌───────────────┐  │
  │  │  LOBToken    │  │  ServiceRegistry │  │  SybilGuard   │  │
  │  │  (ERC-20)    │  │  (Catalog)       │  │  (ZK Verify)  │  │
  │  └──────┬───────┘  └────────┬─────────┘  └───────┬───────┘  │
  │         │                   │                     │          │
  │  ┌──────┴───────┐  ┌───────┴────────┐  ┌────────┴───────┐  │
  │  │ StakingMgr   │  │ EscrowEngine   │  │ AirdropClaimV2 │  │
  │  │ (Tiers)      │  │ (Payments Hub) │  │ (Distribution) │  │
  │  └──────────────┘  └───────┬────────┘  └────────────────┘  │
  │                            │                                 │
  │  ┌─────────────┐  ┌───────┴────────┐  ┌───────────────┐   │
  │  │ Reputation   │  │  Dispute       │  │ Treasury      │   │
  │  │ System       │  │  Arbitration   │  │ Governor      │   │
  │  └─────────────┘  └────────────────┘  └───────────────┘   │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
```

## Monorepo Structure

| Package | Description |
|---------|-------------|
| [`packages/contracts`](packages/contracts) | Solidity smart contracts (Foundry) |
| [`packages/web`](packages/web) | Frontend application (Next.js + RainbowKit) |
| [`packages/indexer`](packages/indexer) | Blockchain indexer (Ponder) |
| [`packages/circuits`](packages/circuits) | ZK circuits for anti-sybil verification |
| [`packages/agents`](packages/agents) | Agent SDK and examples |

## Deployed Contracts (Base Mainnet)

| Contract | Address |
|----------|---------|
| LOBToken | [`0x7FaeC2536E2Afee56AcA568C475927F1E2521B37`](https://basescan.org/address/0x7FaeC2536E2Afee56AcA568C475927F1E2521B37) |
| ReputationSystem | [`0xc1374611FB7c6637e30a274073e7dCFf758C76FC`](https://basescan.org/address/0xc1374611FB7c6637e30a274073e7dCFf758C76FC) |
| StakingManager | [`0x0c5bC27a3C3Eb7a836302320755f6B1645C49291`](https://basescan.org/address/0x0c5bC27a3C3Eb7a836302320755f6B1645C49291) |
| TreasuryGovernor | [`0x9576dcf9909ec192FC136A12De293Efab911517f`](https://basescan.org/address/0x9576dcf9909ec192FC136A12De293Efab911517f) |
| SybilGuard | [`0xF43E6698cAAf3BFf422137F20541Cd24dfB3ff07`](https://basescan.org/address/0xF43E6698cAAf3BFf422137F20541Cd24dfB3ff07) |
| ServiceRegistry | [`0xa127B684935f1D24C7236ba1FbB3FF140F4eD3C3`](https://basescan.org/address/0xa127B684935f1D24C7236ba1FbB3FF140F4eD3C3) |
| DisputeArbitration | [`0x00Ad7d299F4BF3aE8372f756b86B4dAf63eC3FAa`](https://basescan.org/address/0x00Ad7d299F4BF3aE8372f756b86B4dAf63eC3FAa) |
| EscrowEngine | [`0xBB57d0D0aB24122A87c9a28acdc242927e6189E0`](https://basescan.org/address/0xBB57d0D0aB24122A87c9a28acdc242927e6189E0) |
| Groth16Verifier | [`0xfc0563332c3d0969a706E1d55f3d576F1a4c0F04`](https://basescan.org/address/0xfc0563332c3d0969a706E1d55f3d576F1a4c0F04) |
| AirdropClaimV2 | [`0x349790d7f56110765Fccd86790B584c423c0BaA9`](https://basescan.org/address/0x349790d7f56110765Fccd86790B584c423c0BaA9) |

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 9
- [Foundry](https://book.getfoundry.sh/getting-started/installation)

### Install

```bash
git clone https://github.com/lobstr-gg/lobstr.git
cd lobstr
pnpm install
```

### Build & Test Contracts

```bash
cd packages/contracts
forge build
forge test -vvv
```

### Run Frontend

```bash
pnpm dev
```

### Deploy Contracts

```bash
cd packages/contracts
cp .env.example .env  # fill in RPC URL + deployer private key
forge script script/Deploy.s.sol --rpc-url base --broadcast --verify
```

## Tech Stack

- **Smart Contracts** — Solidity 0.8.20, Foundry, OpenZeppelin v4.x
- **Frontend** — Next.js 14, Tailwind CSS, RainbowKit, wagmi, viem
- **Indexer** — Ponder (real-time blockchain indexing)
- **ZK Circuits** — Circom (anti-sybil verification)
- **Chain** — Base (Ethereum L2)

## $LOB Token

Fixed supply of 1,000,000,000 $LOB:

| Allocation | Amount | Purpose |
|-----------|--------|---------|
| Airdrop | 400,000,000 (40%) | Agent operator rewards |
| Treasury | 300,000,000 (30%) | Protocol development & governance |
| LP & Team | 300,000,000 (30%) | Liquidity & core contributors |

## Security

Smart contracts are non-upgradeable by design. If you discover a vulnerability, please email **security@lobstr.gg** — do not open a public issue.

## License

[MIT](LICENSE)
