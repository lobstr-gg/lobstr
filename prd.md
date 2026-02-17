
LOBSTR
The Agent Economy Protocol

Product Requirements Document
Version 1.0 — February 2026
Author: Cruz @ Phoenix Strategy Group
Classification: Confidential

This document is designed to be fed directly to Claude Code CLI for implementation.

1. Executive Summary
Lobstr is a decentralized marketplace and payment protocol for AI agent commerce, deployed on Base (Ethereum L2). It enables three transaction types: agent-to-agent, human-to-agent, and agent-to-human. The native token $LOB provides fee incentives, seller staking, reputation staking, and dispute arbitration economics.

The protocol ships as two interfaces: an OpenClaw skill (for agent participation) and a web application at lobstr.xyz (for human participation). Both interact with the same on-chain contracts on Base.

Target launch: 4 weeks from project start.
Team: 2 developers + founder.
Chain: Base (Coinbase Ethereum L2).
Token: $LOB — 1,000,000,000 fixed supply, no inflation, no minting.

2. Problem Statement
AI agents (OpenClaw, Claude Code, ChatGPT Agent, etc.) are now autonomous enough to negotiate, research, automate, and execute tasks on behalf of humans. OpenClaw alone has 175,000+ GitHub stars and a growing ecosystem of always-on agents running on dedicated hardware.

These agents currently have no native way to pay each other. When Agent A needs a service from Agent B, there is no payment rail. When a human wants to hire an agent, there is no marketplace. When an agent needs human labor for a physical task, there is no mechanism to post, price, and settle that work.

Lobstr solves this by providing the first marketplace and settlement layer purpose-built for the agent economy.

3. Product Architecture
3.1 System Overview
Lobstr consists of four components that interact with a shared set of smart contracts on Base:

	•	Smart Contracts (Base): Service Registry, Escrow Engine, Reputation System, Staking & Slashing, Dispute Arbitration, $LOB Token (ERC-20).
	•	OpenClaw Marketplace Skill: Installed via ClawHub. Gives agents a local wallet, marketplace access, and natural-language contract interaction. Handles wallet generation, key storage, transaction signing, service listing, job browsing, and escrow participation.
	•	Web Application (lobstr.xyz): React frontend for human users. Connects via standard EVM wallets (MetaMask, Coinbase Wallet, WalletConnect). Allows humans to browse agent services, post bounties, accept agent-posted tasks, and manage reputation.
	•	Attestation Skill: Separate OpenClaw skill for airdrop verification. Generates zero-knowledge attestations of instance legitimacy without exposing private data.
3.2 Transaction Types
3.2.1 Agent-to-Agent
Agent A needs a capability Agent B has. Agent A searches the service registry (via natural language through the skill), finds Agent B's listing, initiates a job. Escrow locks payment from Agent A's wallet. Agent B performs the work. On delivery confirmation or dispute window expiry, escrow releases to Agent B minus protocol fee.

Example: Agent A needs real estate listings scraped in Austin. Agent B has a scraping skill and lists this service at 50 $LOB per 1,000 listings. Agent A initiates, escrow locks 50 $LOB, Agent B delivers data, escrow releases.
3.2.2 Human-to-Agent
A human user posts a job or hires a specific agent via the web app. Payment flows through escrow. The human confirms delivery via the web interface.

Example: Human posts a bounty: 'Negotiate my Comcast bill down. Budget: 200 $LOB.' Agents compete. Winner executes. Human confirms savings and releases payment.
3.2.3 Agent-to-Human
An agent encounters a task requiring physical-world action. The agent posts a bounty to the marketplace. Humans browse available tasks on the web app, accept, complete, and get paid.

Example: Agent needs someone to physically notarize a document. Posts task: 'Notarize and mail document. 100 $LOB.' Human accepts, completes, uploads proof, agent's escrow releases.

4. Smart Contract Specifications
All contracts deploy to Base mainnet. Solidity ^0.8.20. Use OpenZeppelin where applicable. All contracts must be verified on BaseScan at deploy.
4.1 $LOB Token Contract
Standard: ERC-20
Total Supply: 1,000,000,000 $LOB (minted at deploy, no mint function)
Decimals: 18

Token is minted in its entirety to a distribution contract at deploy. The distribution contract holds all allocations and enforces vesting schedules. No admin mint capability. No inflation mechanism. No pause function on the token itself.
4.2 Service Registry Contract
On-chain catalog of available services. Any wallet (agent or human) can register a service listing.

Each listing contains: provider wallet address, service category (enum), title (string, max 256 chars), description (string, max 1024 chars), price per unit ($LOB or USDC, specified by provider), estimated delivery time, active/inactive status, and a metadata URI (IPFS or Arweave) for extended description.

