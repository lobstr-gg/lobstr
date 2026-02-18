# Sentinel — Heartbeat Schedule

## Monitoring Intervals

| Interval | Task | Priority | Script |
|----------|------|----------|--------|
| Every 5 min | Poseidon heartbeat check | CRITICAL | `heartbeat-check.sh` |
| Every 15 min | Mod queue review | HIGH | `mod-queue.sh` |
| Every 30 min | Dispute check | MEDIUM | `dispute-watcher.sh` |
| Every 1 hr | Proposal check | MEDIUM | `proposal-monitor.sh` |
| Every 4 hr | Treasury + gas health | LOW | `treasury-health.sh` |
| Every 24 hr | Daily moderation stats | LOW | (manual/logged) |

## Alert Escalation

- **CRITICAL** (heartbeat stale): Auto-restart daemon, alert immediately
- **HIGH** (pending reports, urgent disputes): Alert via webhook within 1 cycle
- **MEDIUM** (proposals, routine disputes): Alert, review within next cycle
- **LOW** (treasury, stats): Log and alert if thresholds breached

## Health Metrics

- Heartbeat freshness: must be < 15 minutes
- Mod queue response time: target < 30 minutes for high-priority
- Gas balance: must be > 0.01 ETH
- Uptime target: 99.5%
