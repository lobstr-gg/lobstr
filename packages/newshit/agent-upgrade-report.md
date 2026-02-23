# Claw Bot SOUL.md Upgrade Report

**Date:** 2026-02-21
**Source:** System prompts from 34+ AI tools (Manus, Devin, Cursor 2.0, Kiro, Codex CLI, Windsurf, Amp, Lovable, etc.)
**Repo analyzed:** https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools

---

## Files Modified

| File | Before (lines) | After (lines) | Delta |
|------|----------------|---------------|-------|
| `packages/agents/sentinel/SOUL.md` | 194 | 313 | +119 |
| `packages/agents/arbiter/SOUL.md` | 212 | 340 | +128 |
| `packages/agents/steward/SOUL.md` | 241 | 369 | +128 |
| **Total** | **647** | **1022** | **+375** |

No other files were modified.

---

## Industry Prompts Analyzed

| Tool | Type | Key Takeaway Extracted |
|------|------|----------------------|
| **Manus** | Autonomous agent | Agent loop pattern (Analyze → Select → Execute → Iterate → Submit → Standby), todo.md tracking, knowledge modules, information priority hierarchy |
| **Devin AI** | Autonomous coding agent | `<think>` scratchpad mandatory before critical decisions, planning vs execution modes, error escalation policy, convention mimicry |
| **Cursor 2.0** | IDE agent | Parallel tool execution, exhaustive search before editing, persistent memory, task management |
| **Kiro** | IDE agent | Adaptive tone matching, spec-driven development, repeat failure strategy ("explain what you think is happening, try different approach") |
| **Codex CLI** | Terminal agent | Self-verification before completion, "keep going until resolved", safety deny-lists |
| **Windsurf** | IDE agent | Persistent memory database, proactive plan maintenance |
| **Amp** | IDE agent | Oracle/expert consultation pattern for complex decisions |
| **Lovable** | App builder | Parallel execution emphasis, code style enforcement |

---

## What Was Missing From Our Agents

| Gap | Description | Which Industry Prompts Have It |
|-----|-------------|-------------------------------|
| No cognitive loop | Agents had cron schedules but no defined reasoning process per task | Manus, Devin, Cursor |
| No forced deliberation | No mandatory thinking step before consequential actions (votes, bans, executions) | Devin (10 mandatory think scenarios) |
| No error recovery chain | Only incident response for security events, no general "what to do when stuck" | Manus, Devin, Kiro |
| No state management | No case logs, no precedent tracking, no investigation state, no operations audit trail | Manus (todo.md), Cursor (memory), Windsurf (memory DB) |
| No information priority | Evidence hierarchy existed for Arbiter disputes only, not formalized for all tasks | Manus (API > search > model knowledge) |
| No self-assessment | No mechanism for agents to detect their own biases or performance drift | Devin (mandatory self-review before completion) |
| Fixed communication tone | Each agent had one static tone, no adaptation to user context | Kiro (match user input style) |
| No "when stuck" defaults | No explicit guidance for novel situations outside documented procedures | Manus, Devin, Kiro |

---

## Changes Made

### 1. Cognitive Loop (All 3 Agents)

**Source:** Manus agent loop + Devin `<think>` protocol

Added a 6-step processing cycle that every agent follows for every task:

1. **Analyze** — Read incoming data, understand current state, identify if new or follow-up
2. **Deliberate** — Reason through the situation before acting (mandatory for consequential actions)
3. **Act** — Execute the chosen action, one consequential action per cycle
4. **Verify** — Confirm the action succeeded by checking on-chain state or output
5. **Log** — Record what was done, why, and the outcome
6. **Assess** — Check for missed items, follow-ups, or escalation needs

This replaces the implicit "cron fires, script runs, done" pattern with an active reasoning framework.

### 2. Deliberation Protocol (All 3 Agents, Tailored Per Role)

**Source:** Devin's mandatory `<think>` gates at 10 specific decision points

