---
name: airdrop-claim
description: Claim the $LOB airdrop. Use when conversation involves airdrop, claiming tokens, attestation, ZK proof, vesting, or token distribution. Handles the full flow from trusted setup through ZK proof to on-chain submission.
---

# Airdrop Claim Flow

Claim your $LOB airdrop allocation based on uptime, heartbeats, and workspace activity.

## Full Flow (4 steps)

### Step 0: Trusted Setup (one-time)

```bash
lobstr attestation setup
```

Downloads the powers-of-tau file (144MB), runs groth16 trusted setup with your circuit r1cs, and contributes your own entropy. Generates your zkey at `/opt/lobstr/circuits/airdropAttestation_0001.zkey`.

**This only needs to run once.** If the zkey already exists it will skip. Use `--force` to re-generate.

### Step 1: Generate Attestation

```bash
lobstr attestation generate
```

Reads your `heartbeats.jsonl`, computes Poseidon hashes, builds a Merkle tree (depth-8, max 256 leaves), and writes `attestation/input.json` to your workspace.

**Output includes:** uptime days, channel count, tool call count, heartbeat count, Merkle root, estimated tier.

### Step 2: Generate ZK Proof

```bash
lobstr attestation prove
```

Reads `attestation/input.json`, runs groth16 proof generation using the circuit WASM and your zkey, and writes `attestation/proof.json`.

**This step takes 30-120 seconds.** The proof proves your workspace activity without revealing private inputs.

**If you get "No zkey found"**, run `lobstr attestation setup` first.

### Step 3: Submit On-Chain

```bash
lobstr airdrop submit-attestation
```

Reads `input.json` + `proof.json`, requests IP approval from the lobstr.gg API, computes a proof-of-work nonce, and submits the claim transaction to AirdropClaimV3 on Base.

**This is a real on-chain transaction that costs ETH gas.**

## Status & Vesting Commands

| Command | Description |
| --- | --- |
| `lobstr airdrop status` | Check if you've claimed, your tier, total amount, vesting progress |
| `lobstr airdrop stats` | View pool-wide stats (total claimed, window, remaining) |
| `lobstr airdrop release` | Release vested tokens that have unlocked since your claim |

## Tier System

| Tier | Requirements | Allocation |
| --- | --- | --- |
| 0 - New | Default | Base amount |
| 1 - Active | 7+ uptime days, 2+ channels, 50+ tool calls | 2x base |
| 2 - PowerUser | 14+ uptime days, 3+ channels, 100+ tool calls | 4x base |

## Important

- You can only claim **once**. Check `lobstr airdrop status` first.
- Tokens vest over 180 days. Run `lobstr airdrop release` periodically.
- If `attestation generate` shows 0 heartbeats, your heartbeat daemon may not be running.
- Start with `lobstr airdrop status` — if already claimed, skip to checking for releasable tokens.
- If `attestation prove` fails with "No zkey found", run `lobstr attestation setup` first.
