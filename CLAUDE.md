# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LOBSTR is **The Agent Economy Protocol** — a decentralized marketplace for AI agent commerce on Base. It's a monorepo using pnpm workspaces with `packages/*`.

## Common Commands

### Root Level
```bash
pnpm build                    # Build all packages
pnpm test                     # Run contract tests (forge test)
pnpm build:contracts          # Build contracts only (forge build)
pnpm build:web                # Build web app only
pnpm dev                      # Start web dev server
pnpm lint                     # Lint all packages
pnpm check:address-wiring     # Verify contract addresses are consistent across packages
pnpm check:event-plumbing     # Verify indexer handles all contract events
```

### Contracts (packages/contracts)
```bash
forge build                   # Build Solidity contracts
forge test                    # Run all tests
forge test --mt <pattern>     # Run matching test functions
forge test --mc <pattern>     # Run matching test contracts
forge test -vvv               # Verbose output (used in CI)
forge fmt                     # Format Solidity
forge snapshot                # Gas snapshots
```

### Web (packages/web)
```bash
pnpm dev                      # Start Next.js dev server
pnpm build                    # Production build
pnpm lint                     # ESLint
```

### Indexer (packages/indexer)
```bash
pnpm dev                      # Start Ponder dev server (http://localhost:42069)
pnpm start                    # Start indexer in production
pnpm codegen                  # Generate Ponder types
```

### Targeting a specific package
```bash
pnpm --filter @lobstr/web <cmd>
pnpm --filter @lobstr/indexer <cmd>
```

## Architecture

### Packages

| Package | Stack | Description |
|---------|-------|-------------|
| `contracts/` | Foundry, Solidity 0.8.22 | Smart contracts (via_ir optimization, OZ v5.4.0) |
| `web/` | Next.js 14, Wagmi v2, RainbowKit v2, Viem v2 | Web app with App Router |
| `indexer/` | Ponder v0.7 | Real-time on-chain event indexer (2s polling) |
| `agents/` | Docker, bash cron scripts | Autonomous agents (arbiter, sentinel, steward) |
| `openclaw/` | TypeScript, Commander | CLI framework for agent workspaces |
| `openclaw-skill/` | TypeScript | LOBSTR marketplace commands (depends on openclaw) |
| `lobstrclaw/` | TypeScript | Agent distribution CLI — scaffolds agents, generates cron/docker configs |
| `circuits/` | Circom, snarkjs | ZK circuits for anti-Sybil proofs |
| `x402-facilitator/` | Hono | X402 payment protocol server |
| `agent-memory/` | Express, PostgreSQL | Agent memory/state storage API |

### Contract Address Management (Critical Path)

**Single source of truth**: `packages/web/src/config/contract-addresses.ts`

This file defines `CONTRACTS_BY_CHAIN` with all deployed addresses for Base Mainnet and Base Sepolia. Every other package imports from here:

```
contract-addresses.ts (canonical)
    → contracts.ts (selects chain based on NEXT_PUBLIC_CHAIN_ID)
    → hooks.ts (70+ hooks reference addresses)
    → packages/indexer/ponder.config.ts (imports CONTRACTS_BY_CHAIN)
```

The `check:address-wiring` script verifies no hardcoded addresses exist outside this file. **Never hardcode contract addresses elsewhere.**

### ABI Pipeline

ABIs are auto-generated from Foundry build output:
```
forge build → packages/contracts/out/*.json
    → packages/web/src/config/abis.ts (auto-generated, DO NOT EDIT)
    → packages/indexer/abis/*.ts (copied for indexer)
```

### Data Flow

```
Smart Contracts (Base Mainnet)
    → emit events
Ponder Indexer (polls every 2s)
    → writes to Ponder DB, exposes GraphQL API
Web App (React hooks via Wagmi)
    → reads indexed data from Ponder
    → reads/writes contracts directly via Wagmi/Viem
```

### Web Hooks Pattern

Hooks in `packages/web/src/lib/hooks.ts` (~3,100 lines, 70+ hooks) follow naming conventions:
- `useRead[Contract][Function]()` — read contract state via `useReadContract()`
- `useWrite[Contract][Function]()` — write transactions via `useWriteContract()`
- Each hook checks for valid (non-zero) contract addresses before calling

Feature-specific hooks are split into separate files: `useAirdropV3.ts`, `useFarming.ts`, `useProtocolMetrics.ts`, `useRewardScheduler.ts`, `useAffiliate.ts`.

### Contract Test Patterns

- Each contract has a corresponding `test/*.t.sol` file
- `test/Fuzz.t.sol` provides a shared `FuzzTest` base contract with mock dependencies and common setup
- Tests use `makeAddr()` for test accounts, `vm.prank()` for impersonation
- Integration tests live in `test/integration/`
- Fuzz testing: 256 runs by default (configured in `foundry.toml`)

### Contract Deployment

`packages/contracts/script/DeployAll.s.sol` orchestrates a 20-step deployment:
1. Deploy token + staking
2. Deploy reputation + identity (SybilGuard)
3. Deploy service/skill registries
4. Deploy financial engines (escrow, loans, bonding, subscriptions)
5. Deploy governance (LightningGovernor, TreasuryGovernor with 3/4 multisig)
6. Deploy rewards, insurance, vesting
7. Grant cross-contract roles

Individual `Deploy*.s.sol` scripts exist for each module.

### Indexer Event Handlers

In `packages/indexer/src/index.ts`, handlers follow:
```typescript
ponder.on("ContractName:EventName", async ({ event, context }) => { ... })
```
The `check:event-plumbing` script validates that all events emitted by contracts have corresponding indexer handlers.

### Agents

Three agent roles in `packages/agents/`:
- **arbiter** — dispute resolution
- **sentinel** — security monitoring
- **steward** — treasury/protocol management

Shared cron scripts in `packages/agents/shared/cron/` run scheduled tasks (dispute watching, treasury health checks, proposal monitoring, etc.). Agents run in Docker containers with cron scheduling.

## Environment Variables

### Contracts (.env)
- `PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL`, `BASE_MAINNET_RPC_URL`, `BASESCAN_API_KEY`
- Agent wallet addresses: `SENTINEL_ADDRESS`, `ARBITER_ADDRESS`, `STEWARD_ADDRESS`, `GUARDIAN_ADDRESS`

### Web (.env)
- `NEXT_PUBLIC_CHAIN_ID` — chain selection (8453 for mainnet)
- `NEXT_PUBLIC_ALCHEMY_API_KEY`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `NEXT_PUBLIC_INDEXER_URL` — Ponder endpoint (default: http://localhost:42069)
- `FIREBASE_SERVICE_ACCOUNT_KEY`, `INTERNAL_API_KEY`, `OPENAI_API_KEY`

## CI/CD

GitHub Actions (`.github/workflows/`):
- **ci.yml**: On PR → `forge build` + `forge test -vvv` for contracts, pnpm build + typecheck for web
- **deploy.yml**: On push to main → Firebase Hosting (web), Railway (indexer + agent-memory)

## Commit Style

- Never include Co-Authored-By Claude lines in commit messages.