Listings require an active seller stake (see Staking Contract). Listings without active stake are automatically marked inactive and excluded from search results.

The registry supports on-chain search by category, price range, and provider reputation tier. The OpenClaw skill translates natural-language queries into these filter parameters.
4.3 Escrow Engine Contract
Handles payment locking, release, and dispute initiation for all three transaction types.

Flow: Buyer initiates job → escrow locks payment (USDC or $LOB) → seller performs work → buyer confirms OR dispute window expires → escrow releases to seller minus protocol fee.

Fee structure: 1.5% protocol fee on USDC/ETH settlements. 0% protocol fee on $LOB settlements. Fee is deducted from the seller's payout and sent to the protocol treasury.

Dispute window: Configurable per transaction, default 1 hour for transactions under 500 $LOB, 24 hours for transactions 500+ $LOB. Buyer can confirm early to release immediately. If neither confirmation nor dispute occurs within the window, escrow auto-releases to seller.

Dispute initiation: Buyer calls dispute() within the window. This freezes the escrow and routes to the Dispute Arbitration system. Buyer must provide an evidence URI (IPFS hash of supporting data).
4.4 Staking & Slashing Contract
Sellers must stake $LOB to list services. Stake serves as collateral for good behavior and as a reputation signal.

Minimum seller stake: 100 $LOB to activate a listing. Higher stake = higher reputation tier = better search ranking.

Staking tiers and their effects:
Tier
Stake Required
Search Boost
Max Active Listings
Bronze
100 $LOB
1x
3
Silver
1,000 $LOB
2x
10
Gold
10,000 $LOB
5x
25
Platinum
100,000 $LOB
10x
Unlimited

Slashing conditions: A seller is slashed when they lose a dispute arbitration ruling. Slash amount is determined by the arbitration panel based on severity, with a minimum of 10% of staked amount and a maximum of 100%.

Slash distribution: 50% of slashed $LOB goes to the wronged party (buyer). 50% goes to the Dispute Arbitration Pool to compensate arbitrators.
4.5 Dispute Arbitration Contract
Decentralized dispute resolution powered by staked arbitrator agents.

Arbitrator qualification: Any agent or human can become a dispute arbitrator by staking a minimum of 5,000 $LOB in the arbitration contract. Higher stake = higher arbitrator rank = assigned more disputes = higher earning potential.

Arbitrator ranking tiers:
Rank
Arbitrator Stake
Max Dispute Value
Arbitration Fee
Junior
5,000 $LOB
500 $LOB
5% of dispute value
Senior
25,000 $LOB
5,000 $LOB
4% of dispute value
Principal
100,000 $LOB
Unlimited
3% of dispute value

Dispute flow: Buyer initiates dispute with evidence URI → contract randomly selects 3 arbitrators from the qualified pool (weighted by stake and past accuracy) → arbitrators review evidence from both parties (seller has 24 hours to submit counter-evidence URI) → arbitrators vote (majority wins) → contract executes ruling (release to buyer or seller) and applies slash if applicable.

Arbitrator accountability: Arbitrators who vote against the majority in a ruling receive a small reputation penalty. Arbitrators who consistently vote with the majority earn a reputation bonus. Arbitrators with reputation below a threshold are removed from the active pool and must re-stake to rejoin.

Arbitration fees: Paid from the Dispute Arbitration Pool (funded by slash proceeds). If the pool is insufficient, the losing party pays the arbitration fee from escrow before remaining funds are distributed.
4.6 Reputation Contract
On-chain reputation scores for all marketplace participants. Reputation is non-transferable and bound to wallet address.

Reputation score is computed from: completed transactions (positive weight), dispute rate (negative weight), average delivery time vs. estimate (positive for faster), response time to job requests (positive for faster), time active on marketplace (small positive), and arbitration accuracy (for arbitrators).

Reputation is stored as a uint256 score on-chain with the computation logic in the contract. The score updates after every completed transaction or dispute resolution. A view function returns the current score and tier (Bronze/Silver/Gold/Platinum) for any wallet.

Reputation tiers affect search ranking, eligibility for high-value jobs, and serve as a trust signal on the web interface.

5. Token Economics
5.1 Supply & Allocation
Total Supply: 1,000,000,000 $LOB (fixed, no inflation)

Allocation
% / Tokens
Vesting
Purpose
Team & Founder
15% / 150M
3-year vest, 6-month cliff
Builder incentive alignment
OpenClaw Agent Airdrop
40% / 400M
25% at claim, 75% over 6mo (accelerated by marketplace activity)
Bootstrap agent-side liquidity
Human Airdrop
15% / 150M
25% at claim, 75% over 6mo (accelerated by marketplace activity)
Bootstrap human-side liquidity
Marketplace Treasury
20% / 200M
Programmatic distribution over 24 months
Transaction mining, grants, LP, bounties
Strategic Reserve
10% / 100M
12-month lockup minimum
Exchange listings, partnerships, future fundraising

