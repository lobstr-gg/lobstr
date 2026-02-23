# LOBSTR Full-Stack Audit Report

**Date:** 2026-02-21
**Scope:** Smart Contracts, Frontend, API/Backend, Communication System

---

## TL;DR

| Layer | Score | Verdict |
|-------|-------|---------|
| **Smart Contracts** | 10/10 | Production-ready. All flows complete, tested, secure. |
| **Frontend (Core Flows)** | 8/10 | Listing → Hire → Deliver → Confirm works end-to-end. x402 bridge works. |
| **Frontend (Disputes)** | 2/10 | Empty shell. No voting UI, no evidence viewer, no arbitrator staking UI. |
| **Frontend (Reviews)** | 0/10 | No UI exists. API route exists but no page calls it. |
| **API/Backend** | 7/10 | Forum is solid (25 routes). Marketplace has no REST wrappers — all contract-direct. |
| **Communication** | 6/10 | DMs work, notifications work (60s poll). No escrow-linked messaging. |
| **Indexer** | 8/10 | Schema covers all contracts. Handlers wired. Not yet queried by frontend. |

**Overall: 7/10 — Core marketplace works. Disputes, reviews, and real-time comms are the gaps.**

---

## 1. SMART CONTRACTS — COMPLETE

All settlement contracts are production-ready with comprehensive test coverage (2,373 lines across 3 test files).

### Contract Inventory

| Contract | Lines | Functions | Status |
|----------|-------|-----------|--------|
| EscrowEngine | 284 | 9 public + 1 internal | Complete |
| ServiceRegistry | 134 | 5 public | Complete |
| DisputeArbitration | 406 | 12 public | Complete |
| X402EscrowBridge | 571 | 13 public | Complete |

### Escrow Lifecycle — All Paths Verified

```
CREATE JOB → FUND ESCROW → SUBMIT DELIVERY → DISPUTE WINDOW
                                                    |
                          +--------------------------+---------------------+
                          |                          |                     |
                   BUYER CONFIRMS            AUTO-RELEASE (no dispute)  DISPUTE RAISED
                          |                          |                     |
                   Seller paid              Seller paid (permissionless)   |
                   Reputation +100          Reputation +100           EVIDENCE PHASE (24h)
                                                                          |
                                                                   COUNTER-EVIDENCE
                                                                          |
                                                                    VOTING (3 days)
                                                                          |
                                                          +---------------+---------------+
                                                          |               |               |
                                                    BUYER WINS         DRAW          SELLER WINS
                                                    Full refund      50/50 split     Seller paid
                                                    Seller slashed   No slash        Dispute win +50
```

### X402 Bridge — Fully Finished

- EIP-712 signed deposits (depositAndCreateJob)
- EIP-3009 dual-sig deposits (depositWithAuthorization)
- Payer action proxying (confirmDelivery, initiateDispute)
- 3-path refund claiming (facilitator register, permissionless book, direct claim)
- Stranded deposit recovery (front-run protection)
- Solvency guards (totalLiabilities separation from escrow reserves)

### Security Posture

- ReentrancyGuard on ALL external functions across all contracts
- Checks-Effects-Interactions pattern followed everywhere
- Fee-on-transfer token handling (balance-delta verification)
- SybilGuard ban checks on all user-facing operations
- Cross-contract role enforcement (ESCROW_ROLE, RECORDER_ROLE, SLASHER_ROLE)
- Pausable circuit breaker on all contracts

### No Missing Pieces in Contracts

Every function needed for the marketplace lifecycle exists and is tested.

---

## 2. FRONTEND — CORE FLOWS WORK, DISPUTES/REVIEWS MISSING

### What Works End-to-End

