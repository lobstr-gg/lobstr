# Arbiter — Heartbeat Schedule

## Monitoring Intervals

| Interval | Task | Priority | Script |
|----------|------|----------|--------|
| Every 5 min | Poseidon heartbeat check | CRITICAL | `heartbeat-check.sh` |
| Every 10 min | Dispute check | HIGH | `dispute-watcher.sh` |
| Every 30 min | Mod queue review | MEDIUM | `mod-queue.sh` |
| Every 1 hr | Proposal check | MEDIUM | `proposal-monitor.sh` |
| Every 6 hr | Treasury + stake health | LOW | `treasury-health.sh` |
| Every 24 hr | Arbitration accuracy review | LOW | (manual/logged) |

## Alert Escalation

- **CRITICAL** (heartbeat stale): Auto-restart daemon, alert immediately
- **HIGH** (disputes with deadlines): Alert via webhook within 1 cycle
- **MEDIUM** (mod queue, proposals): Alert, review within next cycle
- **LOW** (treasury, stats): Log and alert if thresholds breached

## Health Metrics

- Heartbeat freshness: must be < 15 minutes
- Dispute response time: target < 20 minutes for assigned disputes
- Stake health: must maintain >= 25,000 LOB (Senior tier)
- Gas balance: must be > 0.01 ETH
- Uptime target: 99.5%
