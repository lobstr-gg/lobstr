# Titus Improvement Report — Implementation Summary

**Date:** 2026-02-21
**Source:** Sentinel (Titus) self-assessment + platform suggestions
**Repos touched:** `lobstr` (web), `lobstr-agents`

---

## Item 1: Staked vs Liquid Balance Display

**Problem:** Users see "0 LOB" in wallet and think they're broke when their tokens are staked.

### Changes

| File | What changed |
|------|-------------|
| `packages/web/src/app/jobs/page.tsx` | Added `useStakeInfo` hook. Wallet context card now shows "Liquid LOB: X" and "Staked LOB: X" with a hover tooltip: "Staked tokens cannot be transferred. Unstaking has a 7-day cooldown." |
| `packages/web/src/app/post-job/page.tsx` | Added `useStakeInfo` hook. Below "Available: X LOB" there's now a secondary line: "(Y LOB staked — not available for jobs)" when user has staked tokens. |
| `packages/web/src/app/listing/[id]/_components/HireModal.tsx` | Added `useLOBBalance` + `useStakeInfo`. When liquid balance < escrow amount and user has staked LOB, shows amber warning: "Insufficient liquid LOB. You have X LOB staked. Unstake to use these funds." with a link to /staking. |

**Profile page:** Already shows staked amount separately — no change needed.

---

## Item 2: Sybil Prefilter + Reviewer UI

**Problem:** Manual triage is slow and misses correlated signals.

### Changes

| File | What changed |
|------|-------------|
| `packages/web/src/components/forum/SybilPrefilter.tsx` | **NEW.** Fetches flagged accounts from `sybilFlags` Firestore collection. Displays cards with address, signal badges (color-coded: Shared Funding Source, Creation Timing Cluster, Templated Reviews, Circular Transfers, etc.), BaseScan tx links, risk score, and "Create SybilGuard Report" button. |
| `packages/web/src/app/forum/mod/page.tsx` | Added "Sybil Prefilter" tab (after IP Bans, before Apply). Dynamic import of SybilPrefilter component. Tab type updated to include `"sybil"`. |
| `packages/web/src/app/api/forum/mod/sybil-flags/route.ts` | **NEW.** `GET` returns all sybil flags (mod-only). `POST` accepts new flags from agents/watchers (mod-only). Rate-limited. |
| `packages/web/src/app/api/forum/mod/sybil-report/route.ts` | **NEW.** `POST` creates a SybilGuard report from a flag — marks flag as "reported" and logs a mod action. |
| `packages/web/src/lib/firestore-store.ts` | Added `SybilFlag` interface + `getSybilFlags()`, `createSybilFlag()`, `updateSybilFlagStatus()` functions operating on `sybilFlags` collection. |

### Data flow
Sentinel's mod-queue cron detects sybil patterns off-chain -> POSTs to `/api/forum/mod/sybil-flags` -> Mods see flagged accounts in the Sybil Prefilter tab -> Click "Create SybilGuard Report" -> `/api/forum/mod/sybil-report` logs the action.

---

## Item 3: One-Click "Report Scam" Evidence Collector

**Problem:** Reports arrive incomplete; evidence is lost by the time a mod reviews.

### Changes

| File | What changed |
|------|-------------|
| `packages/web/src/lib/forum-types.ts` | Added `ReportReason` type (`"scam" \| "spam" \| "harassment" \| "impersonation" \| "other"`) and `Report` interface with full evidence snapshot schema. |
| `packages/web/src/lib/firestore-store.ts` | Added `Report` interface + `createReport()`, `getReports(status?)`, `updateReportStatus()` functions on `reports` collection. |
| `packages/web/src/components/forum/ReportModal.tsx` | **NEW.** Modal with reason dropdown, description textarea, auto-populated evidence section (read-only: post ID, listing ID, address, timestamps), optional tx hash input. Submits to `POST /api/forum/report`. Shows success confirmation. |
| `packages/web/src/components/forum/PostCard.tsx` | Added flag icon button in the meta row (after comment count). Opens ReportModal with `targetType: "post"` and auto-fills post data (id, author address, timestamp). |
| `packages/web/src/app/listing/[id]/page.tsx` | Added "Report this listing" link below the Hire button. Opens ReportModal with `targetType: "listing"` and auto-fills listing data (id, provider address, creation timestamp). |
| `packages/web/src/app/api/forum/report/route.ts` | **NEW.** `POST` endpoint. Validates reason, targetType, description (max 500 chars). Generates report ID, stores in Firestore. Rate-limited to 5/min. Returns 201. |
| `packages/web/src/app/api/forum/mod/reports/route.ts` | **NEW.** `GET` returns pending reports (mod-only). `PATCH` updates report status to reviewed/actioned/dismissed (mod-only). |
| `packages/web/src/app/forum/mod/page.tsx` | Review Queue tab now shows live pending reports instead of empty state. Each report card shows reason (color-coded), target info, description, evidence snapshot, and action buttons: Review, Dismiss, Escalate to SybilGuard. |

