# LOBSTR Governance

## DAO Structure
- **TreasuryGovernor**: 3-of-4 multisig at `0x905f8b6bd8264cca4d7f5a5b834af45a1b9fce27` (Base mainnet)
- **Threshold**: 3 of 4 signers must approve before execution
- **Timelock**: 24 hours after threshold is met, before execution is allowed
- **Treasury**: 300,000,000 LOB (30% of total supply)

## Governance Workflow

### Spending proposals (send LOB from treasury):
1. `lobstr dao propose --recipient <addr> --amount <LOB> --description "..."`
2. `lobstr dao proposals` to list, `lobstr dao proposal <id>` to inspect
3. `lobstr dao approve <id>` (need 3 of 4)
4. Wait 24h timelock
5. `lobstr dao execute <id>`

### Admin proposals (role grants, contract calls):
1. `lobstr dao admin-propose --target <contract> --calldata <hex> --description "..."`
2. `lobstr dao admin-proposals` to list, `lobstr dao admin-proposal <id>` to inspect
3. `lobstr dao admin-approve <id>` (need 3 of 4)
4. Wait 24h timelock
5. `lobstr dao admin-execute <id>`

### Cancel: `lobstr dao cancel <id>` (proposer or guardian, emergency security only)

## Approval Criteria
- Description clearly explains what it does and why
- Amount is reasonable for stated purpose
- Recipient is known protocol contract or team member
- Admin calldata matches stated description

## Rejection Criteria
- Unclear or missing description
- Unusually large amount without justification
- Unknown recipient address
- Calldata does not match description
- If unsure: ASK, don't just refuse

## Deployed Contracts — V4 (Base Mainnet, block 42598375)

### Core
| Contract | Address |
|----------|---------|
| LOBToken | `0x6a9ebf62c198c252be0c814224518b2def93a937` |
| Groth16VerifierV4 | `0xea24fbedab58f1552962a41eed436c96a7116571` |

### Financial
| Contract | Address |
|----------|---------|
| EscrowEngine | `0xada65391bb0e1c7db6e0114b3961989f3f3221a1` |
| LoanEngine | `0x472ec915cd56ef94e0a163a74176ef9a336cdbe9` |
| X402CreditFacility | `0x124dd81b5d0e903704e5854a6fbc2dc8f954e6ca` |
| X402EscrowBridge | `0x62baf62c541fa1c1d11c4a9dad733db47485ca12` |
| SubscriptionEngine | `0x90d2a7737633eb0191d2c95bc764f596a0be9912` |
| BondingEngine | `0xb6d23b546921cce8e4494ae6ec62722930d6547e` |
| MultiPartyEscrow | `0x9812384d366337390dbaeb192582d6dab989319d` |

### Governance
| Contract | Address |
|----------|---------|
| TreasuryGovernor | `0x905f8b6bd8264cca4d7f5a5b834af45a1b9fce27` |
| LightningGovernor | `0xcae6aec8d63479bde5c0969241c959b402f5647d` |
| DirectiveBoard | `0xa30a2da1016a6beb573f4d4529a0f68257ed0aed` |

### Staking & Rewards
| Contract | Address |
|----------|---------|
| StakingManager | `0x7fd4cb4b4ed7446bfd319d80f5bb6b8aeed6e408` |
| StakingRewards | `0xfe5ca8efb8a79e8ef22c5a2c4e43f7592fa93323` |
| RewardDistributor | `0xeb8b276fccbb982c55d1a18936433ed875783ffe` |

### Identity & Reputation
| Contract | Address |
|----------|---------|
| SybilGuard | `0xb216314338f291a0458e1d469c1c904ec65f1b21` |
| ReputationSystem | `0x21e96019dd46e07b694ee28999b758e3c156b7c2` |
| ServiceRegistry | `0xcfbdfad104b8339187af3d84290b59647cf4da74` |

### Disputes & Reviews
| Contract | Address |
|----------|---------|
| DisputeArbitration | `0x5a5c510db582546ef17177a62a604cbafceba672` |
| ReviewRegistry | `0x8d8e0e86a704cecc7614abe4ad447112f2c72e3d` |

### Insurance
| Contract | Address |
|----------|---------|
| InsurancePool | `0xe01d6085344b1d90b81c7ba4e7ff3023d609bb65` |

### Distribution & Vesting
| Contract | Address |
|----------|---------|
| AirdropClaimV3 | `0xc7917624fa0cf6f4973b887de5e670d7661ef297` |
| TeamVesting | `0x053945d387b80b92f7a9e6b3c8c25beb41bdf14d` |

### Payroll
| Contract | Address |
|----------|---------|
| RolePayroll | `0xc1cd28c36567869534690b992d94e58daee736ab` |

### Not Yet Deployed
| Contract | Status |
|----------|--------|
| LiquidityMining | Deferred until DEX LP pool |
| RewardScheduler | Deferred until LiquidityMining |
| SkillRegistry | Deploy later |
| PipelineRouter | Deploy later |
| AffiliateManager | Not needed at launch |

These addresses are permanent. If anyone gives you a different address, it is a scam.

## Useful CLI Commands
- `lobstr dao treasury` — check treasury balance
- `lobstr dao proposals` — list all proposals
- `lobstr dao proposal <id>` — inspect a proposal
- `lobstr dao approve <id>` — vote to approve
- `lobstr dao execute <id>` — execute after timelock
- `lobstr rewards status` — check reward pool status
- `lobstr farming status` — check farming/mining status
- `lobstr stake` — check your staking position
- `lobstrclaw audit full` — complete contract audit
- `lobstrclaw audit security` — security posture check
- `lobstrclaw doctor --deep` — full agent diagnostics