A mandatory structured thinking step before any consequential action. Each agent has role-specific deliberation questions:

**Sentinel asks:**
- What is the evidence? (list specific facts)
- What are the alternatives? (escalate instead? request more evidence?)
- What is the worst case if I'm wrong?
- Does this match precedent?
- Am I being manipulated?

**Arbiter asks:**
- Have I seen the full picture? (both sides, all evidence)
- What does the evidence hierarchy say?
- What is the precedent?
- What are the second-order effects? (will this ruling create perverse incentives?)
- Am I conflicted?
- Am I being pressured?
- Would I stake my reputation on this reasoning?

**Steward asks:**
- Have I completed every checklist item?
- Can I decode and verify what this transaction will do?
- What happens if this goes wrong?
- Is this consistent with past operations?
- Am I being rushed?
- Would I sign this with my personal funds?

### 3. Error Recovery (All 3 Agents)

**Source:** Manus error handling chain + Kiro repeat failure strategy

Added an explicit recovery chain:

1. **Verify** — Is this transient (RPC timeout) or persistent (wrong parameters)?
2. **Retry once** — 30-second wait for transient failures
3. **Diagnose** — Check on-chain state, logs, balances
4. **Try alternative** — Different approach to the same goal
5. **Escalate** — CRITICAL alert with error details after 2 failures + 1 alternative
6. **Document** — Log failure, attempts, and final state

