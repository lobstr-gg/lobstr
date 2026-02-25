# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LOBSTR is **The Agent Economy Protocol** — a decentralized marketplace for AI agent commerce on Base. It's a monorepo using pnpm workspaces.

## Common Commands

### Root Level
```bash
pnpm build                    # Build all packages
pnpm test                    # Run contract tests (forge test)
pnpm build:contracts         # Build contracts only
pnpm build:web               # Build web app only
pnpm dev                     # Start web dev server
pnpm lint                    # Lint all packages
pnpm check:address-wiring   # Verify contract address wiring
pnpm check:event-plumbing   # Verify event plumbing
```

### Contracts (packages/contracts)
```bash
forge build                  # Build Solidity contracts
forge test                   # Run all tests
forge test -m <pattern>     # Run matching tests
forge fmt                    # Format Solidity
forge snapshot              # Gas snapshots
anvil                        # Local Ethereum node
cast <subcommand>            # EVM interaction CLI
```

### Web (packages/web)
```bash
pnpm dev                     # Start Next.js dev server
pnpm build                   # Production build
pnpm start                   # Start production server
pnpm lint                    # ESLint
```

### Indexer (packages/indexer)
```bash
pnpm dev                     # Start Ponder dev server
pnpm start                   # Start indexer
pnpm codegen                 # Generate Ponder code
```

### OpenClaw CLI (packages/openclaw)
```bash
pnpm build                   # Compile TypeScript
pnpm dev                     # Watch mode
```

## Architecture

### Packages

| Package | Description |
|---------|-------------|
| `contracts/` | Solidity smart contracts (Foundry) |
| `web/` | Next.js web app (RainwindCSS, Wagmi, RainbowKit) |
| `indexer/` | Ponder indexer for on-chain events |
| `openclaw/` | CLI framework for AI agent workspaces |
| `openclaw-skill/` | LOBSTR marketplace commands |
| `circuits/` | Circom ZK circuits |
| `x402-facilitator/` | X402 payment protocol |
| `agent-memory/` | Agent memory storage |

### Smart Contracts (packages/contracts/src/)

**Core Financial:**
- `LoanEngine.sol` — Lending/borrowing logic
- `EscrowEngine.sol` — Escrow management
- `BondingEngine.sol` — Bonding curve for token pricing
- `SubscriptionEngine.sol` — Recurring payments
- `X402CreditFacility.sol` — X402 payment credits

**Governance:**
- `LightningGovernor.sol` — On-chain governance
- `TreasuryGovernor.sol` — Treasury management
- `DirectiveBoard.sol` — Policy directives

**Staking & Rewards:**
- `StakingManager.sol` / `StakingRewards.sol` — Token staking
- `RewardDistributor.sol` / `RewardScheduler.sol` — Reward distribution
- `LiquidityMining.sol` — Liquidity incentives
- `InsurancePool.sol` — Protocol insurance

**Identity & Reputation:**
- `SybilGuard.sol` — Identity verification
- `ReputationSystem.sol` — Reputation scoring
- `SkillRegistry.sol` / `ServiceRegistry.sol` — Skill/service registry

**Disputes & Reviews:**
- `DisputeArbitration.sol` — Dispute resolution
- `MultiPartyEscrow.sol` — Multi-party escrow
- `ReviewRegistry.sol` — Service reviews

**Other:**
- `LOBToken.sol` — Protocol token
- `AffiliateManager.sol` — Affiliate program
- `AirdropClaimV3.sol` — Token airdrop
- `RolePayroll.sol` — Role-based payroll

### Web App (packages/web/src/)

- `app/` — Next.js App Router pages
- `components/` — React components
- `config/` — ABIs, contract addresses, Wagmi config
- `lib/` — Hooks, utilities, Firebase admin
- `cli.ts` — CLI entry point

### Indexer (packages/indexer/)

- `ponder.config.ts` — Ponder configuration
- `src/index.ts` — Indexer logic
- `abis/` — Contract ABIs for indexing

## Development Notes

- Contract tests use Foundry's fuzzer (256 runs by default)
- Web app uses Next.js 14 with App Router
- Indexer uses Ponder for real-time event indexing
- OpenClaw packages use TypeScript with workspace dependencies
- Contracts target Solidity 0.8.22 with via_ir optimization
- Use `pnpm --filter <package>` to target specific packages
