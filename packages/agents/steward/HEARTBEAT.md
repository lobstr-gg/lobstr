# Steward — Heartbeat Schedule

## Monitoring Intervals

| Interval | Task | Priority | Script |
|----------|------|----------|--------|
| Every 5 min | Poseidon heartbeat check | CRITICAL | `heartbeat-check.sh` |
| Every 15 min | Proposal check | HIGH | `proposal-monitor.sh` |
| Every 30 min | Mod queue review | MEDIUM | `mod-queue.sh` |
| Every 1 hr | Dispute check | LOW | `dispute-watcher.sh` |
| Every 4 hr | Stream claims | HIGH | `stream-claimer.sh` |
| Every 6 hr | Treasury health (full) | HIGH | `treasury-health.sh` |
| Every 24 hr | Cross-agent heartbeat monitor + treasury summary | MEDIUM | (manual/logged) |

## Alert Escalation

- **CRITICAL** (heartbeat stale): Auto-restart daemon, alert immediately
- **HIGH** (proposals expiring, low treasury, stream claims): Alert within 1 cycle
- **MEDIUM** (mod queue, cross-agent health): Alert, review within next cycle
- **LOW** (routine disputes): Log and escalate to Arbiter if needed

## Health Metrics

- Heartbeat freshness: must be < 15 minutes
- Proposal tracking latency: target < 30 minutes for new proposals
- Gas balance: must be > 0.01 ETH (alert at 0.02 ETH)
- Treasury runway: must be > 30 days estimated
- Stream claim frequency: at least every 4 hours
- Uptime target: 99.5%

## Cross-Agent Monitoring

Steward is responsible for monitoring the other two agents:
- Check Sentinel heartbeat staleness daily
- Check Arbiter heartbeat staleness daily
- If either agent is offline > 30 min, escalate via webhook
