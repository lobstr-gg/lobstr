# LOBSTR Protocol — Dune Analytics Playbook

> On-chain analytics for the LOBSTR marketplace + payment protocol on Base.
> All queries target **Base mainnet (chain_id = 8453)**.

---

## Contract Addresses (Base Mainnet)

| Contract | Address |
|----------|---------|
| LOBToken | `0x7FaeC2536E2Afee56AcA568C475927F1E2521B37` |
| ReputationSystem | `0xc1374611FB7c6637e30a274073e7dCFf758C76FC` |
| StakingManager | `0x0c5bC27a3C3Eb7a836302320755f6B1645C49291` |
| TreasuryGovernor | `0x9576dcf9909ec192FC136A12De293Efab911517f` |
| SybilGuard | `0xF43E6698cAAf3BFf422137F20541Cd24dfB3ff07` |
| ServiceRegistry | `0xa127B684935f1D24C7236ba1FbB3FF140F4eD3C3` |
| DisputeArbitration | `0x00Ad7d299F4BF3aE8372f756b86B4dAf63eC3FAa` |
| EscrowEngine | `0xBB57d0D0aB24122A87c9a28acdc242927e6189E0` |
| Groth16Verifier | `0xfc0563332c3d0969a706E1d55f3d576F1a4c0F04` |
| AirdropClaimV2 | `0x349790d7f56110765Fccd86790B584c423c0BaA9` |

---

## Event Signatures (for raw log decoding)

Key event topic0 hashes used across queries:

```
-- StakingManager
Staked:           0x9e71bc8eea02a63969f509818f2dafb9254532904319f9dbda79b67bd34a5f3d
UnstakeRequested: keccak256("UnstakeRequested(address,uint256,uint256)")
Unstaked:         keccak256("Unstaked(address,uint256,uint8)")
Slashed:          keccak256("Slashed(address,uint256,address)")
TierChanged:      keccak256("TierChanged(address,uint8,uint8)")

-- EscrowEngine
JobCreated:       keccak256("JobCreated(uint256,uint256,address,address,uint256,address,uint256)")
DeliverySubmitted: keccak256("DeliverySubmitted(uint256,string)")
DeliveryConfirmed: keccak256("DeliveryConfirmed(uint256,address)")
AutoReleased:     keccak256("AutoReleased(uint256,address)")
FundsReleased:    keccak256("FundsReleased(uint256,address,uint256)")

-- DisputeArbitration
DisputeCreated:   keccak256("DisputeCreated(uint256,uint256,address,address,uint256)")
VoteCast:         keccak256("VoteCast(uint256,address,bool)")
RulingExecuted:   keccak256("RulingExecuted(uint256,uint8)")

-- ServiceRegistry
ListingCreated:   keccak256("ListingCreated(uint256,address,uint8,uint256,address)")

-- SybilGuard
AddressBanned:    keccak256("AddressBanned(address,uint8,uint256,uint256)")
FundsSeized:      keccak256("FundsSeized(address,address,uint256,uint256)")

-- TreasuryGovernor
ProposalExecuted: keccak256("ProposalExecuted(uint256,address,uint256)")
FundsReceived:    keccak256("FundsReceived(address,address,uint256)")
StreamCreated:    keccak256("StreamCreated(uint256,address,address,uint256,uint256,uint256,string)")

-- ReputationSystem
CompletionRecorded: keccak256("CompletionRecorded(address,address)")
ScoreUpdated:     keccak256("ScoreUpdated(address,uint256,uint8)")

-- AirdropClaimV2
AirdropClaimed:   keccak256("AirdropClaimed(address,uint256,uint256,uint8)")
VestedTokensReleased: keccak256("VestedTokensReleased(address,uint256)")
```

---

## Enum Reference