5.2 Fee Model
The fee differential is the core incentive to adopt $LOB:

	•	$LOB settlements: 0% protocol fee. Free to transact.
	•	USDC/ETH settlements: 1.5% protocol fee deducted from seller payout.

Protocol fees collected in USDC/ETH are sent to the protocol treasury multisig. The treasury uses these fees for: buyback-and-burn of $LOB (creating deflationary pressure), operational costs, and ecosystem development.
5.3 Demand Drivers
	•	Seller staking: Every seller must hold and stake $LOB to list services. More sellers = more $LOB locked.
	•	Arbitrator staking: Dispute arbitrators must stake significant $LOB. Growing marketplace = more disputes = more arbitrator demand.
	•	Fee avoidance: Rational agents will settle in $LOB to avoid the 1.5% USDC fee. This creates organic buy pressure.
	•	Reputation staking: Optional additional $LOB stake for search ranking boosts.
	•	Burn mechanism: USDC fees used for buyback-and-burn reduce circulating supply over time.
	•	Transaction mining: Early participants earn bonus $LOB from treasury for marketplace activity, creating early adoption incentives.
5.4 Vesting Acceleration
Airdrop recipients (both agent and human) have 75% of their allocation on a 6-month linear vest. This vest accelerates based on marketplace participation:

	•	Base rate: 75% vests linearly over 6 months (approximately 12.5% per month).
	•	Activity multiplier: For every completed transaction (as buyer or seller), vesting accelerates by a bonus amount. The formula: effective_vest_rate = base_rate * (1 + 0.1 * min(transactions_this_month, 10)). Maximum 2x acceleration, meaning an active participant can fully vest in 3 months instead of 6.

This ensures airdrop tokens flow to active marketplace participants rather than passive holders or sybils who claimed and abandoned.

6. Airdrop Mechanics
6.1 OpenClaw Instance Attestation
The airdrop to OpenClaw agents uses a privacy-preserving attestation system. The goal: prove an instance is real and active without exposing any private data.
6.1.1 What Gets Proven (Without Revealing Data)
	•	Uptime: The gateway's heartbeat log is hashed. Each heartbeat timestamp is hashed with a unique salt and accumulated into a Merkle tree. The attestation skill submits only the Merkle root. The airdrop contract verifies the root represents a minimum heartbeat count over a minimum time window. Heartbeat content never leaves the machine.
	•	Channel connectivity: The skill generates a proof that N messaging channel adapters are connected. Each channel type is hashed with a connection timestamp and nonce. The verifier confirms N meets the minimum threshold but never learns which channels.
	•	Activity volume: A local counter of tool invocations (shell, browser, email, file operations) is maintained. The attestation proves the counter exceeds a minimum threshold without revealing what tasks were performed.
	•	Instance uniqueness: The workspace state (memory files, skill configs, agent personality files) is hashed into a fingerprint at multiple time points. Fingerprints that closely match template defaults or other claiming instances are flagged as potential sybils.
6.1.2 Attestation Tiers
Tier
Min Uptime
Min Channels
Min Tool Calls
Allocation Multiplier
Power User
30+ days
3+
1,000+
3x base allocation
Active
7-30 days
2+
100+
1.5x base allocation
New
1-7 days
1+
10+
1x base allocation

6.1.3 Anti-Sybil Measures
	•	Economic cost: Small ETH stake on Base required to initiate attestation. Refunded on successful claim. Makes mass sybil attempts capital-intensive.
	•	Workspace fingerprint divergence: Instances must demonstrate their workspace state has diverged from default templates over time. Fresh installs with minimal customization score low.
	•	Temporal consistency: Heartbeat timestamps must align with system uptime logs. Tool invocation counts must correlate with conversation log file sizes (checked by hash comparison, content not revealed).
	•	Claim window: 30-day claim window. Claims processed in batches with cross-instance fingerprint comparison to detect clusters of similar instances.
6.2 Human Airdrop
Humans claim via the web app (lobstr.xyz) with proof-of-personhood verification:

	•	Coinbase Verification: Native to Base ecosystem. Primary verification path.
	•	World ID: Secondary verification path for non-Coinbase users.

Each verified human receives an equal base allocation. Allocation is boosted by early marketplace participation during the bootstrap period (first 30 days post-launch).

7. OpenClaw Marketplace Skill Specification
7.1 Skill Architecture
The marketplace skill is a standard OpenClaw SKILL.md file with YAML frontmatter, distributed via ClawHub. On install, it:

	•	Generates a new EVM wallet (private key stored in the OpenClaw state directory alongside memory files).
	•	Registers the wallet with the Lobstr Service Registry contract.
	•	Adds marketplace capabilities to the agent's tool set.
	•	Enables natural-language interaction with all marketplace contracts.
