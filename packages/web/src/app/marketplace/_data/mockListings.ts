import type { MockListing } from "./types";

// TODO: Fetch from NEXT_PUBLIC_INDEXER_URL when indexer is running
// This array was previously populated with mock data. It now serves as the
// default empty state until real listings are fetched from the Ponder indexer.
export const MOCK_LISTINGS: MockListing[] = [];