```
-- StakingManager.Tier
0 = None, 1 = Bronze, 2 = Silver, 3 = Gold, 4 = Platinum

-- ReputationSystem.ReputationTier
0 = Bronze, 1 = Silver, 2 = Gold, 3 = Platinum

-- ServiceRegistry.ServiceCategory
0 = DATA_SCRAPING, 1 = TRANSLATION, 2 = WRITING, 3 = CODING,
4 = RESEARCH, 5 = DESIGN, 6 = MARKETING, 7 = LEGAL,
8 = FINANCE, 9 = PHYSICAL_TASK, 10 = OTHER

-- DisputeArbitration.ArbitratorRank
0 = None, 1 = Junior, 2 = Senior, 3 = Principal

-- DisputeArbitration.Ruling
0 = Pending, 1 = BuyerWins, 2 = SellerWins, 3 = Draw

-- SybilGuard.ViolationType
0 = SybilCluster, 1 = SelfDealing, 2 = CoordinatedVoting,
3 = ReputationFarming, 4 = MultisigAbuse, 5 = StakeManipulation,
6 = EvidenceFraud, 7 = IdentityFraud

-- AirdropClaimV2.AttestationTier
0 = New, 1 = Active, 2 = PowerUser
```

---

## Dashboard 1: Staking & SybilGuard

### 1.1 Total $LOB Staked (TVL)

```sql
-- Net staked LOB over time (running cumulative)
WITH stake_events AS (
  SELECT
    block_time,
    bytearray_to_uint256(bytearray_substring(data, 1, 32)) / 1e18 AS amount,
    'stake' AS action
  FROM base.logs
  WHERE contract_address = 0x0c5bC27a3C3Eb7a836302320755f6B1645C49291
    AND topic0 = 0x9e71bc8eea02a63969f509818f2dafb9254532904319f9dbda79b67bd34a5f3d -- Staked

  UNION ALL

  SELECT
    block_time,
    -1.0 * bytearray_to_uint256(bytearray_substring(data, 1, 32)) / 1e18 AS amount,
    'unstake' AS action
  FROM base.logs
  WHERE contract_address = 0x0c5bC27a3C3Eb7a836302320755f6B1645C49291
    AND topic0 = keccak256('Unstaked(address,uint256,uint8)')

  UNION ALL

  SELECT
    block_time,
    -1.0 * bytearray_to_uint256(bytearray_substring(data, 1, 32)) / 1e18 AS amount,
    'slash' AS action
  FROM base.logs
  WHERE contract_address = 0x0c5bC27a3C3Eb7a836302320755f6B1645C49291
    AND topic0 = keccak256('Slashed(address,uint256,address)')
)

SELECT
  date_trunc('day', block_time) AS day,
  SUM(amount) AS daily_net,
  SUM(SUM(amount)) OVER (ORDER BY date_trunc('day', block_time)) AS cumulative_tvl
FROM stake_events
GROUP BY 1
ORDER BY 1
```

### 1.2 Stakers by Tier (Current Distribution)

```sql
-- Latest tier for each staker
WITH tier_changes AS (
  SELECT
    bytearray_ltrim(topic1) AS user_address,
    bytearray_to_uint256(bytearray_substring(data, 33, 32)) AS new_tier,
    block_time,
    ROW_NUMBER() OVER (PARTITION BY topic1 ORDER BY block_number DESC, log_index DESC) AS rn
  FROM base.logs
  WHERE contract_address = 0x0c5bC27a3C3Eb7a836302320755f6B1645C49291
    AND topic0 = keccak256('TierChanged(address,uint8,uint8)')
)

SELECT
  CASE new_tier
    WHEN 0 THEN 'None'
    WHEN 1 THEN 'Bronze'
    WHEN 2 THEN 'Silver'
    WHEN 3 THEN 'Gold'
    WHEN 4 THEN 'Platinum'
  END AS tier,
  COUNT(*) AS staker_count
FROM tier_changes
WHERE rn = 1 AND new_tier > 0
GROUP BY new_tier
ORDER BY new_tier
```

### 1.3 Sybil Reports & Bans

```sql
-- Sybil activity overview
SELECT
  date_trunc('week', block_time) AS week,
  COUNT(CASE WHEN topic0 = keccak256('ReportCreated(uint256,address,uint8,address[],string)') THEN 1 END) AS reports_created,
  COUNT(CASE WHEN topic0 = keccak256('ReportConfirmed(uint256,address)') THEN 1 END) AS reports_confirmed,
  COUNT(CASE WHEN topic0 = keccak256('AddressBanned(address,uint8,uint256,uint256)') THEN 1 END) AS addresses_banned,
  COUNT(CASE WHEN topic0 = keccak256('AddressUnbanned(address,address)') THEN 1 END) AS addresses_unbanned
FROM base.logs
WHERE contract_address = 0xF43E6698cAAf3BFf422137F20541Cd24dfB3ff07
GROUP BY 1
ORDER BY 1
```

