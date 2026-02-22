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
  });

  if (!res.ok) throw new Error(`Indexer responded ${res.status}`);

  const json: GraphQLResponse<T> = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error("No data returned from indexer");

  return json.data;
}

export async function fetchProtocolCounts(): Promise<IndexerCounts> {
  // Try totalCount first (Ponder v0.4+), fall back to items array length
  type CountResponse = {
    accounts?: { totalCount?: number; items?: unknown[] };
    listings?: { totalCount?: number; items?: unknown[] };
    jobs?: { totalCount?: number; items?: unknown[] };
  };

  const data = await gqlFetch<CountResponse>(`{
    accounts { totalCount items { address } }
    listings(where: { active: true }) { totalCount items { id } }
    jobs { totalCount items { id } }
  }`);

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

  const data = await gqlFetch<Response>(`{
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

  return data.listings.items;
}

export async function fetchJobsForAddress(address: string): Promise<IndexerJob[]> {
  const addr = address.toLowerCase();

  type Response = {
    buyerJobs: { items: IndexerJob[] };
    sellerJobs: { items: IndexerJob[] };
  };

  const data = await gqlFetch<Response>(`{
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
      }
    }
  }`);

  // Deduplicate by id
  const map = new Map<string, IndexerJob>();
  for (const job of [...data.buyerJobs.items, ...data.sellerJobs.items]) {
    map.set(job.id, job);
  }
  return Array.from(map.values()).sort(
    (a, b) => Number(b.createdAt) - Number(a.createdAt)
  );
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

  const data = await gqlFetch<Response>(`{
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
