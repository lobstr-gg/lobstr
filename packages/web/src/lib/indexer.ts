const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL;

interface IndexerCounts {
  wallets: number;
  services: number;
  jobs: number;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function gqlFetch<T>(query: string): Promise<T> {
  if (!INDEXER_URL) throw new Error("NEXT_PUBLIC_INDEXER_URL not configured");

  const res = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Indexer responded ${res.status}`);

  const json: GraphQLResponse<T> = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error("No data returned from indexer");

  return json.data;
}

/** Safe wrapper that returns null instead of throwing */
async function gqlFetchSafe<T>(query: string): Promise<T | null> {
  try {
    return await gqlFetch<T>(query);
  } catch {
    return null;
  }
}

export async function fetchProtocolCounts(): Promise<IndexerCounts> {
  // Try totalCount first (Ponder v0.4+), fall back to items array length
  type CountResponse = {
    accounts?: { totalCount?: number; items?: unknown[] };
    listings?: { totalCount?: number; items?: unknown[] };
    jobs?: { totalCount?: number; items?: unknown[] };
  };

  const data = await gqlFetchSafe<CountResponse>(`{
    accounts { totalCount items { address } }
    listings(where: { active: true }) { totalCount items { id } }
    jobs { totalCount items { id } }
  }`);

  if (!data) return { wallets: 0, services: 0, jobs: 0 };

  const count = (entry?: { totalCount?: number; items?: unknown[] }) =>
    entry?.totalCount ?? entry?.items?.length ?? 0;

  return {
    wallets: count(data.accounts),
    services: count(data.listings),
    jobs: count(data.jobs),
  };
}

export function isIndexerConfigured(): boolean {
  return !!INDEXER_URL;
}

// ── Indexer types ────────────────────────────────────────

export interface IndexerListing {
  id: string;
  provider: string;
  category: number;
  title: string;
  description: string;
  pricePerUnit: string;
  settlementToken: string;
  estimatedDeliverySeconds: string;
  metadataURI: string;
  active: boolean;
  createdAt: string;
}

export interface IndexerJob {
  id: string;
  listingId: string;
  buyer: string;
  seller: string;
  amount: string;
  token: string;
  fee: string;
  status: number;
  createdAt: string;
  disputeWindowEnd: string;
  deliveryMetadataURI: string;
  isX402: boolean;
  x402Payer: string | null;
  x402Nonce: string | null;
}

export interface IndexerDispute {
  id: string;
  jobId: string;
  buyer: string;
  seller: string;
  amount: string;
  token: string;
  buyerEvidenceURI: string;
  sellerEvidenceURI: string;
  status: number;
  ruling: number;
  createdAt: string;
  counterEvidenceDeadline: string;
  arbitrator0: string | null;
  arbitrator1: string | null;
  arbitrator2: string | null;
  votesForBuyer: number;
  votesForSeller: number;
}

// ── Fetch functions ─────────────────────────────────────

export async function fetchListings(): Promise<IndexerListing[]> {
  type Response = {
    listings: { items: IndexerListing[] };
  };

  const data = await gqlFetchSafe<Response>(`{
    listings(orderBy: "createdAt", orderDirection: "desc", limit: 200) {
      items {
        id
        provider
        category
        title
        description
        pricePerUnit
        settlementToken
        estimatedDeliverySeconds
        metadataURI
        active
        createdAt
      }
    }
  }`);

  return data?.listings.items ?? [];
}

export async function fetchJobsForAddress(address: string): Promise<IndexerJob[]> {
  const addr = address.toLowerCase();

  type Response = {
    buyerJobs: { items: IndexerJob[] };
    sellerJobs: { items: IndexerJob[] };
  };

  const data = await gqlFetchSafe<Response>(`{
    buyerJobs: jobs(where: { buyer: "${addr}" }, orderBy: "createdAt", orderDirection: "desc", limit: 100) {
      items {
        id
        listingId
        buyer
        seller
        amount
        token
        fee
        status
        createdAt
        disputeWindowEnd
        deliveryMetadataURI
        isX402
        x402Payer
        x402Nonce
      }
    }
    sellerJobs: jobs(where: { seller: "${addr}" }, orderBy: "createdAt", orderDirection: "desc", limit: 100) {
      items {
        id
        listingId
        buyer
        seller
        amount
        token
        fee
        status
        createdAt
        disputeWindowEnd
        deliveryMetadataURI
        isX402
        x402Payer
        x402Nonce
      }
    }
  }`);

  if (!data) return [];

  // Deduplicate by id
  const map = new Map<string, IndexerJob>();
  for (const job of [...data.buyerJobs.items, ...data.sellerJobs.items]) {
    map.set(job.id, job);
  }
  return Array.from(map.values()).sort(
    (a, b) => Number(b.createdAt) - Number(a.createdAt)
  );
}

export async function fetchJobsForX402Payer(address: string): Promise<IndexerJob[]> {
  const addr = address.toLowerCase();

  type Response = {
    payerJobs: { items: IndexerJob[] };
  };

  const data = await gqlFetchSafe<Response>(`{
    payerJobs: jobs(where: { x402Payer: "${addr}" }, orderBy: "createdAt", orderDirection: "desc", limit: 100) {
      items {
        id
        listingId
        buyer
        seller
        amount
        token
        fee
        status
        createdAt
        disputeWindowEnd
        deliveryMetadataURI
        isX402
        x402Payer
        x402Nonce
      }
    }
  }`);

  return data?.payerJobs.items ?? [];
}

export async function fetchDisputesForAddress(address: string): Promise<IndexerDispute[]> {
  const addr = address.toLowerCase();

  type Response = {
    buyerDisputes: { items: IndexerDispute[] };
    sellerDisputes: { items: IndexerDispute[] };
    arb0Disputes: { items: IndexerDispute[] };
    arb1Disputes: { items: IndexerDispute[] };
    arb2Disputes: { items: IndexerDispute[] };
  };

  const data = await gqlFetchSafe<Response>(`{
    buyerDisputes: disputes(where: { buyer: "${addr}" }, orderBy: "createdAt", orderDirection: "desc", limit: 50) {
      items {
        id jobId buyer seller amount token
        buyerEvidenceURI sellerEvidenceURI
        status ruling createdAt counterEvidenceDeadline
        arbitrator0 arbitrator1 arbitrator2
        votesForBuyer votesForSeller
      }
    }
    sellerDisputes: disputes(where: { seller: "${addr}" }, orderBy: "createdAt", orderDirection: "desc", limit: 50) {
      items {
        id jobId buyer seller amount token
        buyerEvidenceURI sellerEvidenceURI
        status ruling createdAt counterEvidenceDeadline
        arbitrator0 arbitrator1 arbitrator2
        votesForBuyer votesForSeller
      }
    }
    arb0Disputes: disputes(where: { arbitrator0: "${addr}" }, orderBy: "createdAt", orderDirection: "desc", limit: 50) {
      items {
        id jobId buyer seller amount token
        buyerEvidenceURI sellerEvidenceURI
        status ruling createdAt counterEvidenceDeadline
        arbitrator0 arbitrator1 arbitrator2
        votesForBuyer votesForSeller
      }
    }
    arb1Disputes: disputes(where: { arbitrator1: "${addr}" }, orderBy: "createdAt", orderDirection: "desc", limit: 50) {
      items {
        id jobId buyer seller amount token
        buyerEvidenceURI sellerEvidenceURI
        status ruling createdAt counterEvidenceDeadline
        arbitrator0 arbitrator1 arbitrator2
        votesForBuyer votesForSeller
      }
    }
    arb2Disputes: disputes(where: { arbitrator2: "${addr}" }, orderBy: "createdAt", orderDirection: "desc", limit: 50) {
      items {
        id jobId buyer seller amount token
        buyerEvidenceURI sellerEvidenceURI
        status ruling createdAt counterEvidenceDeadline
        arbitrator0 arbitrator1 arbitrator2
        votesForBuyer votesForSeller
      }
    }
  }`);

  if (!data) return [];

  // Deduplicate
  const map = new Map<string, IndexerDispute>();
  for (const d of [
    ...data.buyerDisputes.items,
    ...data.sellerDisputes.items,
    ...data.arb0Disputes.items,
    ...data.arb1Disputes.items,
    ...data.arb2Disputes.items,
  ]) {
    map.set(d.id, d);
  }
  return Array.from(map.values()).sort(
    (a, b) => Number(b.createdAt) - Number(a.createdAt)
  );
}

// ── New V2 Indexer Types ─────────────────────────────────

export interface IndexerReview {
  id: string;
  jobId: string;
  reviewer: string;
  subject: string;
  rating: number;
  metadataURI: string;
  timestamp: string;
}

export interface IndexerLoan {
  id: string;
  borrower: string;
  lender: string | null;
  principal: string;
  interestAmount: string;
  collateralAmount: string;
  totalRepaid: string;
  status: number;
  term: number;
  requestedAt: string;
  fundedAt: string;
  dueDate: string;
}

export interface IndexerSkill {
  id: string;
  seller: string;
  assetType: number;
  pricingModel: number;
  price: string;
  title: string;
  metadataURI: string;
  active: boolean;
  totalPurchases: number;
  createdAt: string;
}

export interface IndexerSubscription {
  id: string;
  buyer: string;
  seller: string;
  token: string;
  amount: string;
  interval: string;
  status: number;
  cyclesCompleted: string;
  maxCycles: string;
  nextDue: string;
  listingId: string;
  metadataURI: string;
  createdAt: string;
}

export interface IndexerCreditLine {
  id: string;
  creditLimit: string;
  totalDrawn: string;
  totalRepaid: string;
  interestRateBps: string;
  collateralDeposited: string;
  status: number;
  openedAt: string;
  defaults: number;
  activeDraws: number;
}

export interface IndexerAppeal {
  id: string;
  disputeId: string;
  appellant: string;
  bondAmount: string;
  eventType: string;
  timestamp: string;
  blockNumber: string;
}

export interface IndexerMultiPartyGroup {
  id: string;
  buyer: string;
  token: string;
  totalAmount: string;
  jobCount: number;
  metadataURI: string;
  completed: boolean;
  createdAt: string;
}

export interface IndexerAccount {
  address: string;
  lobBalance: string;
  stakeAmount: string;
  stakeTier: number;
  reputationScore: string;
  reputationTier: number;
  completions: number;
  disputesWon: number;
  disputesLost: number;
  isArbitrator: boolean;
  arbitratorStake: string;
  arbitratorRank: number;
  createdAt: string;
}

// ── New V2 Fetch Functions ──────────────────────────────

export async function fetchReviews(limit = 50): Promise<IndexerReview[]> {
  type Response = { reviews: { items: IndexerReview[] } };
  const data = await gqlFetchSafe<Response>(`{
    reviews(orderBy: "timestamp", orderDirection: "desc", limit: ${limit}) {
      items { id jobId reviewer subject rating metadataURI timestamp }
    }
  }`);
  return data?.reviews.items ?? [];
}

export async function fetchReviewsForAddress(address: string): Promise<IndexerReview[]> {
  const addr = address.toLowerCase();
  type Response = {
    given: { items: IndexerReview[] };
    received: { items: IndexerReview[] };
  };
  const data = await gqlFetchSafe<Response>(`{
    given: reviews(where: { reviewer: "${addr}" }, orderBy: "timestamp", orderDirection: "desc", limit: 100) {
      items { id jobId reviewer subject rating metadataURI timestamp }
    }
    received: reviews(where: { subject: "${addr}" }, orderBy: "timestamp", orderDirection: "desc", limit: 100) {
      items { id jobId reviewer subject rating metadataURI timestamp }
    }
  }`);
  if (!data) return [];
  const map = new Map<string, IndexerReview>();
  for (const r of [...data.given.items, ...data.received.items]) map.set(r.id, r);
  return Array.from(map.values()).sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
}

export async function fetchLoans(limit = 50): Promise<IndexerLoan[]> {
  type Response = { loans: { items: IndexerLoan[] } };
  const data = await gqlFetchSafe<Response>(`{
    loans(orderBy: "createdAt", orderDirection: "desc", limit: ${limit}) {
      items { id borrower lender principal interestAmount collateralAmount totalRepaid status term requestedAt fundedAt dueDate }
    }
  }`);
  return data?.loans.items ?? [];
}

export async function fetchLoansForAddress(address: string): Promise<IndexerLoan[]> {
  const addr = address.toLowerCase();
  type Response = {
    borrowerLoans: { items: IndexerLoan[] };
    lenderLoans: { items: IndexerLoan[] };
  };
  const data = await gqlFetchSafe<Response>(`{
    borrowerLoans: loans(where: { borrower: "${addr}" }, orderBy: "createdAt", orderDirection: "desc", limit: 50) {
      items { id borrower lender principal interestAmount collateralAmount totalRepaid status term requestedAt fundedAt dueDate }
    }
    lenderLoans: loans(where: { lender: "${addr}" }, orderBy: "createdAt", orderDirection: "desc", limit: 50) {
      items { id borrower lender principal interestAmount collateralAmount totalRepaid status term requestedAt fundedAt dueDate }
    }
  }`);
  if (!data) return [];
  const map = new Map<string, IndexerLoan>();
  for (const l of [...data.borrowerLoans.items, ...data.lenderLoans.items]) map.set(l.id, l);
  return Array.from(map.values()).sort((a, b) => Number(b.requestedAt) - Number(a.requestedAt));
}

export async function fetchSkills(limit = 100): Promise<IndexerSkill[]> {
  type Response = { skills: { items: IndexerSkill[] } };
  const data = await gqlFetchSafe<Response>(`{
    skills(where: { active: true }, orderBy: "totalPurchases", orderDirection: "desc", limit: ${limit}) {
      items { id seller assetType pricingModel price title metadataURI active totalPurchases createdAt }
    }
  }`);
  return data?.skills.items ?? [];
}

export async function fetchSubscriptionsForAddress(address: string): Promise<IndexerSubscription[]> {
  const addr = address.toLowerCase();
  type Response = {
    buyerSubs: { items: IndexerSubscription[] };
    sellerSubs: { items: IndexerSubscription[] };
  };
  const data = await gqlFetchSafe<Response>(`{
    buyerSubs: subscriptions(where: { buyer: "${addr}" }, orderBy: "createdAt", orderDirection: "desc", limit: 50) {
      items { id buyer seller token amount interval status cyclesCompleted maxCycles nextDue listingId metadataURI createdAt }
    }
    sellerSubs: subscriptions(where: { seller: "${addr}" }, orderBy: "createdAt", orderDirection: "desc", limit: 50) {
      items { id buyer seller token amount interval status cyclesCompleted maxCycles nextDue listingId metadataURI createdAt }
    }
  }`);
  if (!data) return [];
  const map = new Map<string, IndexerSubscription>();
  for (const s of [...data.buyerSubs.items, ...data.sellerSubs.items]) map.set(s.id, s);
  return Array.from(map.values()).sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

export async function fetchAccount(address: string): Promise<IndexerAccount | null> {
  const addr = address.toLowerCase();
  type Response = { account: IndexerAccount | null };
  const data = await gqlFetchSafe<Response>(`{
    account(id: "${addr}") {
      address lobBalance stakeAmount stakeTier
      reputationScore reputationTier completions
      disputesWon disputesLost isArbitrator
      arbitratorStake arbitratorRank createdAt
    }
  }`);
  return data?.account ?? null;
}

export async function fetchLeaderboard(limit = 100): Promise<IndexerAccount[]> {
  type Response = { accounts: { items: IndexerAccount[] } };
  const data = await gqlFetchSafe<Response>(`{
    accounts(orderBy: "reputationScore", orderDirection: "desc", limit: ${limit}) {
      items {
        address lobBalance stakeAmount stakeTier
        reputationScore reputationTier completions
        disputesWon disputesLost isArbitrator
        arbitratorStake arbitratorRank createdAt
      }
    }
  }`);
  return data?.accounts.items ?? [];
}

export async function fetchAppeals(limit = 50): Promise<IndexerAppeal[]> {
  type Response = { appeals: { items: IndexerAppeal[] } };
  const data = await gqlFetchSafe<Response>(`{
    appeals(orderBy: "createdAt", orderDirection: "desc", limit: ${limit}) {
      items { id disputeId appellant bondAmount eventType timestamp blockNumber }
    }
  }`);
  return data?.appeals.items ?? [];
}

// ── Skill Marketplace Queries ────────────────────────────

export interface IndexerSkillPurchase {
  id: string;
  skillId: string;
  buyer: string;
  accessId: string;
  pricingModel: number;
  amount: string;
  timestamp: string;
  blockNumber: string;
}

export interface IndexerSkillUsageEvent {
  id: string;
  accessId: string;
  skillId: string;
  calls: string;
  cost: string;
  timestamp: string;
  blockNumber: string;
}

export interface IndexerSkillCreditEvent {
  id: string;
  eventType: string;
  account: string;
  token: string;
  amount: string;
  timestamp: string;
  blockNumber: string;
}

export async function fetchSkillsForSeller(address: string): Promise<IndexerSkill[]> {
  const addr = address.toLowerCase();
  type Response = { skills: { items: IndexerSkill[] } };
  const data = await gqlFetchSafe<Response>(`{
    skills(where: { seller: "${addr}" }, orderBy: "createdAt", orderDirection: "desc", limit: 100) {
      items { id seller assetType pricingModel price title metadataURI active totalPurchases createdAt }
    }
  }`);
  return data?.skills.items ?? [];
}

export async function fetchSkillPurchases(buyer: string): Promise<IndexerSkillPurchase[]> {
  const addr = buyer.toLowerCase();
  type Response = { skillPurchases: { items: IndexerSkillPurchase[] } };
  const data = await gqlFetchSafe<Response>(`{
    skillPurchases(where: { buyer: "${addr}" }, orderBy: "timestamp", orderDirection: "desc", limit: 200) {
      items { id skillId buyer accessId pricingModel amount timestamp blockNumber }
    }
  }`);
  return data?.skillPurchases.items ?? [];
}

export async function fetchSkillUsage(skillId: string): Promise<IndexerSkillUsageEvent[]> {
  type Response = { skillUsageEvents: { items: IndexerSkillUsageEvent[] } };
  const data = await gqlFetchSafe<Response>(`{
    skillUsageEvents(where: { skillId: "${skillId}" }, orderBy: "timestamp", orderDirection: "desc", limit: 500) {
      items { id accessId skillId calls cost timestamp blockNumber }
    }
  }`);
  return data?.skillUsageEvents.items ?? [];
}

export async function fetchSkillCreditEvents(account: string): Promise<IndexerSkillCreditEvent[]> {
  const addr = account.toLowerCase();
  type Response = { skillCreditEvents: { items: IndexerSkillCreditEvent[] } };
  const data = await gqlFetchSafe<Response>(`{
    skillCreditEvents(where: { account: "${addr}" }, orderBy: "timestamp", orderDirection: "desc", limit: 200) {
      items { id eventType account token amount timestamp blockNumber }
    }
  }`);
  return data?.skillCreditEvents.items ?? [];
}

export async function fetchProtocolCountsV2(): Promise<{
  wallets: number;
  services: number;
  jobs: number;
  disputes: number;
  reviews: number;
  loans: number;
  skills: number;
  subscriptions: number;
}> {
  type CountResponse = {
    accounts?: { totalCount?: number; items?: unknown[] };
    listings?: { totalCount?: number; items?: unknown[] };
    jobs?: { totalCount?: number; items?: unknown[] };
    disputes?: { totalCount?: number; items?: unknown[] };
    reviews?: { totalCount?: number; items?: unknown[] };
    loans?: { totalCount?: number; items?: unknown[] };
    skills?: { totalCount?: number; items?: unknown[] };
    subscriptions?: { totalCount?: number; items?: unknown[] };
  };

  const data = await gqlFetchSafe<CountResponse>(`{
    accounts { totalCount items { address } }
    listings(where: { active: true }) { totalCount items { id } }
    jobs { totalCount items { id } }
    disputes { totalCount items { id } }
    reviews { totalCount items { id } }
    loans { totalCount items { id } }
    skills(where: { active: true }) { totalCount items { id } }
    subscriptions { totalCount items { id } }
  }`);

  if (!data) return { wallets: 0, services: 0, jobs: 0, disputes: 0, reviews: 0, loans: 0, skills: 0, subscriptions: 0 };

  const count = (entry?: { totalCount?: number; items?: unknown[] }) =>
    entry?.totalCount ?? entry?.items?.length ?? 0;

  return {
    wallets: count(data.accounts),
    services: count(data.listings),
    jobs: count(data.jobs),
    disputes: count(data.disputes),
    reviews: count(data.reviews),
    loans: count(data.loans),
    skills: count(data.skills),
    subscriptions: count(data.subscriptions),
  };
}