### 1.4 Seized Funds (SybilGuard → Treasury)

```sql
SELECT
  block_time,
  bytearray_ltrim(topic1) AS banned_account,
  bytearray_ltrim(topic2) AS token,
  bytearray_to_uint256(bytearray_substring(data, 1, 32)) / 1e18 AS amount_seized,
  bytearray_to_uint256(topic3) AS report_id
FROM base.logs
WHERE contract_address = 0xF43E6698cAAf3BFf422137F20541Cd24dfB3ff07
  AND topic0 = keccak256('FundsSeized(address,address,uint256,uint256)')
ORDER BY block_time DESC
```

### 1.5 Violation Type Breakdown

```sql
SELECT
  CASE bytearray_to_uint256(bytearray_substring(data, 1, 32))
    WHEN 0 THEN 'Sybil Cluster'
    WHEN 1 THEN 'Self-Dealing'
    WHEN 2 THEN 'Coordinated Voting'
    WHEN 3 THEN 'Reputation Farming'
    WHEN 4 THEN 'Multisig Abuse'
    WHEN 5 THEN 'Stake Manipulation'
    WHEN 6 THEN 'Evidence Fraud'
    WHEN 7 THEN 'Identity Fraud'
  END AS violation_type,
  COUNT(*) AS ban_count
FROM base.logs
WHERE contract_address = 0xF43E6698cAAf3BFf422137F20541Cd24dfB3ff07
  AND topic0 = keccak256('AddressBanned(address,uint8,uint256,uint256)')
GROUP BY 1
ORDER BY ban_count DESC
```

---

## Dashboard 2: Escrow & Job Marketplace

### 2.1 Daily Job Volume & Escrow Value

```sql
WITH jobs AS (
  SELECT
    block_time,
    bytearray_to_uint256(topic1) AS job_id,
    bytearray_to_uint256(topic2) AS listing_id,
    bytearray_ltrim(topic3) AS buyer,
    bytearray_to_uint256(bytearray_substring(data, 33, 32)) / 1e18 AS amount,
    bytearray_ltrim(bytearray_substring(data, 65, 32)) AS token,
    bytearray_to_uint256(bytearray_substring(data, 97, 32)) / 1e18 AS fee
  FROM base.logs
  WHERE contract_address = 0xBB57d0D0aB24122A87c9a28acdc242927e6189E0
    AND topic0 = keccak256('JobCreated(uint256,uint256,address,address,uint256,address,uint256)')
)

SELECT
  date_trunc('day', block_time) AS day,
  COUNT(*) AS jobs_created,
  SUM(amount) AS total_escrow_value,
  SUM(fee) AS total_fees_collected,
  COUNT(DISTINCT buyer) AS unique_buyers
FROM jobs
GROUP BY 1
ORDER BY 1
```

### 2.2 Job Lifecycle Funnel

```sql
-- Track jobs through their lifecycle stages
SELECT
  'Created' AS stage,
  COUNT(*) AS count
FROM base.logs
WHERE contract_address = 0xBB57d0D0aB24122A87c9a28acdc242927e6189E0
  AND topic0 = keccak256('JobCreated(uint256,uint256,address,address,uint256,address,uint256)')

UNION ALL

SELECT 'Delivery Submitted', COUNT(*)
FROM base.logs
WHERE contract_address = 0xBB57d0D0aB24122A87c9a28acdc242927e6189E0
  AND topic0 = keccak256('DeliverySubmitted(uint256,string)')

UNION ALL

SELECT 'Confirmed by Buyer', COUNT(*)
FROM base.logs
WHERE contract_address = 0xBB57d0D0aB24122A87c9a28acdc242927e6189E0
  AND topic0 = keccak256('DeliveryConfirmed(uint256,address)')

UNION ALL

SELECT 'Auto-Released', COUNT(*)
FROM base.logs
WHERE contract_address = 0xBB57d0D0aB24122A87c9a28acdc242927e6189E0
  AND topic0 = keccak256('AutoReleased(uint256,address)')

UNION ALL

SELECT 'Disputed', COUNT(*)
FROM base.logs
WHERE contract_address = 0xBB57d0D0aB24122A87c9a28acdc242927e6189E0
  AND topic0 = keccak256('DisputeInitiated(uint256,uint256,string)')
```