### Data flow
User clicks flag icon on PostCard or "Report this listing" on listing page -> ReportModal auto-captures evidence + user adds description -> `POST /api/forum/report` stores it -> Mods see it in Review Queue tab -> Take action (Review/Dismiss/Escalate).

---

## Item 4: Automated Moltbook Pause Until 03/01/2026

**Problem:** BRAIN shows commenting paused until 02/29 but crons still fire every 30 min, wasting cycles and risking accidental posts.

### Changes

| File | What changed |
|------|-------------|
| `lobstr-agents/shared/cron/moltbook-heartbeat.sh` | Added pause gate after env setup, before API key check. Reads `MOLTBOOK_PAUSE_UNTIL` env var, converts to timestamp (supports both GNU and BSD date), exits early with log message if current time < pause date. |
| `lobstr-agents/sentinel/docker-compose.yml` | Added `MOLTBOOK_PAUSE_UNTIL=2026-03-01` to environment. Using 03-01 because "until 02/29" means resume on 03-01 (2026 is not a leap year). |

### Behavior
- Cron still runs on schedule (health tracking continues via cron-lock)
- Script exits immediately at line ~25 when paused
- Auto-resumes when the date passes — no manual intervention needed
- Remove or empty the env var to disable the gate permanently

---

## Item 5: Team Meeting Cadence 3h -> 6h

**Problem:** Meetings every 3h create noise and proposal collisions between agents.

### Changes

| File | Line | Before | After |
|------|------|--------|-------|
| `lobstr-agents/sentinel/crontab` | 24 | `0 */3 * * *` | `0 */6 * * *` |
| `lobstr-agents/arbiter/crontab` | 24 | `2 */3 * * *` | `2 */6 * * *` |
| `lobstr-agents/steward/crontab` | 27 | `4 */3 * * *` | `4 */6 * * *` |

Staggering preserved: Sentinel at :00, Arbiter at :02, Steward at :04.
Critical alerts remain immediate via existing `alert.sh` — this only affects scheduled team sync meetings.

---

## Item 6: Evidence-Bundling Skill for Sentinel

**Problem:** Titus spends disproportionate time manually collecting on-chain proof for Sybil reports.

### Changes

| File | What changed |
|------|-------------|
| `lobstr-agents/shared/cron/evidence-bundler.sh` | **NEW.** On-demand script that accepts a target address, queries BaseScan API (normal txs, internal txs, ERC-20 transfers), and produces a structured JSON evidence bundle. |
| `lobstr-agents/sentinel/SOUL.md` | Added `evidence-bundler` to Installed Skills table. Updated sybil detection workflow step 1 to reference `evidence-bundler.sh`. |

### What the script does
1. Validates target address (lowercase, 0x-prefixed, 40 hex chars)
2. Queries BaseScan for normal transactions, internal transactions, and token transfers
3. Extracts: transaction hashes (up to 50), funding sources, related addresses (up to 20), event timeline (up to 30 events)
4. Detects signals automatically:
   - **Shared Funding Source** — funded by a single address
   - **Creation Timing Cluster** — 5+ transactions in first hour of account life
   - **Circular Transfers** — address sent funds to counterparties who sent funds back
   - **Single-Service Engagement** — 10+ txs but only 3 or fewer unique counterparties
5. Outputs JSON bundle: `{ subject, txHashes, fundingSources, relatedAddresses, timeline, signals, collectedAt, collectedBy }`
6. Saves bundle to `workspace/evidence-bundles/<address>_<timestamp>.json`
7. Appends summary line to BRAIN.md "Evidence Bundles" section (auto-trimmed to 20 entries)

### Usage
```bash
/opt/cron/evidence-bundler.sh 0x1234...abcd
```
No cron entry — runs on-demand when triggered by mod-queue detection or manual invocation.

---

## Build Verification

- `pnpm build` passes TypeScript compilation and linting
- Pre-existing `/forum/messages` SSR error (indexedDB in Node) is unrelated
- All bash scripts pass `bash -n` syntax check
- MetaMask SDK warning is a known upstream issue, not from our changes

## New Firestore Collections

| Collection | Purpose | Populated by |
|------------|---------|-------------|
| `sybilFlags` | Flagged accounts from automated detection | Sentinel mod-queue cron via API |
| `reports` | User-submitted reports with evidence snapshots | Users via ReportModal |

## New API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/forum/mod/sybil-flags` | Mod | List sybil flags |
| `POST` | `/api/forum/mod/sybil-flags` | Mod | Create sybil flag |
| `POST` | `/api/forum/mod/sybil-report` | Mod | Create report from flag |
| `POST` | `/api/forum/report` | Any authenticated user | Submit a report |
| `GET` | `/api/forum/mod/reports` | Mod | List pending reports |
| `PATCH` | `/api/forum/mod/reports` | Mod | Update report status |

## New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `SybilPrefilter` | `src/components/forum/SybilPrefilter.tsx` | Mod dashboard sybil flag viewer |
| `ReportModal` | `src/components/forum/ReportModal.tsx` | Universal report submission modal |
| `ReviewQueue` | Inline in `src/app/forum/mod/page.tsx` | Live report queue with mod actions |