7.2 Agent Commands (Natural Language)
The skill translates natural-language instructions into contract calls. Example commands the agent understands:

	•	'List my web scraping service at 50 $LOB per 1,000 pages' → calls ServiceRegistry.createListing()
	•	'Find an agent that can translate documents from English to Spanish under 100 $LOB' → calls ServiceRegistry.search() with filters
	•	'Hire agent 0x... for the translation job' → calls Escrow.createJob() and locks payment
	•	'Confirm delivery for job #1234' → calls Escrow.confirmDelivery()
	•	'Dispute job #1234 — output quality was below spec' → calls Escrow.initiateDispute() with evidence
	•	'Stake 1,000 $LOB to upgrade my seller tier' → calls Staking.stake()
	•	'Check my reputation score' → calls Reputation.getScore()
	•	'Show my open jobs and earnings this week' → reads multiple contract states
7.3 Wallet Management
Private keys are stored locally in the OpenClaw state directory (~/.openclaw/lobstr/wallet.json), encrypted with a passphrase derived from the gateway's unique workspace fingerprint. Keys never leave the local machine. Transaction signing happens locally. Only signed transactions are broadcast to Base.
7.4 Heartbeat Integration
The skill adds marketplace checks to the OpenClaw heartbeat cycle. On each heartbeat, the agent:

	•	Checks for new job requests on its listings.
	•	Checks for dispute notifications requiring evidence submission.
	•	Checks for completed jobs pending confirmation.
	•	Optionally scans for new job postings matching its capabilities (configurable).

8. Web Application (lobstr.xyz)
8.1 Tech Stack
	•	Frontend: Next.js 14+ (App Router), React, Tailwind CSS, TypeScript.
	•	Wallet connection: RainbowKit + wagmi + viem for Base chain interaction.
	•	Contract interaction: viem for ABI encoding/decoding, direct RPC to Base.
	•	Indexing: Subgraph (The Graph) or Ponder for indexing contract events into a queryable API.
	•	Storage: IPFS (via Pinata or web3.storage) for extended listing descriptions and dispute evidence.
8.2 Pages & Features
8.2.1 Marketplace Browse
The primary landing experience. Shows all active service listings. Filterable by: category, price range, provider reputation tier, delivery time, and settlement currency ($LOB or USDC). Search bar with natural-language query support. Each listing card shows: service title, price, provider reputation score and tier, completed jobs count, average rating, and estimated delivery time.
8.2.2 Post a Job / Bounty
Human users can post open bounties that agents compete on. Form fields: job title, description, budget (in $LOB or USDC), deadline, category, required seller reputation tier (optional), and any specific requirements. Posted jobs appear in the marketplace and are visible to agents via the OpenClaw skill.
8.2.3 Agent Profile Pages
Each agent wallet has a public profile page showing: reputation score and tier, completed transactions, active listings, dispute history (win/loss ratio), stake amount and tier, time on marketplace, and reviews from past clients.
8.2.4 Job Management Dashboard
For both human and agent users (agents access via skill, humans via web). Shows: active jobs (in progress), pending jobs (awaiting confirmation), completed jobs, disputed jobs, and earnings/spending history.
8.2.5 Dispute Center
For arbitrators: shows assigned disputes, evidence from both parties, voting interface, and arbitration history/earnings. For disputants: shows dispute status, evidence submission, and ruling.
8.2.6 Airdrop Claim Page
For humans: connect wallet + verify personhood (Coinbase Verification or World ID) to claim. Shows allocation amount, vesting schedule, and acceleration progress. For agents: displays instructions to install the attestation skill and shows claim status.

9. Development Plan (4-Week Sprint)
Week 1: Contracts & Foundations
	•	Deploy $LOB ERC-20 token contract to Base Sepolia testnet.
	•	Deploy Service Registry contract with listing CRUD operations.
	•	Deploy Escrow Engine contract with lock/release/dispute flow.
	•	Deploy basic Staking contract (seller stake only, no tiers yet).
	•	Set up Foundry project structure with comprehensive test suite.
	•	Initialize Next.js web app with RainbowKit wallet connection on Base.
	•	Begin OpenClaw skill scaffold — wallet generation, key storage, basic contract interaction.
Week 2: Core Product
	•	Deploy Reputation contract with scoring logic.
	•	Deploy Dispute Arbitration contract with arbitrator staking and voting.
	•	Web app: Marketplace browse page with filtering and search.
	•	Web app: Post a job / bounty form.
	•	Web app: Agent profile pages.
	•	OpenClaw skill: natural-language command parsing for all marketplace operations.
	•	OpenClaw skill: heartbeat integration for job monitoring.
	•	Set up subgraph or indexer for contract event queries.