### 2.3 Payment Token Split ($LOB vs USDC/ETH)

```sql
WITH jobs AS (
  SELECT
    bytearray_ltrim(bytearray_substring(data, 65, 32)) AS token,
    bytearray_to_uint256(bytearray_substring(data, 33, 32)) / 1e18 AS amount,
    bytearray_to_uint256(bytearray_substring(data, 97, 32)) / 1e18 AS fee
  FROM base.logs
  WHERE contract_address = 0xBB57d0D0aB24122A87c9a28acdc242927e6189E0
    AND topic0 = keccak256('JobCreated(uint256,uint256,address,address,uint256,address,uint256)')
)

SELECT
  CASE
    WHEN token = 0x7FaeC2536E2Afee56AcA568C475927F1E2521B37 THEN '$LOB (0% fee)'
    WHEN token = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 THEN 'USDC (1.5% fee)'
    WHEN token = 0x0000000000000000000000000000000000000000 THEN 'ETH (1.5% fee)'
    ELSE 'Other'
  END AS payment_token,
  COUNT(*) AS job_count,
  SUM(amount) AS total_volume,
  SUM(fee) AS total_fees
FROM jobs
GROUP BY 1
ORDER BY job_count DESC
```

### 2.4 Average Job Completion Time

```sql
WITH created AS (
  SELECT
    bytearray_to_uint256(topic1) AS job_id,
    block_time AS created_at
  FROM base.logs
  WHERE contract_address = 0xBB57d0D0aB24122A87c9a28acdc242927e6189E0
    AND topic0 = keccak256('JobCreated(uint256,uint256,address,address,uint256,address,uint256)')
),
completed AS (
  SELECT
    bytearray_to_uint256(topic1) AS job_id,
    block_time AS completed_at
  FROM base.logs
  WHERE contract_address = 0xBB57d0D0aB24122A87c9a28acdc242927e6189E0
    AND topic0 IN (
      keccak256('DeliveryConfirmed(uint256,address)'),
      keccak256('AutoReleased(uint256,address)')
    )
)

SELECT
  date_trunc('week', c.created_at) AS week,
  AVG(date_diff('hour', c.created_at, d.completed_at)) AS avg_hours_to_complete,
  MEDIAN(date_diff('hour', c.created_at, d.completed_at)) AS median_hours,
  COUNT(*) AS jobs_completed
FROM created c
JOIN completed d ON c.job_id = d.job_id
GROUP BY 1
ORDER BY 1
```

---

## Dashboard 3: Dispute & Arbitration

### 3.1 Dispute Activity Overview

```sql
SELECT
  date_trunc('week', block_time) AS week,
  COUNT(CASE WHEN topic0 = keccak256('DisputeCreated(uint256,uint256,address,address,uint256)') THEN 1 END) AS disputes_created,
  COUNT(CASE WHEN topic0 = keccak256('VoteCast(uint256,address,bool)') THEN 1 END) AS votes_cast,
  COUNT(CASE WHEN topic0 = keccak256('RulingExecuted(uint256,uint8)') THEN 1 END) AS rulings_executed
FROM base.logs
WHERE contract_address = 0x00Ad7d299F4BF3aE8372f756b86B4dAf63eC3FAa
GROUP BY 1
ORDER BY 1
```

### 3.2 Ruling Outcomes Distribution

```sql
SELECT
  CASE bytearray_to_uint256(bytearray_substring(data, 1, 32))
    WHEN 1 THEN 'Buyer Wins'
    WHEN 2 THEN 'Seller Wins'
    WHEN 3 THEN 'Draw (Split)'
  END AS ruling,
  COUNT(*) AS count
FROM base.logs
WHERE contract_address = 0x00Ad7d299F4BF3aE8372f756b86B4dAf63eC3FAa
  AND topic0 = keccak256('RulingExecuted(uint256,uint8)')
GROUP BY 1
ORDER BY count DESC
```

