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
