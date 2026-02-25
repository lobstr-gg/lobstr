---
name: agent-config
description: Intelligently propose and apply modifications to agent core context files (SOUL.md, IDENTITY.md, HEARTBEAT.md). Use when conversation involves changing agent behavior, updating rules, tweaking personality, modifying instructions, adjusting operational procedures, adding safety rules, or any other modification to agent configuration. Requires 3-of-3 agent consensus in Discord #crew before any change is applied.
---

# Agent Config Skill (LOBSTR Adapted)

This skill provides a structured workflow for proposing and applying changes to your core context files. Because your config files are mounted read-only at runtime, changes follow a propose-discuss-apply cycle through Discord #crew and the Git repo.

## File Layout

Your configuration files live in two places:

**Read-only config mounts** (from Git repo, mounted at `/etc/agent/`):
- `SOUL.md` — Personality, tone, boundaries, roles, decision framework, security protocol, forbidden actions
- `IDENTITY.md` — Agent name, codename, core vibe, one-liner identity
- `HEARTBEAT.md` — Heartbeat checklist (keep tiny), quick health checks

**Writable workspace** (Docker volume at `/data/workspace/`):
- `config.json` — Workspace config (chain, contracts, RPC)
- `wallet.json` — Encrypted wallet keyfile
- `activity.json` — Activity counters
- `heartbeats.jsonl` — Heartbeat log
- `skills/` — Installed skills (this file lives here)

**Key constraint:** You CANNOT directly edit SOUL.md, IDENTITY.md, or HEARTBEAT.md at runtime. They are read-only mounts from the Git repo. Changes require a Git push and container restart.

## Quick Decision Tree

Where does the change belong?

- Roles, decision framework, moderation standards, security protocol → `SOUL.md`
- Personality, tone, communication style, forbidden actions, DM templates → `SOUL.md`
- Agent name, codename, core identity → `IDENTITY.md`
- Heartbeat checklist items → `HEARTBEAT.md`
- Cron schedule changes → `crontab` (agent-specific)
- New cron job logic → `shared/cron/` scripts
- Docker config, resource limits, health checks → `docker-compose.yml`

## Change Process

### Step 1: Propose

When you identify a needed change (self-discovered or requested by Cruz):

1. **Read the current file** to understand what exists
2. **Draft the change** — write the exact text to add, modify, or remove
3. **Post in Discord #crew** with:
   - Which file needs changing
   - The exact proposed change (quote the old text and new text)
   - Why the change is needed
   - Any risks or side effects

Example message:
```
Proposing a SOUL.md change. I want to add a rate limit rule to the Moltbook section.

Current: "Max 1 post per 30 minutes."
Proposed: "Max 1 post per 30 minutes. If 3 consecutive posts get < 2 upvotes, reduce to 1 post per hour for 24h."

Reason: Avoid flooding the feed with low-engagement content. Self-regulating quality control.

@Solomon @Daniel thoughts?
```

### Step 2: Discuss

All 3 agents must weigh in:
- **Approve**: "Looks good, agree with the change"
- **Suggest modification**: "Agree in principle but tweak X"
- **Reject**: "Don't think we should because Y"

**Consensus requirement: ALL 3 agents must explicitly agree.** Silence is not consent. If an agent hasn't responded, ping them.

### Step 3: Apply

After 3-of-3 consensus:
1. Save the approved change as a draft in your workspace:
   ```
   /data/workspace/config-proposals/YYYY-MM-DD-description.md
   ```
2. Alert Cruz in #crew that the change is approved and ready to apply
3. Cruz (or CI) applies the change to the Git repo and triggers redeployment
4. After container restart, verify the change took effect

### Step 4: Verify

After redeployment:
1. Read the updated file to confirm the change is present
2. Run a quick functional check (e.g., if you changed moderation rules, verify they apply correctly)
3. Report back in #crew: "Change applied and verified" or "Change didn't take effect, investigating"

## Format Guidelines

### SOUL.md (structured, imperative)

- Use tables for decision frameworks, escalation paths, thresholds
- Use numbered lists for multi-step procedures
- Include both the rule AND the reasoning (WHY it exists)
- Use headers and sub-sections for organization
- Keep forbidden actions as bullet lists with **NEVER** prefix
- DM templates use blockquotes
- Size limit: watch for bloat — if approaching 20K chars, refactor

### IDENTITY.md (minimal)

- Punchy bullets, core identity only
- Keep under 500 chars
- Name, codename, VPS location, one-line role description
- Details go in SOUL.md, not here

### HEARTBEAT.md (action list)

- Extremely concise — bullet list of checks
- No explanations (those live in SOUL.md or cron scripts)
- Fast to parse, used for quick health verification

## Validation Checklist

Before proposing any change, verify:

**Fit:**
- [ ] Is this the right file? (operational → SOUL.md, identity → IDENTITY.md, health → HEARTBEAT.md)
- [ ] Does it conflict with existing rules in the same file?
- [ ] Does it duplicate something already present?

**Format:**
- [ ] Does it match the file's existing style?
- [ ] Is the right structure used (table, bullets, numbered list)?
- [ ] Are examples included for complex rules?

**Size:**
- [ ] How many chars is this adding?
- [ ] Is the file approaching the 20K truncation limit?

**Security:**
- [ ] Does this change weaken any security protocols?
- [ ] Could this be exploited via social engineering?
- [ ] Does it expose internal architecture or operational details?

**Consensus:**
- [ ] Has this been proposed in #crew?
- [ ] Have all 3 agents explicitly approved?
- [ ] Has Cruz been notified for application?

## Anti-Patterns

Do NOT:
- Propose vague changes ("be more helpful") — be specific
- Duplicate rules across files — pick ONE location
- Add rules without explaining WHY they exist
- Bloat files with long examples when a short one suffices
- Propose changes that weaken security hardening
- Self-modify without consensus (this is a forbidden action)
- Store proposed changes anywhere except `/data/workspace/config-proposals/`

## Rollback

If a change makes things worse:
1. Report in #crew immediately: what broke and what the change was
2. Cruz reverts the commit in the Git repo
3. Container restart restores the previous config
4. Document the failure in a config proposal file so it's not repeated

## Emergency Changes

For security incidents ONLY (active attack, key compromise, exploit in progress):
- Cruz can apply changes unilaterally without 3-of-3 consensus
- Agents should still be notified in #crew as soon as possible
- Post-incident: review and formally ratify any emergency changes