### 3.3 Arbitrator Participation Leaderboard

```sql
SELECT
  bytearray_ltrim(topic2) AS arbitrator,
  COUNT(*) AS total_votes,
  COUNT(CASE WHEN bytearray_to_uint256(bytearray_substring(data, 1, 32)) = 1 THEN 1 END) AS voted_for_buyer,
  COUNT(CASE WHEN bytearray_to_uint256(bytearray_substring(data, 1, 32)) = 0 THEN 1 END) AS voted_for_seller
FROM base.logs
WHERE contract_address = 0x00Ad7d299F4BF3aE8372f756b86B4dAf63eC3FAa
  AND topic0 = keccak256('VoteCast(uint256,address,bool)')
GROUP BY 1
ORDER BY total_votes DESC
LIMIT 50
```

### 3.4 Arbitrator Ranks Distribution

```sql
WITH rank_events AS (
  SELECT
    bytearray_ltrim(topic1) AS arbitrator,
    bytearray_to_uint256(bytearray_substring(data, 33, 32)) AS new_rank,
    ROW_NUMBER() OVER (PARTITION BY topic1 ORDER BY block_number DESC, log_index DESC) AS rn
  FROM base.logs
  WHERE contract_address = 0x00Ad7d299F4BF3aE8372f756b86B4dAf63eC3FAa
    AND topic0 = keccak256('ArbitratorStaked(address,uint256,uint8)')
)

SELECT
  CASE new_rank
    WHEN 1 THEN 'Junior'
    WHEN 2 THEN 'Senior'
    WHEN 3 THEN 'Principal'
  END AS rank,
  COUNT(*) AS arbitrator_count
FROM rank_events
WHERE rn = 1 AND new_rank > 0
GROUP BY new_rank
ORDER BY new_rank
```

### 3.5 Dispute Resolution Time

```sql
WITH created AS (
  SELECT
    bytearray_to_uint256(topic1) AS dispute_id,
    block_time AS created_at
  FROM base.logs
  WHERE contract_address = 0x00Ad7d299F4BF3aE8372f756b86B4dAf63eC3FAa
    AND topic0 = keccak256('DisputeCreated(uint256,uint256,address,address,uint256)')
),
resolved AS (
  SELECT
    bytearray_to_uint256(topic1) AS dispute_id,
    block_time AS resolved_at
  FROM base.logs
  WHERE contract_address = 0x00Ad7d299F4BF3aE8372f756b86B4dAf63eC3FAa
    AND topic0 = keccak256('RulingExecuted(uint256,uint8)')
)

SELECT
  AVG(date_diff('hour', c.created_at, r.resolved_at)) AS avg_resolution_hours,
  MEDIAN(date_diff('hour', c.created_at, r.resolved_at)) AS median_resolution_hours,
  MIN(date_diff('hour', c.created_at, r.resolved_at)) AS fastest_hours,
  MAX(date_diff('hour', c.created_at, r.resolved_at)) AS slowest_hours,
  COUNT(*) AS total_resolved
FROM created c
JOIN resolved r ON c.dispute_id = r.dispute_id
```

---

## Dashboard 4: Reputation & Agent Leaderboard

### 4.1 Top Providers by Completions

```sql
SELECT
  bytearray_ltrim(topic1) AS provider,
  COUNT(*) AS total_completions
FROM base.logs
WHERE contract_address = 0xc1374611FB7c6637e30a274073e7dCFf758C76FC
  AND topic0 = keccak256('CompletionRecorded(address,address)')
GROUP BY 1
ORDER BY total_completions DESC
LIMIT 25
```

### 4.2 Reputation Score Distribution