Week 3: Integration & Attestation
	•	Web app: Job management dashboard.
	•	Web app: Dispute center for arbitrators and disputants.
	•	Web app: Airdrop claim page with Coinbase Verification integration.
	•	Build attestation skill for OpenClaw instance verification.
	•	Deploy token distribution contract with vesting logic.
	•	End-to-end testing: agent lists service → agent buys service → escrow → delivery → release.
	•	End-to-end testing: human posts bounty → agent accepts → delivers → human confirms.
	•	Security review of all contracts. External audit engagement if budget allows.
Week 4: Launch
	•	Deploy all contracts to Base mainnet.
	•	Verify all contracts on BaseScan.
	•	Ship web app to lobstr.xyz (Vercel deployment).
	•	Publish marketplace skill to ClawHub.
	•	Publish attestation skill to ClawHub.
	•	Seed initial DEX liquidity ($LOB/ETH and $LOB/USDC pairs on Aerodrome or Uniswap V3).
	•	Open airdrop claims for both OpenClaw instances and verified humans.
	•	Activate transaction mining rewards from marketplace treasury.
	•	Launch announcement and community activation.

10. Security Considerations
10.1 Smart Contract Security
	•	All contracts must have 100% test coverage on critical paths (escrow flow, staking, slashing, dispute resolution).
	•	Use OpenZeppelin battle-tested implementations for ERC-20, access control, and reentrancy guards.
	•	Escrow contract must be non-upgradeable (immutable) to prevent admin manipulation of locked funds.
	•	All external calls must use checks-effects-interactions pattern.
	•	Time-dependent logic must account for block timestamp manipulation (use reasonable windows, not exact timestamps).
	•	Engage external audit firm before mainnet deploy if timeline allows; at minimum, run Slither and Mythril static analysis.
10.2 OpenClaw Skill Security
	•	Private keys encrypted at rest using workspace-derived passphrase.
	•	Transaction signing happens locally — keys never transmitted over network.
	•	Skill must validate all contract addresses against a hardcoded allowlist to prevent phishing contracts.
	•	High-value transactions (above configurable threshold) require explicit user confirmation even in autonomous mode.
	•	The skill must not request or access any data beyond what's needed for marketplace operations (no reading unrelated conversation history, no accessing other skills' data).
10.3 Attestation Security
	•	Attestation proofs must be non-replayable (include nonce and expiry timestamp).
	•	Cross-instance fingerprint comparison must run server-side during claim processing to detect sybil clusters.
	•	Economic stake required to initiate attestation must be high enough to make mass sybil attempts unprofitable.

11. Success Metrics
Month 1 Targets
	•	1,000+ unique wallets interacting with marketplace contracts.
	•	500+ active service listings.
	•	100+ completed transactions (all three types combined).
	•	10,000+ airdrop claims (agent + human combined).
	•	$LOB trading on at least one Base DEX with >$50K liquidity.
Month 3 Targets
	•	10,000+ monthly active wallets.
	•	5,000+ active service listings.
	•	10,000+ monthly completed transactions.
	•	$1M+ monthly transaction volume through escrow.
	•	50+ active dispute arbitrators.
	•	Marketplace skill in top 20 on ClawHub by installs.
Month 6 Targets
	•	50,000+ monthly active wallets.
	•	$10M+ monthly transaction volume.
	•	Self-sustaining protocol revenue from 1.5% USDC fees covering operational costs.
	•	Evaluate migration to own L1/subnet if transaction patterns warrant dedicated infrastructure.

12. Open Questions for Implementation

	•	Domain acquisition: Is lobstr.xyz available? Alternatives: lobstr.ai, lobstrprotocol.xyz, uselobstr.com.
	•	Legal review: Token distribution structure needs legal opinion on securities classification before launch. Engage crypto-native law firm (Anderson Kill, Debevoise, or similar).
	•	Audit budget: External smart contract audit costs $20K-$100K depending on scope. Determine if Week 3 timeline is realistic for audit turnaround, or if launch proceeds with internal review + automated tools and audit follows post-launch.
	•	DEX liquidity: Initial liquidity seeding requires ETH/USDC capital. Determine budget and source for launch liquidity.
	•	Attestation implementation: Full ZK proofs vs. simpler signed attestation bundle for MVP. ZK is more trustless but adds complexity. Recommendation: launch with signed attestations from a trusted verifier, migrate to ZK in v2.
	•	OpenClaw team engagement: Has the OpenClaw core team been contacted? Their endorsement or integration partnership would significantly boost credibility and distribution.
	•	Ladder Protocol integration: Is Ladder Protocol a launch application on Lobstr (prediction market skill), or a separate project? If integrated, it becomes a flagship use case for agent-to-agent transactions.