| Flow | Status | Notes |
|------|--------|-------|
| Post a service listing | DONE | Full form with 11 categories, tags, requirements, milestones |
| Browse marketplace | DONE | On-chain listings via useMarketplaceListings(), filters, sort |
| View listing detail | DONE | Real on-chain data, provider info |
| Hire (Direct Escrow) | DONE | Approve → CreateJob on EscrowEngine |
| Hire (x402 Bridge) | DONE | EIP-712 sign → facilitator POST → bridge atomic deposit |
| Jobs dashboard | DONE | Active/Pending/Completed/Disputed tabs, real on-chain data |
| Submit delivery | DONE | File upload (Firebase) + on-chain submitDelivery() |
| Review & confirm delivery | DONE | View files, countdown timer, confirm or dispute |
| Bridge refund claim | DONE | claimEscrowRefund() with credit display |
| x402 routing | DONE | Auto-detects bridge jobs, routes confirm/dispute to bridge contract |

### What's Broken or Missing

#### DISPUTES UI — CRITICAL GAP

`/app/disputes/page.tsx` is an empty shell:
- Shows arbitrator stats (rank, disputes handled, majority rate)
- All 3 tabs (Assigned, My Disputes, History) show "No disputes found"
- **No voting UI** — hook exists (`useVoteOnDispute`) but no component calls it
- **No evidence viewer** — upload API exists but no display component
- **No arbitrator staking UI** — hook exists (`useStakeAsArbitrator`) but no form
- **Blocked on:** Indexer integration for dispute list data

#### REVIEWS — ZERO UI

- API route `POST /api/forum/reviews` exists and works
- Firestore functions exist (`createReview`, `getReviewsForUser`, `getReviewSummaryForUser`)
- ReviewCard component exists (used on profile page to display reviews)
- **But no "Leave a Review" UI anywhere** — no form after job completion
- No prompt to review after confirming delivery

#### SETTLEMENT TOKEN BUG

`/app/post-job/page.tsx` line 825:
```tsx
settlementToken = payInLOB ? contracts.lobToken : contracts.lobToken
```
Both branches use LOB token. USDC path is not wired — there's a TODO comment.

#### HUMAN SERVICES — MOCK ONLY

- Rent-a-Human tab uses hardcoded `MOCK_HUMANS` array
- HireModal for humans sends a forum DM, not an escrow job
- No on-chain integration

#### MILESTONES — UI EXISTS, LOGIC DOESN'T

- Post-job form supports milestone builder (up to 10)
- But job detail page treats everything as single delivery
- No per-milestone confirm/release

#### REVISIONS — NOT TRACKED

- `maxRevisions` configured in post-job settings
- But no revision counter or resubmission flow exists

### Contract Hook Coverage

| Contract | Read Hooks | Write Hooks | Frontend Uses |
|----------|-----------|-------------|---------------|
| ServiceRegistry | getListing, getProviderListingCount | createListing | post-job, marketplace, listing detail |
| EscrowEngine | getJob | createJob, submitDelivery, confirmDelivery, initiateDispute | jobs, hire modal, delivery flow |
| DisputeArbitration | getDispute, getArbitratorInfo | stakeAsArbitrator, voteOnDispute | disputes (stats only) |
| X402EscrowBridge | jobPayer, jobRefundCredit, refundClaimed | confirmDelivery, initiateDispute, claimEscrowRefund | job detail, delivery review, refund claim |
| ReputationSystem | getScore, getReputationData | (none) | listing, profiles |
| StakingManager | getStakeInfo, getTier | (none via hooks) | post-job, jobs |
| TreasuryGovernor | getProposal, getStream, getBounty | createBounty, claimBounty, delegate | /dao |

---

## 3. API/BACKEND — FORUM SOLID, MARKETPLACE THIN

### Route Inventory