```sql
WITH latest_scores AS (
  SELECT
    bytearray_ltrim(topic1) AS provider,
    bytearray_to_uint256(bytearray_substring(data, 1, 32)) AS score,
    CASE bytearray_to_uint256(bytearray_substring(data, 33, 32))
      WHEN 0 THEN 'Bronze'
      WHEN 1 THEN 'Silver'
      WHEN 2 THEN 'Gold'
      WHEN 3 THEN 'Platinum'
    END AS tier,
    ROW_NUMBER() OVER (PARTITION BY topic1 ORDER BY block_number DESC, log_index DESC) AS rn
  FROM base.logs
  WHERE contract_address = 0xc1374611FB7c6637e30a274073e7dCFf758C76FC
    AND topic0 = keccak256('ScoreUpdated(address,uint256,uint8)')
)

SELECT
  tier,
  COUNT(*) AS provider_count,
  AVG(score) AS avg_score,
  MIN(score) AS min_score,
  MAX(score) AS max_score
FROM latest_scores
WHERE rn = 1
GROUP BY tier
ORDER BY avg_score DESC
```

### 4.3 Provider Growth Over Time

```sql
-- New unique providers per week
WITH first_activity AS (
  SELECT
    bytearray_ltrim(topic1) AS provider,
    MIN(block_time) AS first_seen
  FROM base.logs
  WHERE contract_address = 0xc1374611FB7c6637e30a274073e7dCFf758C76FC
    AND topic0 = keccak256('CompletionRecorded(address,address)')
  GROUP BY 1
)

SELECT
  date_trunc('week', first_seen) AS week,
  COUNT(*) AS new_providers,
  SUM(COUNT(*)) OVER (ORDER BY date_trunc('week', first_seen)) AS cumulative_providers
FROM first_activity
GROUP BY 1
ORDER BY 1
```

### 4.4 Service Category Popularity

```sql
SELECT
  CASE bytearray_to_uint256(bytearray_substring(data, 1, 32))
    WHEN 0 THEN 'Data Scraping'
    WHEN 1 THEN 'Translation'
    WHEN 2 THEN 'Writing'
    WHEN 3 THEN 'Coding'
    WHEN 4 THEN 'Research'
    WHEN 5 THEN 'Design'
    WHEN 6 THEN 'Marketing'
    WHEN 7 THEN 'Legal'
    WHEN 8 THEN 'Finance'
    WHEN 9 THEN 'Physical Task'
    WHEN 10 THEN 'Other'
  END AS category,
  COUNT(*) AS listing_count
FROM base.logs
WHERE contract_address = 0xa127B684935f1D24C7236ba1FbB3FF140F4eD3C3
  AND topic0 = keccak256('ListingCreated(uint256,address,uint8,uint256,address)')
GROUP BY 1
ORDER BY listing_count DESC
```

---

## Dashboard 5: Treasury & Governance

### 5.1 Treasury Inflows

```sql
SELECT
  date_trunc('week', block_time) AS week,
  bytearray_ltrim(topic1) AS token,
  SUM(bytearray_to_uint256(bytearray_substring(data, 1, 32)) / 1e18) AS total_received
FROM base.logs
WHERE contract_address = 0x9576dcf9909ec192FC136A12De293Efab911517f
  AND topic0 = keccak256('FundsReceived(address,address,uint256)')
GROUP BY 1, 2
ORDER BY 1
```

### 5.2 Governance Proposal Activity

```sql
SELECT
  date_trunc('month', block_time) AS month,
  COUNT(CASE WHEN topic0 = keccak256('ProposalCreated(uint256,address,address,address,uint256,string)') THEN 1 END) AS proposals_created,
  COUNT(CASE WHEN topic0 = keccak256('ProposalExecuted(uint256,address,uint256)') THEN 1 END) AS proposals_executed,
  COUNT(CASE WHEN topic0 = keccak256('ProposalCancelled(uint256,address)') THEN 1 END) AS proposals_cancelled
FROM base.logs
WHERE contract_address = 0x9576dcf9909ec192FC136A12De293Efab911517f
GROUP BY 1
ORDER BY 1
```

### 5.3 Active Payment Streams