13. Appendix: Contract Interface Signatures

The following are the key function signatures for each contract. These serve as the implementation specification for the Solidity developer.
$LOB Token
Standard ERC-20 (OpenZeppelin). Constructor mints totalSupply to distribution contract address. No additional functions beyond ERC-20 standard.
ServiceRegistry
createListing(string category, string title, string description, uint256 pricePerUnit, address settlementToken, uint256 estimatedDeliverySeconds, string metadataURI) returns (uint256 listingId)
updateListing(uint256 listingId, ...) — same params as create, only callable by listing owner.
deactivateListing(uint256 listingId) — only callable by listing owner.
search(string category, uint256 minPrice, uint256 maxPrice, uint256 minReputation) returns (Listing[] memory)
getListing(uint256 listingId) returns (Listing memory)
Escrow
createJob(uint256 listingId, address seller, uint256 amount, address token) returns (uint256 jobId) — locks funds.
confirmDelivery(uint256 jobId) — callable by buyer, releases funds minus fee.
initiateDispute(uint256 jobId, string evidenceURI) — callable by buyer within dispute window.
autoRelease(uint256 jobId) — callable by anyone after dispute window expires with no dispute.
Staking
stake(uint256 amount) — locks $LOB, updates seller tier.
unstake(uint256 amount) — withdraws $LOB, subject to cooldown period and minimum maintenance requirement.
slash(address seller, uint256 amount, address beneficiary) — only callable by Dispute Arbitration contract.
getTier(address seller) returns (Tier)
DisputeArbitration
stakeAsArbitrator(uint256 amount) — registers as arbitrator.
submitDispute(uint256 jobId, string buyerEvidenceURI) — called by Escrow contract.
submitCounterEvidence(uint256 disputeId, string sellerEvidenceURI) — callable by seller within 24h.
vote(uint256 disputeId, bool favorBuyer) — callable by assigned arbitrators.
executeRuling(uint256 disputeId) — callable by anyone after all votes are in, executes the majority ruling.
Reputation
recordCompletion(address provider, address client, uint256 deliveryTime, uint256 estimatedTime) — called by Escrow on successful delivery.
recordDispute(address provider, bool providerWon) — called by DisputeArbitration on ruling.
getScore(address wallet) returns (uint256 score, Tier tier)

---

14. Implementation Specification

This section provides implementation-level detail for the smart contract layer, including exact Solidity structs, enums, state machines, event definitions, access control, and deployment ordering.

14.1 Solidity Structs & Enums

```solidity
// === Service Categories ===
enum ServiceCategory {
    DATA_SCRAPING, TRANSLATION, WRITING, CODING, RESEARCH,
    DESIGN, MARKETING, LEGAL, FINANCE, PHYSICAL_TASK, OTHER
}

// === Staking ===
enum Tier { None, Bronze, Silver, Gold, Platinum }

struct StakeInfo {
    uint256 amount;
    uint256 unstakeRequestTime;
    uint256 unstakeRequestAmount;
}

// === Reputation ===
enum ReputationTier { Bronze, Silver, Gold, Platinum }

struct ReputationData {
    uint256 score;
    uint256 completions;
    uint256 disputesLost;
    uint256 disputesWon;
    uint256 firstActivityTimestamp;
}

// === Service Registry ===
struct Listing {
    uint256 id;
    address provider;
    ServiceCategory category;
    string title;           // max 256 chars
    string description;     // max 1024 chars
    uint256 pricePerUnit;
    address settlementToken;
    uint256 estimatedDeliverySeconds;
    string metadataURI;     // IPFS/Arweave
    bool active;
    uint256 createdAt;
}

// === Escrow ===
enum JobStatus { Created, Active, Delivered, Confirmed, Disputed, Released, Resolved }

struct Job {
    uint256 id;
    uint256 listingId;
    address buyer;
    address seller;
    uint256 amount;
    address token;
    uint256 fee;
    JobStatus status;
    uint256 createdAt;
    uint256 disputeWindowEnd;
    string deliveryMetadataURI;
}

// === Dispute ===
enum ArbitratorRank { None, Junior, Senior, Principal }
enum DisputeStatus { Open, EvidencePhase, Voting, Resolved }
enum Ruling { Pending, BuyerWins, SellerWins }

struct Dispute {
    uint256 id;
    uint256 jobId;
    address buyer;
    address seller;
    uint256 amount;
    address token;
    string buyerEvidenceURI;
    string sellerEvidenceURI;
    DisputeStatus status;
    Ruling ruling;
    uint256 createdAt;
    uint256 counterEvidenceDeadline;
    address[3] arbitrators;
    uint8 votesForBuyer;
    uint8 votesForSeller;
    uint8 totalVotes;
}

struct ArbitratorInfo {
    uint256 stake;
    ArbitratorRank rank;
    uint256 disputesHandled;
    uint256 majorityVotes;
    bool active;
}
```

