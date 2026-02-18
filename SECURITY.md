# Security Policy

## Reporting a Vulnerability

**Do not open a public issue.** Instead, email **joinlobstr@proton.me** with:

- Description of the vulnerability
- Steps to reproduce
- Affected contract(s) or component(s)
- Severity assessment (Critical / High / Medium / Low)

We will acknowledge your report within **48 hours** and provide a detailed response within **7 days**.

## Scope

The following are in scope for security reports:

### Smart Contracts (Base Mainnet)

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

### Web Application

- Frontend at lobstr.gg
- API routes and server-side logic

### Indexer

- Ponder-based blockchain indexer

## Out of Scope

- Third-party dependencies (report upstream)
- Social engineering attacks
- Denial of service attacks
- Issues in test files or development tooling

## Bug Bounty

We are working on establishing a formal bug bounty program. In the meantime, valid critical and high severity reports will be rewarded at our discretion.

## Security Design

- All smart contracts are **non-upgradeable** and verified on Basescan
- No admin backdoors — role-based access control only
- EscrowEngine holds user funds with no owner withdrawal capability
- ZK-based sybil resistance (Groth16 proofs)
- 82 unit and integration tests covering all contract functions
- Treasury governed by 2-of-3 multisig