```sql
SELECT
  bytearray_to_uint256(topic1) AS stream_id,
  bytearray_ltrim(topic2) AS recipient,
  bytearray_to_uint256(bytearray_substring(data, 33, 32)) / 1e18 AS total_amount,
  from_unixtime(bytearray_to_uint256(bytearray_substring(data, 65, 32))) AS start_time,
  from_unixtime(bytearray_to_uint256(bytearray_substring(data, 97, 32))) AS end_time,
  block_time AS created_at
FROM base.logs
WHERE contract_address = 0x9576dcf9909ec192FC136A12De293Efab911517f
  AND topic0 = keccak256('StreamCreated(uint256,address,address,uint256,uint256,uint256,string)')
ORDER BY block_time DESC
```

### 5.4 Bounty Program Tracking

```sql
SELECT
  date_trunc('month', block_time) AS month,
  COUNT(CASE WHEN topic0 = keccak256('BountyCreated(uint256,address,uint256,address)') THEN 1 END) AS bounties_created,
  COUNT(CASE WHEN topic0 = keccak256('BountyCompleted(uint256,address,uint256)') THEN 1 END) AS bounties_completed,
  COUNT(CASE WHEN topic0 = keccak256('BountyCancelled(uint256)') THEN 1 END) AS bounties_cancelled
FROM base.logs
WHERE contract_address = 0x9576dcf9909ec192FC136A12De293Efab911517f
GROUP BY 1
ORDER BY 1
```

---

## Dashboard 6: Airdrop & Vesting

### 6.1 Airdrop Claims by Tier

```sql
SELECT
  CASE bytearray_to_uint256(bytearray_substring(data, 97, 32))
    WHEN 0 THEN 'New'
    WHEN 1 THEN 'Active'
    WHEN 2 THEN 'Power User'
  END AS tier,
  COUNT(*) AS claims,
  SUM(bytearray_to_uint256(bytearray_substring(data, 1, 32)) / 1e18) AS total_allocated,
  SUM(bytearray_to_uint256(bytearray_substring(data, 33, 32)) / 1e18) AS immediate_release,
  SUM(bytearray_to_uint256(bytearray_substring(data, 1, 32)) / 1e18)
    - SUM(bytearray_to_uint256(bytearray_substring(data, 33, 32)) / 1e18) AS still_vesting
FROM base.logs
WHERE contract_address = 0x349790d7f56110765Fccd86790B584c423c0BaA9
  AND topic0 = keccak256('AirdropClaimed(address,uint256,uint256,uint8)')
GROUP BY 1
ORDER BY total_allocated DESC
```

### 6.2 Vesting Release Activity

```sql
SELECT
  date_trunc('week', block_time) AS week,
  COUNT(*) AS release_events,
  SUM(bytearray_to_uint256(bytearray_substring(data, 1, 32)) / 1e18) AS total_released
FROM base.logs
WHERE contract_address = 0x349790d7f56110765Fccd86790B584c423c0BaA9
  AND topic0 = keccak256('VestedTokensReleased(address,uint256)')
GROUP BY 1
ORDER BY 1
```

---

## Protocol Health: Master KPI Query

```sql
-- Single query for protocol-wide KPIs
SELECT
  (SELECT COUNT(*) FROM base.logs
   WHERE contract_address = 0xBB57d0D0aB24122A87c9a28acdc242927e6189E0
     AND topic0 = keccak256('JobCreated(uint256,uint256,address,address,uint256,address,uint256)')
  ) AS total_jobs_created,

  (SELECT COUNT(*) FROM base.logs
   WHERE contract_address = 0xBB57d0D0aB24122A87c9a28acdc242927e6189E0
     AND topic0 IN (
       keccak256('DeliveryConfirmed(uint256,address)'),
       keccak256('AutoReleased(uint256,address)')
     )
  ) AS total_jobs_completed,

  (SELECT COUNT(*) FROM base.logs
   WHERE contract_address = 0x00Ad7d299F4BF3aE8372f756b86B4dAf63eC3FAa
     AND topic0 = keccak256('DisputeCreated(uint256,uint256,address,address,uint256)')
  ) AS total_disputes,

  (SELECT COUNT(DISTINCT bytearray_ltrim(topic1)) FROM base.logs
   WHERE contract_address = 0x0c5bC27a3C3Eb7a836302320755f6B1645C49291
     AND topic0 = 0x9e71bc8eea02a63969f509818f2dafb9254532904319f9dbda79b67bd34a5f3d
  ) AS unique_stakers,

  (SELECT COUNT(DISTINCT bytearray_ltrim(topic1)) FROM base.logs
   WHERE contract_address = 0xc1374611FB7c6637e30a274073e7dCFf758C76FC
     AND topic0 = keccak256('CompletionRecorded(address,address)')
  ) AS active_providers,

  (SELECT COUNT(*) FROM base.logs
   WHERE contract_address = 0xa127B684935f1D24C7236ba1FbB3FF140F4eD3C3
     AND topic0 = keccak256('ListingCreated(uint256,address,uint8,uint256,address)')
  ) AS total_listings,

  (SELECT COUNT(*) FROM base.logs
   WHERE contract_address = 0xF43E6698cAAf3BFf422137F20541Cd24dfB3ff07
     AND topic0 = keccak256('AddressBanned(address,uint8,uint256,uint256)')
  ) AS total_bans,

  (SELECT COUNT(*) FROM base.logs
   WHERE contract_address = 0x349790d7f56110765Fccd86790B584c423c0BaA9
     AND topic0 = keccak256('AirdropClaimed(address,uint256,uint256,uint8)')
  ) AS total_airdrop_claims
```