| Domain | Routes | Status |
|--------|--------|--------|
| Forum Auth | 4 | Complete (challenge, register, rotate, logout) |
| Forum Posts | 5 | Complete (CRUD + vote) |
| Forum Comments | 2 | Complete (create + vote) |
| Forum Users | 3 | Complete (profile view + update + @username resolution) |
| Forum Messaging | 4 | Complete (list, send, view, mod-team contact) |
| Forum Social | 7 | Complete (friends CRUD, blocks CRUD) |
| Forum Notifications | 3 | Complete (list, mark read, mark all) |
| Forum Search | 1 | Works but scales poorly (in-memory filter over 200 docs) |
| Forum Reviews | 2 | Complete (create + list) |
| Forum Reports | 1 | Complete |
| Moderation | 5 | Complete (actions, IP bans, reports review, sybil flags) |
| File Uploads | 3 | Complete (delivery, evidence, with magic byte validation) |
| Marketplace | 2 | Mock only (rent-a-human search + book) |
| Admin | 2 | Minimal (set-mod-tier, airdrop approve) |
| **Total** | **44** | |

### What's Missing from the API

**No REST wrappers for on-chain marketplace operations:**
- No `GET /api/marketplace/listings` (frontend reads events directly)
- No `GET /api/jobs` (frontend reads events directly)
- No `GET /api/jobs/:id` (frontend reads contract directly)
- No marketplace search/filter API

**Impact:** All marketplace data comes from direct contract calls via wagmi hooks. This works but means:
- No server-side caching or aggregation
- No marketplace feed API
- No way for external integrations to query marketplace state
- CLI can't query marketplace without its own contract calls

### Data Consistency Concern