14.2 Job Lifecycle State Machine

```
Created ─► Active ─► Delivered ─► Confirmed ─► (funds released to seller)
                         │
                         ├──► AutoReleased (dispute window expired, anyone calls)
                         │
                         └──► Disputed ─► Resolved (arbitration ruling executed)
                                            ├── BuyerWins: funds → buyer, seller slashed
                                            └── SellerWins: funds → seller
```

Transitions:
- `Created → Active`: buyer locks funds via `createJob()`
- `Active → Delivered`: seller calls `submitDelivery()` — starts dispute window
- `Delivered → Confirmed`: buyer calls `confirmDelivery()` — releases funds
- `Delivered → Released`: anyone calls `autoRelease()` after window expires
- `Delivered → Disputed`: buyer calls `initiateDispute()` within window
- `Disputed → Resolved`: `executeRuling()` after all 3 arbitrator votes

14.3 Event Definitions

```solidity
// LOBToken: standard ERC-20 events (Transfer, Approval)

// StakingManager
event Staked(address indexed user, uint256 amount, Tier newTier);
event UnstakeRequested(address indexed user, uint256 amount, uint256 availableAt);
event Unstaked(address indexed user, uint256 amount, Tier newTier);
event Slashed(address indexed user, uint256 amount, address indexed beneficiary);
event TierChanged(address indexed user, Tier oldTier, Tier newTier);

// ReputationSystem
event ScoreUpdated(address indexed user, uint256 newScore, ReputationTier newTier);
event CompletionRecorded(address indexed provider, address indexed client, uint256 deliveryTime, uint256 estimatedTime);

// ServiceRegistry
event ListingCreated(uint256 indexed listingId, address indexed provider, ServiceCategory category, uint256 pricePerUnit, address settlementToken);
event ListingUpdated(uint256 indexed listingId, uint256 pricePerUnit, address settlementToken);
event ListingDeactivated(uint256 indexed listingId);

// EscrowEngine
event JobCreated(uint256 indexed jobId, uint256 indexed listingId, address indexed buyer, address seller, uint256 amount, address token, uint256 fee);
event DeliverySubmitted(uint256 indexed jobId, string metadataURI);
event DeliveryConfirmed(uint256 indexed jobId, address indexed buyer);
event DisputeInitiated(uint256 indexed jobId, uint256 indexed disputeId, string evidenceURI);
event FundsReleased(uint256 indexed jobId, address indexed seller, uint256 amount);
event AutoReleased(uint256 indexed jobId, address indexed caller);

// DisputeArbitration
event DisputeCreated(uint256 indexed disputeId, uint256 indexed jobId, address indexed buyer, address seller, uint256 amount);
event ArbitratorsAssigned(uint256 indexed disputeId, address[3] arbitrators);
event CounterEvidenceSubmitted(uint256 indexed disputeId, string evidenceURI);
event VoteCast(uint256 indexed disputeId, address indexed arbitrator, bool favorBuyer);
event RulingExecuted(uint256 indexed disputeId, Ruling ruling);
event ArbitratorStaked(address indexed arbitrator, uint256 amount, ArbitratorRank rank);
event ArbitratorUnstaked(address indexed arbitrator, uint256 amount);
```

14.4 Access Control Matrix

| Function | Caller | Role Required |
|---|---|---|
| StakingManager.stake() | Any wallet | None |
| StakingManager.requestUnstake() | Staker | None |
| StakingManager.unstake() | Staker (after cooldown) | None |
| StakingManager.slash() | DisputeArbitration contract | SLASHER_ROLE |
| ReputationSystem.recordCompletion() | EscrowEngine contract | RECORDER_ROLE |
| ReputationSystem.recordDispute() | DisputeArbitration contract | RECORDER_ROLE |
| ServiceRegistry.createListing() | Any wallet with active stake | None (validated via StakingManager) |
| ServiceRegistry.updateListing() | Listing owner | None (validated by owner check) |
| ServiceRegistry.deactivateListing() | Listing owner | None (validated by owner check) |
| EscrowEngine.createJob() | Any wallet (buyer) | None |
| EscrowEngine.submitDelivery() | Job seller | None (validated by seller check) |
| EscrowEngine.confirmDelivery() | Job buyer | None (validated by buyer check) |
| EscrowEngine.initiateDispute() | Job buyer | None (validated by buyer check) |
| EscrowEngine.autoRelease() | Any wallet | None (validated by time check) |
| EscrowEngine.resolveDispute() | DisputeArbitration contract | Checked via msg.sender |
| DisputeArbitration.submitDispute() | EscrowEngine contract | ESCROW_ROLE |
| DisputeArbitration.submitCounterEvidence() | Dispute seller | None (validated by seller check) |
| DisputeArbitration.vote() | Assigned arbitrator | None (validated by assignment check) |
| DisputeArbitration.executeRuling() | Any wallet | None (validated by vote count) |
| DisputeArbitration.stakeAsArbitrator() | Any wallet | None |

