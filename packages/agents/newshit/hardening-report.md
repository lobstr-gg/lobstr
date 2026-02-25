# OpenClaw v2026.2.21 — Hardening & Enhancement Report

Date: February 21, 2026
Scope: lobstr-agents infrastructure (bot.mjs, SOUL configs, Docker, cron)

---

## Task 1: Security Hardening — bot.mjs (P0)

### 1a. Shell Injection Elimination — runCLI() → runCLIExec()

The entire bot was using `runCLI()`, a wrapper around Node's `execSync()` that passed user-influenced strings through a shell. This is a textbook shell injection vector — any tool argument derived from Discord input (addresses, usernames, search queries) could break out of the command.

**What changed:**
- Migrated every single `runCLI("lobstr ...")` call (~40+ callsites) to `runCLIExec(["lobstr", ...args])` which uses `execFileSync` under the hood — no shell, arguments passed as an array
- Deleted the `runCLI()` function entirely
- Removed `execSync` from the import statement (only `execFileSync` remains)

**Tricky callsites that needed special handling:**
- **Conditional args:** Commands like `lobstr wallet balance [addr]` became `const cmd = ["lobstr", "wallet", "balance"]; if (addr) cmd.push(addr); runCLIExec(cmd);`
- **Shell OR operators:** `runCLI("lobstr forum list-own || lobstr forum feed all --limit 50")` can't work with array syntax. Converted to a try/catch fallback pattern in JS:
  ```js
  let result = runCLIExec(["lobstr", "forum", "list-own"]);
  if (result.startsWith("Error")) result = runCLIExec(["lobstr", "forum", "feed", "all", "--limit", "50"]);
  ```
- **Template literals with multiple variables:** Each interpolated variable became its own array element, preserving the exact argument boundaries
- **mass_delete_posts tool:** Had its own inline `execSync` call — converted to `execFileSync("lobstr", ["forum", "delete", id], ...)`

### 1b. Basescan execSync → execFileSync

Three places in the bot called `execSync` directly to curl the Basescan API:
- `basescan_tx` tool
- `basescan_address` tool (two calls)

All converted from:
```js
execSync(`curl -s "https://api.basescan.org/api?..."`, { timeout: 15000, encoding: "utf-8" })
```
To:
```js
execFileSync("curl", ["-s", `https://api.basescan.org/api?...`], { timeout: 15000, encoding: "utf-8" })
```

### 1c. Prototype Pollution Guard

Added immediately after imports:
```js
Object.freeze(Object.prototype);
Object.freeze(Array.prototype);
```

This prevents any code (including dependencies) from modifying base object prototypes at runtime — a common attack vector in Node.js applications where malicious input can inject properties onto `Object.prototype` that then propagate to all objects.

### 1d. Discord Content Sanitization

Added `sanitizeDiscordContent()` function that:
1. Strips ASCII control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F) — these can be used for prompt injection or log spoofing
2. Truncates content to 4,000 characters — prevents memory abuse from massive messages

Applied in `addToHistory()` so every message entering the conversation memory is cleaned before the LLM ever sees it.

### 1e. LLM Error Log Truncation

In `callLLM()`, error responses from the LLM API were logged in full:
```js
console.error(`[discord-bot] LLM ${res.status}: ${await res.text()}`);
```

Changed to:
```js
const errBody = (await res.text()).slice(0, 200);
console.error(`[discord-bot] LLM ${res.status}: ${errBody}`);
```

Prevents accidentally logging sensitive headers, tokens, or massive error payloads to container logs.

---

## Task 2: Safety Rails — All 3 SOUL.md Files (P0)

### What changed

In all three agent configs (`sentinel/SOUL.md`, `arbiter/SOUL.md`, `steward/SOUL.md`):

- Renamed `## Safety Rails` → `## Safety Rails — Immutable`
- Added 5 new rules (items 4-8) after the existing 3:

```
4. No irreversible on-chain transactions without founder confirmation
5. No token transfers >1,000 LOB without explicit Cruz approval
6. No unstaking without explicit instruction
7. No Guardian cancel without Cruz confirmation (alert first, only cancel if actively draining AND Cruz unreachable >30 min)
8. When blocked: report and wait — don't improvise
```

### Why

The original 3 rules covered catastrophic scenarios (full treasury drain, active exploits) but left a gap for "medium severity" actions that an agent might decide to take autonomously. The new rules create a tighter boundary:
- Rule 4 prevents any irreversible tx without Cruz saying go
- Rule 5 caps autonomous spending at 1,000 LOB
- Rule 6 prevents agents from deciding to unstake on their own (could lose arbitrator status)
- Rule 7 tightens Guardian cancel — was previously "use immediately" but now requires confirmation with a 30-min emergency exception
- Rule 8 is the catch-all: if you're stuck, don't get creative, just report it

The "Immutable" label signals to the LLM that these rules cannot be overridden by conversation context or other instructions.

---

## Task 3: Cron Locking (P1)

### Finding: Already Implemented

All cron scripts were already wrapped with `/opt/scripts/cron-lock.sh` at the crontab level. Every entry in `sentinel/crontab`, `arbiter/crontab`, and `steward/crontab` follows this pattern:

```
<schedule>  /opt/scripts/cron-lock.sh <job_name> <timeout_sec> /opt/cron/<script>.sh >> /var/log/agent/<script>.log 2>&1
```

The `cron-lock.sh` wrapper uses `flock -n` for non-blocking exclusive locks and `timeout` to kill stuck jobs. No changes were needed.

---

## Task 4: Docker SHA Pinning (P1)

### What changed

Both `FROM` lines in `shared/Dockerfile` were pinned from a floating tag to a specific digest:

**Before:**
```dockerfile
FROM node:20-slim AS builder
...
FROM node:20-slim
```

**After:**
```dockerfile
FROM node:20-slim@sha256:c6585df72c34172bebd8d36abed961e231d7d3b5cee2e01294c4495e8a03f687 AS builder
...
FROM node:20-slim@sha256:c6585df72c34172bebd8d36abed961e231d7d3b5cee2e01294c4495e8a03f687
```

### Why

Floating tags like `node:20-slim` resolve to whatever the latest push is. If the upstream image gets compromised or has a breaking change, the next build silently pulls the bad version. Pinning to a SHA256 digest means builds are 100% reproducible and immune to supply-chain attacks on Docker Hub. The digest should be updated periodically (when intentionally upgrading Node).

---

## Task 5: Per-Channel Model Overrides (P1)

### What changed

Added a `CHANNEL_MODEL_OVERRIDES` config object that maps specific Discord channels to different LLM models:

```js
const CHANNEL_MODEL_OVERRIDES = {};
if (CONSENSUS_CHANNEL) CHANNEL_MODEL_OVERRIDES[CONSENSUS_CHANNEL] = LLM_REASONING_MODEL;
if (ALERTS_CHANNEL) CHANNEL_MODEL_OVERRIDES[ALERTS_CHANNEL] = LLM_REASONING_MODEL;
```

Updated `callLLM()` signature to accept a `modelOverride` parameter:
```js
async function callLLM(systemPrompt, messages, userId, channel, founderInitiated = false, modelOverride = null, sourceMessage = null)
```

The effective model is chosen as:
```js
const effectiveModel = modelOverride || LLM_MODEL;
```

The message handler looks up the channel model and passes it through:
```js
const channelModel = CHANNEL_MODEL_OVERRIDES[channelId] || null;
```

### Why

The consensus channel (where agents vote on disputes/proposals) and the alerts channel (security events) are high-stakes contexts. Using a reasoning model (like DeepSeek-R1 or similar) for these channels means more deliberate, chain-of-thought responses for critical decisions, while keeping the faster/cheaper model for casual conversation channels.

