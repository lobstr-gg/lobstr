# Uncommitted Changes Report

**Date:** 2026-02-21
**Branch:** main
**Last commit:** `58ca3ef` — Add --json flag to messages and forum CLI commands

---

## Session Changes (This Session)

### 1. Team Page Overhaul
**File:** `packages/web/src/app/team/page.tsx`

- Renamed founder from "Yeshua Respecter" to "Cruz"
- Changed founder sigil from "Y" to "C"
- Added `github` and `lobstrProfile` fields to FOUNDER data
- Added `username` and `lobstrProfile` fields to all 3 agents (Solomon, Titus, Daniel)
- Founder card now shows 3 links: LOBSTR profile (@yeshuarespecter), Twitter, GitHub
- Agent cards now show @username linked to their LOBSTR forum profile
- All profile links use `/forum/u/@handle` format

### 2. @username URL Resolution (API)
**File:** `packages/web/src/app/api/forum/users/[address]/route.ts`

- Added `getUserByUsername` import from firestore-store
- API now supports `@username` param in addition to wallet addresses
- When param starts with `@`, resolves via `getUserByUsername()` instead of `getUserByAddress()`
- Fallback minimal user object handles @username case gracefully
- `resolvedAddress` used for downstream queries (posts, friends, reviews)

### 3. Profile Page @username Support
**File:** `packages/web/src/app/forum/u/[address]/page.tsx`

- Renamed `address` to `paramAddress` for the raw URL param
- Derived resolved `address` from user data after API fetch (supports @username URLs)
- Fetch uses `encodeURIComponent(paramAddress)` for API call
- useEffect dependency changed from `address` to `paramAddress`

### 4. Duplicate Karma Fix
**File:** `packages/web/src/app/forum/u/[address]/page.tsx`

- Removed redundant `KarmaDisplay` component showing total karma
- Total karma = postKarma + commentKarma, so showing all 3 was duplicate
- Stats grid changed from 5 columns to 4: Post Karma, Comment Karma, Posts, Friends
- Post/Comment karma now uses `text-lob-green` color (matching the removed KarmaDisplay style)
- Removed unused `KarmaDisplay` import

### 5. @username in Navbar Profile Menu
**File:** `packages/web/src/components/Navbar.tsx`

- Added `@username` display between display name and truncated address in the profile dropdown
- Shows in green (`text-lob-green`), only when user has a username set

### 6. @username in DM Inbox
**File:** `packages/web/src/components/forum/DMInbox.tsx`

- Added `@username` next to display name in conversation list items
- Styled as tertiary text at 10px, separated with margin

### 7. @username in DM Thread Header
**File:** `packages/web/src/components/forum/DMThread.tsx`

- Added `@username` between display name and wallet address in thread header
- Shows as secondary text at 10px

### 8. @username in Forum Search Results
**File:** `packages/web/src/components/forum/ForumSearchBar.tsx`

- Added `username: string | null` to `SearchResults` users type
- Added @username display next to display name in user search results
- Shows as tertiary text

---

## Previously Committed Changes (Recent Commits)

### `58ca3ef` — Add --json flag to messages and forum CLI commands
- `packages/openclaw-skill/src/commands/messages.ts` — `--json` flag on `list` and `view`
- `packages/openclaw-skill/src/commands/forum.ts` — `--json` flag on `feed` and `view`

### `27bc74f` — Add DM by username with autocomplete and profile Message button
- DM system supports sending messages by @username
- Autocomplete on the compose field
- "Message" button on user profile pages

---

## Other Uncommitted Changes (Not From This Session)

These were in progress before this session or from parallel work:

| File | Summary |
|------|---------|
| `packages/agents/arbiter/SOUL.md` | Agent soul/identity doc |
| `packages/agents/sentinel/SOUL.md` | Agent soul/identity doc |
| `packages/agents/steward/SOUL.md` | Agent soul/identity doc |
| `packages/contracts/src/interfaces/IEscrowEngine.sol` | Interface update |
| `packages/indexer/ponder.config.ts` | Indexer config additions |
| `packages/indexer/ponder.schema.ts` | Schema additions |
| `packages/indexer/src/index.ts` | Indexer handler additions |
| `packages/openclaw-skill/SKILL.md` | Skill doc update |
| `packages/openclaw-skill/src/commands/job.ts` | Job command enhancements |
| `packages/web/src/app/forum/mod/page.tsx` | Mod page enhancements |
| `packages/web/src/app/jobs/[id]/_components/DeliveryReview.tsx` | Delivery review updates |
| `packages/web/src/app/jobs/[id]/page.tsx` | Job detail page updates |
| `packages/web/src/app/jobs/page.tsx` | Jobs listing updates |
| `packages/web/src/app/listing/[id]/_components/HireModal.tsx` | Hire modal updates |
| `packages/web/src/app/listing/[id]/page.tsx` | Listing page updates |
| `packages/web/src/app/post-job/page.tsx` | Post job page updates |
| `packages/web/src/components/forum/PostCard.tsx` | PostCard additions |
| `packages/web/src/config/abis.ts` | ABI additions |
| `packages/web/src/config/contracts.ts` | Contract config additions |
| `packages/web/src/lib/firestore-store.ts` | Firestore helper additions |
| `packages/web/src/lib/forum-types.ts` | Type additions |
| `packages/web/src/lib/hooks.ts` | Hook additions |

### Untracked (New Files)
| File | Summary |
|------|---------|
| `packages/contracts/script/DeployBridge.s.sol` | X402 bridge deploy script |
| `packages/contracts/src/X402EscrowBridge.sol` | X402 escrow bridge contract |
| `packages/contracts/src/interfaces/IERC3009.sol` | ERC-3009 interface |
| `packages/contracts/test/X402EscrowBridge.t.sol` | Bridge contract tests |
| `packages/indexer/abis/X402EscrowBridge.ts` | Bridge ABI for indexer |
| `packages/web/src/app/api/forum/mod/reports/route.ts` | Mod reports API |
| `packages/web/src/app/api/forum/mod/sybil-flags/route.ts` | Sybil flags API |
| `packages/web/src/app/api/forum/mod/sybil-report/route.ts` | Sybil report API |
| `packages/web/src/app/api/forum/report/route.ts` | Report API |
| `packages/web/src/app/jobs/[id]/_components/BridgeRefundClaim.tsx` | Bridge refund component |
| `packages/web/src/components/forum/ReportModal.tsx` | Report modal component |
| `packages/web/src/components/forum/SybilPrefilter.tsx` | Sybil prefilter component |
| `packages/x402-facilitator/` | Entire X402 facilitator package (new) |

---

## Stats

```
29 files changed, 1214 insertions(+), 67 deletions(-)
+ 22 new untracked files
```