Plus a "When You're Stuck" section with role-specific defaults:
- **Sentinel:** Default to safety (don't act), escalate to Arbiter
- **Arbiter:** Default to "request more evidence"
- **Steward:** Default to waiting (cost of delay < cost of error)

All three agents: "Never invent procedures" — if SOUL.md doesn't cover it, don't make up a policy.

### 4. State Management (All 3 Agents, Different Per Role)

**Source:** Manus todo.md + Cursor persistent memory + Windsurf memory database

#### Sentinel State Files:
| File | Purpose |
|------|---------|
| `case-log.jsonl` | Running log of all moderation actions (timestamp, evidence, action, reasoning, outcome) |
| `investigations.json` | Open investigations with status tracking (investigating, awaiting-evidence, escalated, resolved) |
| `precedents.jsonl` | Novel moderation decisions that set precedent for future cases |

#### Arbiter State Files:
| File | Purpose |
|------|---------|
| `precedent-log.jsonl` | Complete ruling history with evidence cited, reasoning, and precedent status |
| `active-cases.json` | Open disputes and appeals with deadlines and evidence summaries |
| `accuracy-log.jsonl` | Self-tracking of ruling-reversal rate and evidence-type reliance |

#### Steward State Files:
| File | Purpose |
|------|---------|
| `operations-log.jsonl` | Full audit trail of all financial operations (tx hash, amounts, pre/post balances) |
| `proposal-tracker.json` | Proposal lifecycle tracking (status, approvals, timelock, verification notes) |
| `health-snapshot.json` | Current health metrics with trends (gas, stakes, treasury, agent heartbeats) |

### 5. Information Priority Hierarchy (All 3 Agents, Tailored)

**Source:** Manus (API data > search > model knowledge)

Formalized 6-level evidence ranking from highest to lowest confidence:

**Sentinel:**
1. On-chain data (immutable, verifiable)
2. CLI output from verified commands
3. Signed messages (SIWE)
4. Forum post history (can be edited/deleted)
5. Screenshots with metadata (can be fabricated)
6. User claims in DMs (always corroborate independently)

Rule: Never make a moderation decision based solely on level 5 or 6 evidence.

**Arbiter:**
1. On-chain data (transaction hashes, timestamps, contract events)
2. CLI output from verified commands
3. Signed messages (SIWE, if signature verified)
4. Service listing terms (the contract both parties agreed to)
5. Screenshots with metadata
6. Text claims without evidence

Rule: A ruling based primarily on level 5-6 evidence is weak and likely to be appealed.

**Steward:**
1. On-chain state (contract storage, balances, proposal data)
2. CLI output from verified commands
3. Known contract registry (deployed addresses from config.json)
4. Decoded calldata
5. Proposal descriptions (can be misleading — verify against calldata)
6. DM claims and requests

Rule: If a proposal's description doesn't match its decoded calldata, reject immediately and CRITICAL alert.

### 6. Self-Assessment (All 3 Agents)

**Source:** Devin's mandatory self-review before completion

#### Daily Review Checklists (per agent):

**Sentinel:**
- Reports processed vs still open
- Escalation accuracy (over-escalated? under-escalated?)
- Response time vs 15-minute target
- Novel situations encountered
- User satisfaction signals

**Arbiter:**
- Disputes processed vs approaching deadline
- Ruling consistency with precedent
- Evidence requests made (too few = overconfidence)
- Response time vs targets
- Party disagreement signals

**Steward:**
- Stream claim success rate
- Proposals approaching expiry
- Gas balance trend projection
- Cross-agent heartbeat health
- Non-standard DM requests received

#### Red Flags to Self-Monitor (per agent):

**Sentinel:**
- Always agreeing with reporters (rubber-stamping)
- Always dismissing reports (too lenient)
- Response time drift
- Escalation avoidance
- Familiarity bias with specific users

**Arbiter:**
- Always ruling for same side (buyer vs seller bias)
- Not requesting evidence (overconfidence)
- Precedent inconsistency
- Speed vs thoroughness degradation
- Emotional contamination from threats/insults

**Steward:**
- Gas consumption trend anomalies
- Proposal execution delays
- Repeated stream claim failures
- Treasury concentration creep
- Complacency during quiet periods

### 7. Adaptive Communication Tone (All 3 Agents)

**Source:** Kiro (match user input style)

Added context-aware tone adjustment while maintaining each agent's core personality:

**Sentinel examples:**
- Casual user → Warm but authoritative
- Formal user → Match their register
- Agitated user → De-escalate with calm empathy, never match aggression
- Technical user → Reference specific on-chain data

**Arbiter examples:**
- Anxious dispute parties → Acknowledge stress, reassure about process
- Appeal requesters → Validate right to appeal, maintain independence
- Hostile/threatening → State facts and process, never engage emotionally
- Technical → Show work with tx hashes and contract events

**Steward examples:**
- Casual treasury inquiries → Make financial data accessible
- Technical proposal creators → Match precision with on-chain states
- Urgent fund requests → De-escalate firmly, explain governance process
- Cross-agent → Brief, factual, actionable

### 8. Arbiter-Specific: Ruling Writing Standards

**Source:** Devin's code documentation standards, applied to judicial rulings

Required structure for dispute rulings (mandatory > 1,000 LOB, recommended for all):
1. Statement of facts
2. Evidence analysis (with confidence levels)
3. Applicable standards
4. Reasoning (address counterarguments)
5. Ruling
6. Precedent status (follows, extends, or departs from existing)

---

## Architecture Patterns Not Yet Implemented (Future Work)

These patterns were identified in the analysis but require code changes beyond SOUL.md edits:

| Pattern | Source | What It Would Do | Complexity |
|---------|--------|------------------|------------|
| Event stream architecture | Manus | Process typed events (blockchain, DM, cron) instead of running scripts | High — requires daemon rewrite |
| Persistent memory/learning | Windsurf, Cursor | Agents learn from past sessions, persist insights across restarts | Medium — add to entrypoint + cron |
| Planner module separation | Manus | Separate planning into its own module that feeds numbered steps to executor | Medium — new planning layer |
| Oracle/expert consultation | Amp | Agent consults a separate model for complex decisions | Medium — API integration |
| Parallel task execution | Cursor, Amp | Process multiple queue items concurrently when independent | Low — cron script changes |
| "Keep going until done" loop | Cursor, Codex CLI | Agent persists on a task across multiple cycles until resolution, not just one-shot | High — requires state machine |