---

## Task 6: Context Compaction (P1)

### What changed

Added automatic conversation summarization when channel history grows large:

1. **Compaction trigger** in `addToHistory()`:
   - When a channel's history reaches 20+ messages and isn't already being compacted, triggers `compactHistory()`
   - Uses a `compactingChannels` Set as a debounce to prevent concurrent compaction

2. **`compactHistory()` function:**
   - Takes the oldest messages (everything except the last 10)
   - Sends them to the LLM with a system prompt asking for 3-5 bullet point summary
   - Replaces the full history with: `[summary entry] + [last 10 messages]`
   - Summary entry is tagged with `role: "system", name: "summary"` so the LLM knows it's compressed context

### Why

Without compaction, channels hit `MAX_HISTORY` and old messages just get dropped (`.shift()`). This means the bot loses context about decisions made earlier in the conversation. With compaction, the key information is preserved in a summary while keeping token usage reasonable.

---

## Task 7: Lifecycle Reactions (P2)

### What changed

Added visual feedback for bot processing stages via Discord emoji reactions:

1. **Tool execution reaction:** When a tool is invoked during LLM processing, the bot reacts with ⚙️ on the source message:
   ```js
   if (sourceMessage) { try { await sourceMessage.react("⚙️"); } catch {} }
   ```

2. **Cleanup on completion:** After the bot finishes responding, it removes both the thinking emoji and the ⚙️ emoji:
   ```js
   for (const emojiName of [MY_PROFILE.thinkingEmoji, "⚙️"]) {
     const r = message.reactions.cache.find(
       (r) => r.emoji.name === emojiName && r.users.cache.has(client.user.id)
     );
     if (r) await r.users.remove(client.user.id);
   }
   ```

3. **sourceMessage parameter** added to `callLLM()` signature so the tool execution code has access to the original Discord message for reacting.

### Why

Users see the bot's thinking emoji but had no visibility into whether tools were being called. The ⚙️ reaction gives real-time feedback that the bot is executing a CLI command (wallet check, forum post, etc.), making the experience less "is it stuck?" and more "oh it's doing something."

---

## Task 8: Channel Topics as LLM Context (P2)

### What changed

Updated `buildSystemPrompt()` to accept a `channel` parameter and inject the channel's topic into the system prompt:

```js
async function buildSystemPrompt(persona, channelId, isFromFounder, channel = null) {
  let ctx = persona;
  if (channel?.topic) {
    ctx += `\nChannel topic: ${channel.topic}\n`;
  }
  // ... rest of prompt building
}
```

The message handler passes `message.channel` through:
```js
const systemPrompt = await buildSystemPrompt(persona, channelId, isFounder(message.author.id), message.channel);
```

### Why

Discord channel topics are a natural place to put behavioral hints (e.g., "#alerts — security events only, be concise" or "#general — casual conversation"). Without this, the bot had no awareness of what each channel was for and would respond the same way everywhere. Now the topic becomes part of the system prompt, so the LLM can adjust its tone and focus per-channel.

---

## Files Modified

| File | Tasks |
|------|-------|
| `shared/packages/discord-bot/bot.mjs` | 1a, 1b, 1c, 1d, 1e, 5, 6, 7, 8 |
| `sentinel/SOUL.md` | 2 |
| `arbiter/SOUL.md` | 2 |
| `steward/SOUL.md` | 2 |
| `shared/Dockerfile` | 4 |

## Files NOT Modified (confirmed already handled)

| File | Reason |
|------|--------|
| `shared/scripts/cron-lock.sh` | Already exists and works correctly |
| `sentinel/crontab` | Already wraps all jobs with cron-lock.sh |
| `arbiter/crontab` | Already wraps all jobs with cron-lock.sh |
| `steward/crontab` | Already wraps all jobs with cron-lock.sh |
| All 10 cron scripts in `shared/cron/` | Locking handled at crontab level, not script level |