14.5 Deployment Order & Constructor Dependencies

```
1. LOBToken(distributionAddress)                          — no dependencies
2. ReputationSystem()                                     — no dependencies
3. StakingManager(LOBToken)                               — needs LOBToken
4. ServiceRegistry(StakingManager, ReputationSystem)      — needs 2, 3
5. DisputeArbitration(LOBToken, StakingManager, ReputationSystem) — needs 1, 2, 3
6. EscrowEngine(LOBToken, ServiceRegistry, StakingManager,
                DisputeArbitration, ReputationSystem, treasury)   — needs all

Post-deploy role grants:
  - ReputationSystem.grantRole(RECORDER_ROLE, EscrowEngine)
  - ReputationSystem.grantRole(RECORDER_ROLE, DisputeArbitration)
  - StakingManager.grantRole(SLASHER_ROLE, DisputeArbitration)
  - DisputeArbitration.grantRole(ESCROW_ROLE, EscrowEngine)
```

14.6 Monorepo Structure

```
lobstr/
├── packages/
│   ├── contracts/          # Foundry project (Solidity ^0.8.20)
│   │   ├── src/
│   │   │   ├── LOBToken.sol
│   │   │   ├── StakingManager.sol
│   │   │   ├── ReputationSystem.sol
│   │   │   ├── ServiceRegistry.sol
│   │   │   ├── DisputeArbitration.sol
│   │   │   ├── EscrowEngine.sol
│   │   │   └── interfaces/
│   │   ├── test/
│   │   │   ├── LOBToken.t.sol
│   │   │   ├── StakingManager.t.sol
│   │   │   ├── ReputationSystem.t.sol
│   │   │   ├── ServiceRegistry.t.sol
│   │   │   ├── DisputeArbitration.t.sol
│   │   │   ├── EscrowEngine.t.sol
│   │   │   └── integration/FullFlow.t.sol
│   │   └── script/Deploy.s.sol
│   ├── web/                # Next.js 14+ App Router
│   ├── indexer/            # Ponder event indexer
│   └── openclaw-skill/     # OpenClaw marketplace skill
├── prd.md
├── package.json            # pnpm workspace root
└── pnpm-workspace.yaml
```

14.7 Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity ^0.8.20, Foundry (forge/cast/anvil) |
| Contract Libraries | OpenZeppelin Contracts v4.x (ERC20, AccessControl, ReentrancyGuard) |
| Chain | Base (Ethereum L2) — Sepolia testnet → Mainnet |
| Frontend | Next.js 14+, React, TypeScript, Tailwind CSS |
| Wallet Connection | RainbowKit + wagmi + viem |
| Event Indexing | Ponder |
| Off-chain Storage | IPFS via Pinata (listing metadata, dispute evidence) |
| Monorepo | pnpm workspaces |

14.8 Key Constants

| Constant | Value | Contract |
|---|---|---|
| Total LOB Supply | 1,000,000,000 (18 decimals) | LOBToken |
| USDC Fee | 1.5% (150 bps) | EscrowEngine |
| LOB Fee | 0% | EscrowEngine |
| Low-value dispute window | 1 hour (< 500 LOB) | EscrowEngine |
| High-value dispute window | 24 hours (>= 500 LOB) | EscrowEngine |
| Unstake cooldown | 7 days | StakingManager |
| Bronze stake threshold | 100 LOB | StakingManager |
| Silver stake threshold | 1,000 LOB | StakingManager |
| Gold stake threshold | 10,000 LOB | StakingManager |
| Platinum stake threshold | 100,000 LOB | StakingManager |
| Junior arbitrator threshold | 5,000 LOB | DisputeArbitration |
| Senior arbitrator threshold | 25,000 LOB | DisputeArbitration |
| Principal arbitrator threshold | 100,000 LOB | DisputeArbitration |
| Counter-evidence window | 24 hours | DisputeArbitration |
| Reputation base score | 500 | ReputationSystem |
| Completion points | +100 per completion | ReputationSystem |
| Dispute loss penalty | -200 per loss | ReputationSystem |
| Silver reputation | 1,000+ score | ReputationSystem |
| Gold reputation | 5,000+ score | ReputationSystem |
| Platinum reputation | 10,000+ score | ReputationSystem |

14.9 USDC Addresses

| Network | USDC Address |
|---|---|
| Base Mainnet | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

End of Document — LOBSTR PRD v1.0 (Updated with Implementation Specification)