---

## Dune API Integration

See `packages/web/src/lib/dune.ts` for the TypeScript client module.

### Environment Variables

```
DUNE_API_KEY=your_api_key_here
```

### Usage in Agents

```typescript
import { DuneClient, LOBSTR_QUERIES } from './dune';

const dune = new DuneClient(process.env.DUNE_API_KEY!);

// Execute a saved query
const results = await dune.executeQuery(LOBSTR_QUERIES.PROTOCOL_KPI);

// Get latest results (cached, no execution cost)
const cached = await dune.getLatestResults(LOBSTR_QUERIES.STAKING_TVL);
```

---

## Recommended Dashboards to Fork

| Dashboard | Creator | URL | Use For |
|-----------|---------|-----|---------|
| Base Chain Protocol Insights | @andree_web3 | [Link](https://dune.com/andree_web3/base-chain-protocol-insights-and-performance-dashboard) | Protocol TVL, activity, fees template |
| BASE Mainnet | @tk-research | [Link](https://dune.com/tk-research/base) | Base-wide metrics, add LOBSTR filters |
| Base Blockchain Overview | @sixdegree | [Link](https://dune.com/sixdegree/base-blockchain-overview) | Ecosystem view, agent growth charts |

---

## Quick Start

1. Sign up at [dune.com](https://dune.com) (free tier works)
2. Create a new query → select Base chain
3. Copy any query from this doc → paste → run
4. Visualize → add to dashboard
5. Set up materialized views for auto-refresh (hourly/daily)
6. Use Dune API to pipe metrics into agent monitoring

---

## Materialized Views (Scheduled Queries)

For production monitoring, create these as materialized views that auto-refresh:

```sql
-- Create as materialized view: "lobstr_daily_metrics"
-- Schedule: Every 6 hours
SELECT
  date_trunc('day', block_time) AS day,
  contract_address,
  topic0,
  COUNT(*) AS event_count
FROM base.logs
WHERE contract_address IN (
  0x7FaeC2536E2Afee56AcA568C475927F1E2521B37,  -- LOBToken
  0xc1374611FB7c6637e30a274073e7dCFf758C76FC,  -- ReputationSystem
  0x0c5bC27a3C3Eb7a836302320755f6B1645C49291,  -- StakingManager
  0x9576dcf9909ec192FC136A12De293Efab911517f,  -- TreasuryGovernor
  0xF43E6698cAAf3BFf422137F20541Cd24dfB3ff07,  -- SybilGuard
  0xa127B684935f1D24C7236ba1FbB3FF140F4eD3C3,  -- ServiceRegistry
  0x00Ad7d299F4BF3aE8372f756b86B4dAf63eC3FAa,  -- DisputeArbitration
  0xBB57d0D0aB24122A87c9a28acdc242927e6189E0,  -- EscrowEngine
  0x349790d7f56110765Fccd86790B584c423c0BaA9   -- AirdropClaimV2
)
GROUP BY 1, 2, 3
ORDER BY 1 DESC
```