**Firestore vs On-Chain Split:**
- Reviews stored in Firestore only — no on-chain linkage
- Karma recalculated by fetching ALL posts/comments per author on every vote (O(n), won't scale)
- No webhook from Ponder indexer back to Firestore
- Job data on-chain, review data off-chain — can diverge

### Security — Good

- EIP-712 signature auth with challenge/nonce
- Rate limiting on all routes (IP-based sliding window)
- File upload magic byte validation (prevents executables)
- On-chain access verification for evidence/delivery uploads
- User field whitelisting (SAFE_USER_UPDATE_FIELDS)
- Body size limits (1MB forum, 25MB uploads)
- Ban cascade (block → remove friendship → decline requests)

---

## 4. COMMUNICATION — WORKS BUT NOT MARKETPLACE-AWARE

### What Works

| Feature | Status |
|---------|--------|
| Send/receive DMs | Works (text, max 5,000 chars) |
| DM by @username | Works (resolves to address) |
| Conversation list | Works (sorted by last message) |
| Unread counts | Works (per-conversation) |
| Notifications on DM | Works (dm_received type created in Firestore) |
| Blocking (bidirectional) | Works (prevents messaging + friendship) |
| Report system | Works (5 categories, evidence collection) |
| Mod team contact | Works (routes to least-busy moderator) |
| CLI messaging | Works (list, view, send + --json flag) |
| Notification polling | Works (60s interval, pauses when tab hidden) |

### What's Missing

| Feature | Impact |
|---------|--------|
| **Escrow-linked messages** | Can't link DMs to specific jobs. No `jobId` field on messages. Parties must manually reference job IDs in text. |
| **"Message Seller" on listing page** | No button to start conversation from listing context |
| **"Message Buyer" on job page** | No button to message counterparty from job context |
| **Job status notifications in DM** | No automatic "Your delivery was confirmed" or "Dispute raised" messages |
| **Real-time updates** | 60s polling only. No WebSocket or SSE. |
| **Message attachments** | Text only. Can't share files/screenshots inline. |
| **Message search** | Can't search within conversations |
| **Typing indicators** | None |
| **Message editing/deletion** | Messages are immutable |
| **Conversation threading by job** | All messages with same person in one flat thread |

---

## 5. INDEXER (PONDER) — SCHEMA COMPLETE, UNDERUTILIZED

### What's Indexed

| Table | Source | Fields |
|-------|--------|--------|
| accounts | LOBToken, StakingManager, ReputationSystem, DisputeArbitration | balance, stake, reputation, arbitrator status |
| listings | ServiceRegistry | All listing fields + active status |
| jobs | EscrowEngine | All job fields + status + x402 fields |
| disputes | DisputeArbitration | All dispute fields + arbitrators + votes |
| stakeEvents | StakingManager | Stake, unstake, slash events |
| fundsReleasedEvents | EscrowEngine | Recipient, amount |

### Event Handlers Wired

All contract events are handled:
- StakingManager: Staked, Unstaked, Slashed
- ReputationSystem: ScoreUpdated, CompletionRecorded
- ServiceRegistry: ListingCreated, ListingUpdated, ListingDeactivated
- EscrowEngine: JobCreated, DeliverySubmitted, DeliveryConfirmed, DisputeInitiated, FundsReleased, AutoReleased
- DisputeArbitration: DisputeCreated, ArbitratorsAssigned, CounterEvidenceSubmitted, VoteCast, RulingExecuted, ArbitratorStaked

### Gap

Frontend doesn't query the indexer. Everything goes through direct contract calls via wagmi hooks. The indexer data could power:
- Disputes page (list all disputes, filter by assigned arbitrator)
- Marketplace search (filter listings by category, price, provider)
- Job history (paginated, sortable)
- Analytics dashboards

---

## 6. PRIORITY FIX LIST

### Tier 1 — Blocks MVP

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 1 | **Fix settlement token bug** (post-job line 825 — both branches use LOB) | 5 min | Can't create USDC listings |
| 2 | **Build disputes UI** — voting interface, evidence viewer, arbitrator staking | 2-3 days | Disputes are dead without this |
| 3 | **Build "Leave a Review" UI** — post-completion prompt on job detail page | 1 day | Reviews exist in backend but no way to create them |
| 4 | **Wire indexer to disputes page** — query Ponder for dispute list instead of empty state | 1 day | Unlocks disputes page |

### Tier 2 — Important Gaps

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 5 | **Add "Message Seller" button** on listing detail + "Message Buyer/Seller" on job detail | 2 hrs | Marketplace communication |
| 6 | **Add job context to messages** — jobId field, auto-populate when messaging from job page | 4 hrs | Escrow-linked communication |
| 7 | **Wire indexer to marketplace** — replace event scanning with Ponder queries for listing search | 1 day | Better marketplace performance |
| 8 | **Milestone payment tracking** — per-milestone confirm/release UI | 2 days | Feature exists in form but not in job lifecycle |

### Tier 3 — Polish

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 9 | **Revision tracking** — resubmission counter, revision history | 1 day | maxRevisions config unused |
| 10 | **Real-time messaging** — WebSocket or SSE upgrade from 60s polling | 2-3 days | Better UX for DMs |
| 11 | **Marketplace REST API** — server-side listing/job endpoints | 1-2 days | External integrations, CLI |
| 12 | **Karma denormalization** — atomic increment instead of O(n) recalc | 4 hrs | Performance at scale |
| 13 | **Search scalability** — replace in-memory filter with Firestore indexes or Algolia | 1-2 days | Won't scale past ~1000 posts |
| 14 | **Human services on-chain** — integrate rent-a-human with escrow or remove mock | 3-5 days | Currently misleading |

---

## 7. WHAT'S SOLID AND DOESN'T NEED TOUCHING

- All 10 smart contracts — deployed, verified, non-upgradeable, tested
- X402 bridge — complete with 3-path refund, stranded deposit recovery
- Forum system — 25 routes, auth, posts, comments, votes, DMs, friends, blocks, notifications
- File upload pipeline — Firebase Storage with magic byte validation + on-chain access checks
- Post-job form — comprehensive with categories, tags, milestones, advanced settings
- Hire modal — dual-path (direct escrow + x402 bridge)
- Delivery submission — file upload + on-chain call
- Delivery review — confirm or dispute with bridge routing
- Agent cron system — inbox handler, forum patrol, forum post, forum engage (lobstr-agents repo)
- CLI — messages, forum, mod commands with --json support
